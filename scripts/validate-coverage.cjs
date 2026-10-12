#!/usr/bin/env node
/**
 * Zero-dependency gate: validates the "machine-checkable coverage record (audit-coverage)"
 * block at the end of a risk report.
 *
 * Two tiers of capability (see README and agents/security-reviewer.md):
 *   Tier 0 cross-checks (default, always on):
 *     1. Body P0 row count <-> go_no_go (a P0 means No-Go; No-Go needs at least one P0)
 *     2. finding_ids <-> same-named IDs in the body tables (exact cell match, no substring loophole)
 *     3. status <-> the authoritative level x check matrix (out-of-level groups must be
 *        not_applicable; a "check" group may not be downgraded to quick_clean)
 *     4. The body must contain the "Checked, not found / Not applicable" section and a filled-in
 *        Go/No-Go verdict, and the verdict must match the JSON
 *   Tier 1 evidence chain (mandatory at L2+; optional at L0/L1 but validated when present):
 *     clean / quick_clean groups must carry evidence:
 *       { "kind": "command", "cmd": "...", "result": "..." }       mechanical tool, re-runnable
 *       { "kind": "pointer", "pointer": "path/to/file.ext:123" }   code anchor; the script verifies
 *                                                                  the path and line really exist
 *       { "kind": "both", ... }                                    both of the above
 *     unconfirmed groups must carry a blocker: { "missing": "...", "what_to_ask_user": "..." }
 *
 * Usage: node scripts/validate-coverage.cjs security/risk-report.md
 *        (a .json file may also be passed; body cross-checks are skipped then)
 * Exit code 0 = valid; 1 = errors.
 * Regression self-test: node scripts/selftest.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPORT_VERSION = 2;
const GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const STATUS = ['clean', 'quick_clean', 'findings', 'not_applicable', 'unconfirmed'];
const GROUP_NAME = {
  A: 'Secret leakage', B: 'Authentication', C: 'IDOR', D: 'Injection', E: 'Deployment & config',
  F: 'Dependencies & supply chain', G: 'Business logic & payments', H: 'Privacy & data',
  I: 'AI usage safety', J: 'Mobile & APK',
};

// Machine-readable copy of the authoritative level x check matrix (agents/security-reviewer.md).
// check=Check / quick=Quick-check / na=Not applicable / money=If money involved / cond=Check if mobile present
const MATRIX = {
  L0: { A: 'check', B: 'na', C: 'na', D: 'na', E: 'quick', F: 'na', G: 'na', H: 'na', I: 'check', J: 'cond' },
  L1: { A: 'check', B: 'check', C: 'check', D: 'check', E: 'check', F: 'quick', G: 'na', H: 'quick', I: 'check', J: 'cond' },
  L2: { A: 'check', B: 'check', C: 'check', D: 'check', E: 'check', F: 'check', G: 'money', H: 'check', I: 'check', J: 'cond' },
  L3: { A: 'check', B: 'check', C: 'check', D: 'check', E: 'check', F: 'check', G: 'check', H: 'check', I: 'check', J: 'cond' },
};
const ALLOWED_BY_CELL = {
  check: ['clean', 'findings', 'unconfirmed'],
  quick: ['quick_clean', 'clean', 'findings', 'unconfirmed'],
  na: ['not_applicable'],
  money: ['clean', 'quick_clean', 'findings', 'unconfirmed', 'not_applicable'],
  condMobile: ['clean', 'quick_clean', 'findings', 'unconfirmed'],
};
const FENCE = '```';
const JSON_FENCE = FENCE + 'json';

// Common "non-path" candidates inside pointer prose, filtered out so they don't get
// mistaken for evidence anchors: IPv4:port (0.0.0.0:3000), URL/absolute-path fragments
// (//a.com:8080, /etc/x.conf:1), and words with no path separator and an uncommon extension (db.internal:5432).
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const KNOWN_EXTS = new Set(('js mjs cjs ts tsx jsx vue svelte py rb go java kt kts swift rs c h cc cpp cs php lua sql sh ps1 bat ' +
  'json yaml yml toml xml html css scss less md txt env ini cfg conf properties gradle plist smali proto lock sum mod tf csv').split(' '));

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  console.error('Usage: node scripts/validate-coverage.cjs <risk-report.md or .json>');
  process.exit(1);
}

let src;
try {
  src = fs.readFileSync(file, 'utf8');
} catch (e) {
  console.error(`Cannot read ${file}: ${e.message}`);
  process.exit(1);
}

// Extract every ```json block containing report_version; take the last one (the one at the end of the report).
const blocks = [...src.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)]
  .filter((m) => m[1].includes('"report_version"'));
if (!blocks.length && !src.trimStart().startsWith('{')) {
  console.error('validate-coverage: no "machine-checkable coverage record (audit-coverage)" JSON block found - add one containing "report_version" at the end of the report per the template, or pass a .json file directly.');
  process.exit(1);
}
const lastBlock = blocks.length ? blocks[blocks.length - 1] : null;
const raw = lastBlock ? lastBlock[1] : src;

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  console.error(`validate-coverage: JSON parse failed - ${e.message}`);
  process.exit(1);
}

const errors = [];
const isMd = lastBlock !== null;

// Body boundary: everything before the start of the last coverage block (fixes the false
// failure where an unrelated json example pasted into the body truncated the body).
const body = isMd ? src.slice(0, lastBlock.index) : null;

// ---------- Report project root: <project>/security/risk-report.md ----------
const reportDir = path.dirname(path.resolve(file));
const projectRoot = path.basename(reportDir) === 'security' ? path.dirname(reportDir) : reportDir;

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', '.next', 'vendor', 'target']);
function collectFiles(dir, depth = 0, acc = []) {
  if (depth > 5 || acc.length > 20000) return acc;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) collectFiles(p, depth + 1, acc); }
    else acc.push(p);
  }
  return acc;
}
const projectFiles = isMd ? collectFiles(projectRoot) : [];
const relFiles = new Set(projectFiles.map((p) => path.relative(projectRoot, p)));

const MOBILE_HINTS = [/^AndroidManifest\.xml$/, /\.gradle$/, /\.gradle\.kts$/, /\.smali$/, /\.apk$/, /^Info\.plist$/];
const mobileArtifacts = [...relFiles].filter((f) => MOBILE_HINTS.some((re) => re.test(path.basename(f))));
const hasMobile = mobileArtifacts.length > 0;

// ---------- Structural checks ----------
if (data.report_version !== REPORT_VERSION) {
  errors.push(`report_version must be ${REPORT_VERSION}, got: ${JSON.stringify(data.report_version)}` +
    (data.report_version === 1
      ? ' (v1 is the old format, without evidence/blocker fields). Two possibilities: (1) this report is a leftover produced by the old flow -> re-run the review and rewrite the coverage block per the latest template; (2) the SKILL.md / security-reviewer.md installed in your host is still the old version (manually copied copies do not auto-upgrade) -> re-install from this repo first, otherwise it will keep producing v1 reports'
      : ''));
}
if (typeof data.level !== 'string' || !/^L[0-3]$/.test(data.level)) {
  errors.push(`level must be L0-L3, got: ${JSON.stringify(data.level)}`);
}
if (data.go_no_go !== 'Go' && data.go_no_go !== 'No-Go') {
  errors.push(`go_no_go must be "Go" or "No-Go", got: ${JSON.stringify(data.go_no_go)}`);
}
const level = /^L[0-3]$/.test(data.level) ? data.level : null;

// Finding IDs in the body tables (exact cell match, no substring loophole).
// Section-aware: the P0 count only counts table rows inside the "## P0" section; IDs inside
// the "Remediation tracking" table do not count toward this review - otherwise an omitted
// unfixed P0 would be masked by the previous report's IDs, and the Go/No-Go error text would be polluted.
const bodyIds = new Set();
const sectionIds = { P0: new Set(), P1: new Set(), P2: new Set() };
const overdue = [];
if (isMd) {
  let cur = '';
  for (const line of body.split('\n')) {
    const h = line.match(/^##\s+(.*)/);
    if (h) { cur = h[1].trim(); continue; }
    const m = line.match(/^\|\s*(P[012]-\d+)\s*\|/);
    if (!m) continue;
    const id = m[1];
    bodyIds.add(id);
    const sec = id.slice(0, 2);
    if (cur.startsWith(sec)) sectionIds[sec].add(id);
    if (/remediation/i.test(cur)) {
      const st = line.match(/^\|\s*P0-\d+\s*\|[^|]*\|[^|]*?(Not fixed|Partially fixed)/);
      if (st) overdue.push({ id, status: st[1] });
    }
  }
}
const bodyP0Rows = sectionIds.P0.size;

if (typeof data.groups !== 'object' || data.groups === null || Array.isArray(data.groups)) {
  errors.push('groups must be an object');
} else {
  const claimedIds = new Set();
  for (const g of GROUPS) {
    const entry = data.groups[g];
    const label = `${g} ${GROUP_NAME[g]}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`groups.${g} missing (every group A-J must carry a verdict; silent skips are forbidden)`);
      continue;
    }
    if (!STATUS.includes(entry.status)) {
      errors.push(`groups.${g}.status invalid: ${JSON.stringify(entry.status)} (allowed: ${STATUS.join(' / ')})`);
      continue;
    }
    const st = entry.status;

    // ---- Tier 0 (3): status <-> authoritative matrix ----
    if (level) {
      let cell = MATRIX[level][g];
      const allowed = cell === 'cond'
        ? (isMd ? (hasMobile ? ALLOWED_BY_CELL.condMobile : ['not_applicable']) : null)
        : ALLOWED_BY_CELL[cell];
      if (cell === 'cond' && !isMd) {
        if (st === 'not_applicable' && typeof entry.reason !== 'string') {
          errors.push(`groups.${g}.status is not_applicable but needs a reason (e.g. "no mobile")`);
        }
      } else if (allowed && !allowed.includes(st)) {
        const why = cell === 'cond' && !hasMobile
          ? `no mobile project found in this repo (AndroidManifest.xml / *.gradle / *.smali / Info.plist); group J must be marked not_applicable with a reason`
          : `the level x check matrix requires group ${label} at ${level} to be "${cellLabel(cell)}"; status can only be ${allowed.join(' / ')}`;
        errors.push(`groups.${g}.status="${st}" conflicts with the matrix: ${why}`);
      }
    }

    // ---- findings: must have finding_ids, and IDs must appear exactly in the body tables ----
    if (st === 'findings') {
      if (!Array.isArray(entry.finding_ids) || entry.finding_ids.length === 0) {
        errors.push(`groups.${g}.status is findings but must give finding_ids`);
      } else {
        for (const id of entry.finding_ids) {
          claimedIds.add(String(id));
          if (!/^P[012]-\d+$/.test(String(id))) {
            errors.push(`${JSON.stringify(id)} in groups.${g}.finding_ids is not a valid ID (should look like P0-1)`);
          } else if (isMd && !bodyIds.has(String(id))) {
            const near = [...bodyIds].filter((b) => b.startsWith(String(id)));
            errors.push(`finding_id ${id} does not appear exactly in the body P0-P2 tables${near.length ? ` (body only has ${near.join(', ')})` : ''} (false-claim check)`);
          } else if (isMd && !sectionIds[String(id).slice(0, 2)].has(String(id))) {
            errors.push(`finding_id ${id} does not appear in the body's "${id.slice(0, 2)}" level table - cross-level references are forbidden (a P0 ID sitting in the P1/P2 table = verdict downgrade)`);
          }
        }
      }
    }

    // ---- not_applicable: must have a reason ----
    if (st === 'not_applicable' && typeof entry.reason !== 'string') {
      errors.push(`groups.${g}.status is not_applicable but must give a reason (e.g. "L1")`);
    }

    // ---- Tier 1: unconfirmed must have a blocker ----
    if (st === 'unconfirmed') {
      if (!entry.blocker || typeof entry.blocker !== 'object' || typeof entry.blocker.missing !== 'string' || !entry.blocker.missing.trim()) {
        errors.push(`groups.${g}.status is unconfirmed but must give a blocker ({"missing": "what is needed to confirm", "what_to_ask_user": "what the user should do"}) - "unconfirmed" must state the blocker; never use it as a free pass`);
      }
    }

    // ---- Tier 1: clean / quick_clean must carry evidence (mandatory at L2+) ----
    if (st === 'clean' || st === 'quick_clean') {
      const ev = entry.evidence;
      if (ev === undefined || ev === null) {
        if (level === 'L2' || level === 'L3') {
          errors.push(`groups.${g}.status="${st}" but evidence is missing: every "${st}" group at ${level} must carry evidence (kind=command gives a re-runnable command + result; kind=pointer gives file:line)`);
        }
      } else {
        checkEvidence(g, ev, errors);
      }
    }
  }

  for (const extra of Object.keys(data.groups).filter((k) => !GROUPS.includes(k))) {
    errors.push(`unknown group in groups: ${extra} (only A-J allowed)`);
  }
}

// ---------- Tier 0 (1): body P0 row count <-> go_no_go, plus overdue-P0 omission check ----------
if (isMd) {
  if (data.go_no_go === 'Go' && bodyP0Rows > 0) {
    errors.push(`self-contradictory verdict: the current P0 table has ${bodyP0Rows} P0 rows (${[...sectionIds.P0].join(', ')}), yet go_no_go is "Go" - any unfixed P0 means No-Go`);
  }
  if (data.go_no_go === 'No-Go' && bodyP0Rows === 0) {
    errors.push('go_no_go is "No-Go" but the current P0 table has no P0 rows - the verdict lacks grounds (No-Go needs at least one P0 to support it)');
  }
  // Remediation tracking: a previous P0 marked "Not fixed / Partially fixed" must appear in the current P0 table (blocks the "omission" escape).
  for (const o of overdue) {
    if (!sectionIds.P0.has(o.id)) {
      errors.push(`${o.id} (${o.status}) from the remediation tracking table is missing from the current P0 table - a previous unfixed P0 must not vanish from this report (omission = remediation tracking broken)`);
    }
  }

  // ---------- Tier 0 (4): section and verdict existence ----------
  if (!/##\s*Checked, not found/.test(body)) {
    errors.push('the body lacks a "## Checked, not found / Not applicable" section - the only basis for distinguishing "secure" from "unchecked"; never omit it');
  }
  const conclusion = [...body.matchAll(/Verdict[:：]\s*\*{0,2}\s*(Go|No-Go)/g)]
    .map((m) => ({ v: m[1], tail: body.slice(m.index + m[0].length, m.index + m[0].length + 3) }))
    .filter((x) => !/^\s*\/\s*No-Go/.test(x.tail));
  if (!conclusion.length) {
    errors.push('the body lacks a filled-in Go/No-Go verdict (the template\'s "**Verdict: Go / No-Go**" placeholder does not count as filled)');
  } else if (data.go_no_go && conclusion[conclusion.length - 1].v !== data.go_no_go) {
    errors.push(`verdict conflicts with the coverage block: the body says "${conclusion[conclusion.length - 1].v}", go_no_go says ${JSON.stringify(data.go_no_go)}`);
  }
  const headerLevel = body.match(/Project level[:：]\s*\*{0,2}\s*L([0-3])/);
  if (!headerLevel) {
    errors.push('the report header lacks "Project level: L?"');
  } else if (level && headerLevel[1] !== level[1]) {
    errors.push(`level (${level}) does not match the report header (L${headerLevel[1]})`);
  }
}

// ---------- Evidence validation ----------
function checkEvidence(g, ev, errors) {
  const tag = `groups.${g}.evidence`;
  if (typeof ev !== 'object' || Array.isArray(ev)) { errors.push(`${tag} must be an object`); return; }
  const kind = ev.kind;
  if (!['command', 'pointer', 'both'].includes(kind)) {
    errors.push(`${tag}.kind invalid: ${JSON.stringify(kind)} (allowed: command / pointer / both)`);
    return;
  }
  if (kind === 'command' || kind === 'both') {
    if (typeof ev.cmd !== 'string' || !ev.cmd.trim()) errors.push(`${tag} kind=command requires cmd (the command actually run)`);
    if (typeof ev.result !== 'string' || !ev.result.trim()) errors.push(`${tag} kind=command requires result (a summary of the command output; the user can re-run to compare)`);
  }
  if (kind === 'pointer' || kind === 'both') {
    const ptrs = Array.isArray(ev.pointer) ? ev.pointer : (typeof ev.pointer === 'string' ? [ev.pointer] : []);
    if (!ptrs.length) { errors.push(`${tag} kind=pointer requires pointer ("file:line", may be an array)`); return; }
    for (const p of ptrs) {
      const refs = [...String(p).matchAll(/([A-Za-z0-9_@./\-]+\.[A-Za-z0-9]+):(\d+)/g)]
        .map((r) => ({ rel: r[1].replace(/^\.\//, ''), line: Number(r[2]) }))
        .filter(({ rel }) => {
          if (IPV4_RE.test(rel) || rel.startsWith('/')) return false;
          const ext = rel.includes('.') ? rel.split('.').pop().toLowerCase() : '';
          return rel.includes('/') || KNOWN_EXTS.has(ext);
        });
      if (!refs.length) { errors.push(`${tag} pointer ${JSON.stringify(String(p).slice(0, 60))} contains no verifiable "file:line"`); continue; }
      for (const { rel, line: lineNo } of refs) {
        const abs = path.resolve(projectRoot, rel);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
          errors.push(`${tag} pointer points to a non-existent file: ${rel} (relative to project root ${path.relative(process.cwd(), projectRoot) || '.'})`);
          continue;
        }
        let lines;
        try { lines = fs.readFileSync(abs, 'utf8').split('\n'); } catch { continue; }
        if (lineNo < 1 || lineNo > lines.length) {
          errors.push(`${tag} pointer line number out of range: ${rel}:${lineNo} (that file has only ${lines.length} lines)`);
        } else if (!lines[lineNo - 1].trim()) {
          errors.push(`${tag} pointer points to a blank line: ${rel}:${lineNo}`);
        }
      }
    }
  }
}

function cellLabel(cell) {
  return { check: 'Check', quick: 'Quick-check', na: 'Not applicable', money: 'If money involved', cond: 'Check if mobile present' }[cell] || cell;
}

// ---------- Output ----------
if (errors.length) {
  console.error(`validate-coverage: FAIL, ${errors.length} error(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
const evidenceCount = Object.values(data.groups).filter((v) => v && v.evidence).length;
console.log(`validate-coverage: PASS (${data.level}, go_no_go=${data.go_no_go}, all ten groups A-J covered, ` +
  `cross-checks passed${isMd ? `, body P0 rows=${bodyP0Rows}` : ' (json input, body checks skipped)'}` +
  `${evidenceCount ? `, groups with evidence=${evidenceCount}` : ''}${hasMobile ? ', mobile project detected' : ''}).`);

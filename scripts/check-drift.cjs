#!/usr/bin/env node
/**
 * Zero-dependency drift check: agents/security-reviewer.md is the single source of truth for
 * the checklist (groups A-J), the level x check matrix, the P0/P1/P2 verdicts, and the report
 * template.
 *
 * Coverage scope (important): compares only the **key fragments** already aligned verbatim
 * (P0/P1/P2 verdict long lines, the level x check matrix rows, quick-check/conditional-group
 * notes, the mechanical-first probe openers, the global-auth-layer precondition, the secret
 * patterns line, connection-string/obfuscated-credentials probes, J-group rules, the coverage
 * JSON status note) and key markers (baseline anti-tampering, not-applicable labeling, the
 * coverage JSON section, the source-of-truth pointer, the free-pass rule, the re-run
 * backfill duty, the scope statements). The rest of the checklist body is not compared;
 * syncing it is manual + code review. Also verifies: the audit-coverage JSON template block is
 * verbatim-identical across the four copies (BLOCK check), and the machine-readable MATRIX
 * copy in validate-coverage.cjs matches the authoritative matrix (MATRIX check).
 *
 * Files checked: skills/secure-pipeline/SKILL.md, prompts/security-review-prompt.md,
 * adapt/codex/security-review-prompt.md (fragment-level); the three condensed snippets
 * (codex/AGENTS-snippet.md, cursor/secure-pipeline.mdc, gemini/GEMINI-snippet.md, key markers
 * only); README.md (Chinese scope statement) and README.en.md (English scope statement).
 *
 * Usage: node scripts/check-drift.cjs   (run from the repo root)
 * Exit code 0 = consistent; 1 = drift found.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REVIEWER = 'agents/security-reviewer.md';
const PROMPT = 'prompts/security-review-prompt.md';
const CODEX = 'adapt/codex/security-review-prompt.md';
const SKILL = 'skills/secure-pipeline/SKILL.md';
const VC = 'scripts/validate-coverage.cjs';
const README_FILES = ['README.md', 'README.en.md'];
const SNIPPETS = [
  'adapt/codex/AGENTS-snippet.md',
  'adapt/cursor/secure-pipeline.mdc',
  'adapt/gemini/GEMINI-snippet.md',
];

const files = {};
for (const p of [REVIEWER, PROMPT, CODEX, SKILL, VC, ...SNIPPETS, ...README_FILES]) {
  try {
    files[p] = fs.readFileSync(path.join(ROOT, p), 'utf8').split('\n');
  } catch (e) {
    console.error(`Cannot read ${p}: ${e.message}`);
    process.exit(1);
  }
}

// Normalization: strip leading list/number prefixes ("- ", "2. "), merge whitespace runs,
// then trim - used for verbatim cross-file line comparison.
const norm = (s) => s.replace(/[ \t]+/g, ' ').trim().replace(/^(?:- |\d+\.\s*)/, '');

const errors = [];

// Type 1 (EQUAL): extract fragment lines from the authoritative file by a line-start regex;
// the target files must contain the same lines (verbatim after normalization, same order, same count).
const EQUAL_RULES = [
  { re: /^- \*\*P0 — Blocks launch\*\*/, targets: [PROMPT, CODEX], what: 'P0 verdict long line' },
  { re: /^- \*\*P1 — Fix soon\*\*/, targets: [PROMPT, CODEX], what: 'P1 verdict long line' },
  { re: /^- \*\*P2 — Suggestion\*\*/, targets: [PROMPT, CODEX], what: 'P2 verdict long line' },
  { re: /^(?:- |\d+\.\s*)?\*\*Any unfixed P0 means the verdict is No-Go\.\*\*/, targets: [PROMPT, CODEX], what: 'No-Go iron rule' },
  { re: /^(?:- |\d+\.\s*)?\*\*Walk the checklist, no sampling\*\*/, targets: [PROMPT, CODEX], what: 'walk-the-checklist iron rule' },
  { re: /^\| Group \| L0/, targets: [PROMPT, CODEX], what: 'level x check matrix header' },
  { re: /^\| [A-J] /, targets: [PROMPT, CODEX], what: 'level x check matrix rows' },
  { re: /^Quick-check sub-items:/, targets: [PROMPT, CODEX], what: 'quick-check sub-items note' },
  { re: /^Conditional group:/, targets: [PROMPT, CODEX], what: 'conditional-group note' },
  { re: /^Probe \(\*\*mechanical first\*\*\)/, targets: [PROMPT, CODEX], what: 'A/F mechanical-first probe openers' },
  { re: /^\*\*Precondition: find the global auth layer first/, targets: [PROMPT, CODEX], what: 'group C global-auth-layer precondition' },
  { re: /^- Grep for hard-coded secret patterns/, targets: [PROMPT, CODEX], what: 'secret pattern list line' },
  { re: /^- Search for credentials embedded in connection strings/, targets: [PROMPT, CODEX], what: 'connection-string probe line' },
  { re: /^- Obfuscated credentials:/, targets: [PROMPT, CODEX], what: 'obfuscated-credentials probe line' },
  { re: /^Applicability: this group is mandatory when the target repository contains a mobile project/, targets: [PROMPT, CODEX], what: 'group J applicability line' },
  { re: /^- Hard-coded credentials: search `strings\.xml`/, targets: [PROMPT, CODEX], what: 'group J hard-coded credentials probe line' },
  { re: /^Verdict: hard-coded credentials in APK\/mobile code/, targets: [PROMPT, CODEX], what: 'group J verdict line' },
  { re: /^\(status values:/, targets: [PROMPT, CODEX], what: 'coverage JSON status-values note' },
];

// Type 2 (CONTAIN): the target files must contain this pattern (verbatim match not required).
const CONTAIN_RULES = [
  { re: /baseline modified with no change log/, targets: [REVIEWER, PROMPT, CODEX, SKILL], what: 'baseline anti-tampering rule' },
  { re: /not applicable at this level/, targets: [REVIEWER, PROMPT, CODEX, SKILL], what: 'not-applicable labeling' },
  { re: /audit-coverage/, targets: [REVIEWER, PROMPT, CODEX, SKILL], what: 'coverage JSON section' },
  { re: /agents\/security-reviewer\.md/, targets: [PROMPT, CODEX, SKILL], what: 'source-of-truth pointer' },
  { re: /single source of truth/, targets: [REVIEWER, SKILL], what: 'source-of-truth statement' },
  { re: /not a free pass/, targets: [REVIEWER, PROMPT, CODEX, SKILL], what: 'evidence / free-pass rule' },
  { re: /(re-run and backfill|re-runs command-type evidence)/, targets: [REVIEWER, SKILL], what: 'command-evidence backfill duty' },
  { re: /it does not constitute a final statement that the project is "secure"/, targets: [REVIEWER, PROMPT, CODEX, SKILL], what: 'report scope statement' },
  { re: /never (?:quote the full secret|the full value)/i, targets: [REVIEWER, PROMPT], what: 'secret re-leak discipline' },
  { re: /中转站/, targets: ['README.md'], what: 'relay exposure warning (Chinese)' },
  { re: /API relays \/ unofficial/, targets: [SKILL, 'README.en.md'], what: 'relay exposure warning (English)' },
  { re: /不代表攻击面已覆盖/, targets: ['README.md'], what: 'coverage-honesty note (Chinese)' },
  { re: /not that the attack surface is fully covered/, targets: [SKILL, 'README.en.md'], what: 'coverage-honesty note (English)' },
  { re: /仅用于你拥有或获得授权的项目/, targets: ['README.md'], what: 'authorization-scope note (Chinese)' },
  { re: /only on projects you own or are authorized/, targets: [SKILL, 'README.en.md'], what: 'authorization-scope note (English)' },
  { re: /不能作为最终安全防护手段/, targets: ['README.md'], what: 'project scope statement (Chinese)' },
  { re: /NOT a final security defense/, targets: [SKILL, 'README.en.md'], what: 'project scope statement (English)' },
];

const matchLines = (lines, re) => lines.filter((l) => re.test(l)).map(norm);

for (const rule of EQUAL_RULES) {
  const base = matchLines(files[REVIEWER], rule.re);
  if (base.length === 0) {
    errors.push(`[source missing] no line matching "${rule.what}" (/${rule.re.source}/) in ${REVIEWER}.`);
    continue;
  }
  for (const target of rule.targets) {
    const got = matchLines(files[target], rule.re);
    if (got.length !== base.length) {
      errors.push(`[drift] "${rule.what}" appears ${got.length} time(s) in ${target}, but ${base.length} in the source of truth.`);
      continue;
    }
    for (let i = 0; i < base.length; i++) {
      if (got[i] !== base[i]) {
        errors.push(`[drift] "${rule.what}" line ${i + 1} differs from the source of truth:\n  source: ${base[i]}\n  ${target}: ${got[i]}`);
      }
    }
  }
}

for (const rule of CONTAIN_RULES) {
  for (const target of rule.targets) {
    if (!files[target].some((l) => rule.re.test(l))) {
      errors.push(`[missing] "${rule.what}" (/${rule.re.source}/) not found in ${target}.`);
    }
  }
}

// Type 3 (BLOCK): the audit-coverage JSON template block (with the evidence / blocker schema)
// must be verbatim-identical across the four copies. Extracts the content lines of the last
// json block containing "report_version" (skipping the outer ````markdown fence).
const coverageBlockLines = (lines) => {
  let found = null;
  for (let i = 0; i < lines.length; i++) {
    if (!/^```json/.test(lines[i].trim())) continue;
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^```\s*$/.test(lines[j].trim())) { end = j; break; }
    }
    if (end < 0) continue;
    const content = lines.slice(i + 1, end);
    if (content.some((l) => l.includes('"report_version"'))) found = content.map(norm);
  }
  return found;
};

const baseBlock = coverageBlockLines(files[REVIEWER]);
if (!baseBlock || !baseBlock.length) {
  errors.push(`[source missing] no coverage JSON template block (a json block containing "report_version") in ${REVIEWER}.`);
} else {
  for (const target of [PROMPT, CODEX, SKILL]) {
    const got = coverageBlockLines(files[target]);
    if (!got || !got.length) {
      errors.push(`[missing] no coverage JSON template block in ${target}.`);
      continue;
    }
    if (got.length !== baseBlock.length) {
      errors.push(`[drift] coverage JSON template block line count differs: source of truth has ${baseBlock.length} lines, ${target} has ${got.length}.`);
      continue;
    }
    for (let i = 0; i < baseBlock.length; i++) {
      if (got[i] !== baseBlock[i]) {
        errors.push(`[drift] coverage JSON template block line ${i + 1} differs from the source of truth:\n  source: ${baseBlock[i]}\n  ${target}: ${got[i]}`);
      }
    }
  }
}

// Type 4 (MATRIX): the machine-readable matrix in validate-coverage.cjs must match the
// authoritative matrix.
const CELL_MAP = { Check: 'check', 'Quick-check': 'quick', 'Not applicable': 'na', 'If money involved': 'money', 'Check if mobile present': 'cond' };
const mdMatrix = {};
for (const l of files[REVIEWER]) {
  const m = norm(l).match(/^\| ([A-J]) [^|]+\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|$/);
  if (m) mdMatrix[m[1]] = [m[2], m[3], m[4], m[5]].map((c) => CELL_MAP[c.trim()]);
}
const jsMatrix = {};
for (const l of files[VC]) {
  const row = l.match(/^\s{2}L(\d):\s*\{(.+)\},?\s*$/);
  if (row) {
    jsMatrix['L' + row[1]] = {};
    for (const p of row[2].matchAll(/([A-J]):\s*'([a-z]+)'/g)) jsMatrix['L' + row[1]][p[1]] = p[2];
  }
}
if (Object.keys(mdMatrix).length !== 10) {
  errors.push(`[source missing] the level x check matrix in ${REVIEWER} parsed into ${Object.keys(mdMatrix).length} rows (expected A-J, ten rows).`);
} else if (Object.keys(jsMatrix).length !== 4) {
  errors.push(`[missing] the MATRIX copy in ${VC} parsed into ${Object.keys(jsMatrix).length} levels (expected L0-L3, four).`);
} else {
  for (const lv of ['L0', 'L1', 'L2', 'L3']) {
    for (const g of Object.keys(mdMatrix)) {
      const mdCell = mdMatrix[g][Number(lv[1])];
      const jsCell = jsMatrix[lv] && jsMatrix[lv][g];
      if (mdCell !== jsCell) {
        errors.push(`[drift] MATRIX copy conflicts with the authoritative matrix: group ${g} at ${lv} script=${jsCell || 'missing'}, authoritative=${mdCell} (after changing the level x check matrix you must sync the MATRIX in ${VC}).`);
      }
    }
  }
}

if (errors.length) {
  console.error(`check-drift: found ${errors.length} drift/missing issue(s):`);
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('check-drift: PASS. The authoritative fragments are consistent across the four files; no drift.');

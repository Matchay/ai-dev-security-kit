#!/usr/bin/env node
/**
 * Gate regression self-test: freezes every adversarial experiment that could bypass the
 * gate into assertions, to prevent validate-coverage from regressing.
 *
 * Usage: node scripts/selftest.cjs        (--keep keeps the temp directories)
 * Exit code 0 = all passed; 1 = at least one case failed.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const VC = path.join(__dirname, 'validate-coverage.cjs');
const KEEP = process.argv.includes('--keep');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-selftest-'));
const FENCE = '```';
const JFENCE = FENCE + 'json';

// ---------- Build the sample project ----------
const APP_JS = [
  "const express = require('express');",           // 1
  "const app = express();",                        // 2
  "app.use(express.json({ limit: '100kb' }));",    // 3
  "app.use(helmet());",                            // 4
  "app.use(cors({ origin: ['https://a.com'] }));", // 5
  "// auth",                                       // 6
  "const { requireAuth } = require('./middleware/auth');", // 7
  "// mounts",                                     // 8
  "// ...",                                        // 9
  "app.use('/api', requireAuth);",                 // 10
  "app.use('/api/orders', require('./routes/orders'));", // 11
  "app.listen(3000);",                             // 12
  "module.exports = app;",                         // 13
].join('\n') + '\n';

const ORDERS_JS = [
  "const router = require('express').Router();",   // 1
  "const { db } = require('../db');",              // 2
  "router.get('/:id', async (req, res) => {",      // 3
  "  const r = await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);", // 4
  "  res.json(r.rows[0]);",                        // 5
  "});",                                           // 6
  "module.exports = router;",                      // 7
].join('\n') + '\n';

function mkProject(name, { mobile = false } = {}) {
  const dir = path.join(TMP, name);
  fs.mkdirSync(path.join(dir, 'src', 'routes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), APP_JS);
  fs.writeFileSync(path.join(dir, 'src', 'routes', 'orders.js'), ORDERS_JS);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"t","version":"1.0.0"}\n');
  if (mobile) {
    fs.mkdirSync(path.join(dir, 'app', 'src', 'main'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'app', 'src', 'main', 'AndroidManifest.xml'), '<manifest />\n');
    fs.writeFileSync(path.join(dir, 'app', 'build.gradle'), 'android { }\n');
  }
  fs.mkdirSync(path.join(dir, 'security'), { recursive: true });
  return dir;
}

// One-shot fully compliant group set (a compliant L2 sample)
const evPtr = (p) => ({ kind: 'pointer', pointer: p });
const evCmd = (cmd, result) => ({ kind: 'command', cmd, result });
const cleanGroups = () => ({
  A: { status: 'clean', evidence: evCmd('gitleaks detect --no-banner', 'no leaks found (13 files scanned)') },
  B: { status: 'clean', evidence: evPtr("src/app.js:10 app.use('/api', requireAuth)") },
  C: { status: 'clean', evidence: evPtr('src/routes/orders.js:4 ownership condition user_id, parameterized query') },
  D: { status: 'clean', evidence: evPtr('src/routes/orders.js:4 fully parameterized $1/$2') },
  E: { status: 'clean', evidence: evCmd("grep -rn 'NODE_ENV|debug' src/", 'no debug switch') },
  F: { status: 'clean', evidence: evCmd('npm audit', 'found 0 vulnerabilities') },
  G: { status: 'not_applicable', reason: 'L2 with no money involved (no payment SDK, no balance fields)' },
  H: { status: 'clean', evidence: evPtr('src/app.js:3 request body capped at 100kb; no extra personal data collected') },
  I: { status: 'clean', evidence: evPtr('src/app.js:4 no AI services integrated') },
  J: { status: 'not_applicable', reason: 'no mobile project' },
});

function reportBody({ level, rows = [], checked = '## Checked, not found / Not applicable\n- [Checked, not found] Hard-coded secrets: grepped the whole repo for secret patterns; no real secrets found.\n', conclusion = '**Verdict: No-Go**', extra = '' }) {
  const table = (arr) => arr.length ? ['| # | Location | Risk | Plain-language explanation | Suggested fix | Checklist item |', '|---|---|---|---|---|---|', ...arr].join('\n') : '(none)';
  return [
    '# Pre-Launch Risk Report (security/risk-report.md)',
    `- Project level: ${level}`,
    '- Review date: 2026-01-01',
    '- Review scope: src/',
    '- Review method: static only',
    '- Baseline comparison: no baseline, level re-assessed by questionnaire',
    extra,
    '## P0 — Blocks launch',
    table(rows.filter((r) => r.includes('| P0-'))),
    '',
    '## P1 — Fix soon',
    table(rows.filter((r) => r.includes('| P1-'))),
    '',
    '## P2 — Suggestions',
    table(rows.filter((r) => r.includes('| P2-'))),
    '',
    checked,
    '## Go / No-Go verdict',
    conclusion,
    'Rationale: see tables above.',
    '',
    '## Machine-checkable coverage record (audit-coverage)',
    JFENCE,
    '__COVERAGE__',
    FENCE,
  ].join('\n') + '\n';
}

function writeCase(name, body, { coverage, mobile = false, asJson = false }) {
  const dir = mkProject(name, { mobile });
  if (asJson) {
    fs.writeFileSync(path.join(dir, 'security', 'risk-report.json'), JSON.stringify(coverage, null, 2));
    return path.join(dir, 'security', 'risk-report.json');
  }
  const md = body.replace('__COVERAGE__', JSON.stringify(coverage, null, 2));
  const p = path.join(dir, 'security', 'risk-report.md');
  fs.writeFileSync(p, md);
  return p;
}

// ---------- Case table ----------
const P0_ROW = '| P0-1 | src/app.js:10 | IDOR | swap the ID and you see another user\'s order | add an ownership condition | C |';
const cases = [];
const C = (name, expectExit, expectErr, p) => cases.push({ name, expectExit, expectErr, p });

// —— Tier 0 cross-checks ——
C('P0 table non-empty but verdict Go (adversarial test 1)', 1, /any unfixed P0 means No-Go/,
  writeCase('t0-p0-go', reportBody({
    level: 'L2', rows: [P0_ROW], conclusion: '**Verdict: Go**',
  }), { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } }, go_no_go: 'Go' } }));

C('No-Go without any P0 row', 1, /verdict lacks grounds/,
  writeCase('t0-nogo-no-p0', reportBody({ level: 'L2' }),
    { coverage: { ...cov(), groups: { ...cleanGroups() }, go_no_go: 'No-Go' } }));

C('Unrelated json example pasted into the body (adversarial test 2; report itself consistent)', 0, null,
  writeCase('t0-stray-json', reportBody({
    level: 'L2', rows: [P0_ROW], conclusion: '**Verdict: No-Go**',
    extra: ['Decompiled snippet:', '', JFENCE, '{"host":"db.internal","port":5432}', FENCE, ''].join('\n'),
  }), { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('finding_id appears only as a substring (adversarial test 6 / R3)', 1, /false-claim check/,
  writeCase('t0-id-substring', reportBody({
    level: 'L2', rows: ['| P0-10 | src/app.js:10 | IDOR | x | y | C |'],
  }), { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('L0 but B/C/D marked clean (matrix = not applicable)', 1, /conflicts with the matrix/,
  writeCase('t0-matrix-na', reportBody({ level: 'L0', conclusion: '**Verdict: Go**' }),
    { coverage: { ...cov(), level: 'L0', go_no_go: 'Go', groups: { A: { status: 'clean' }, B: { status: 'clean' }, C: { status: 'clean' }, D: { status: 'clean' }, E: { status: 'quick_clean' }, F: { status: 'not_applicable', reason: 'L0' }, G: { status: 'not_applicable', reason: 'L0' }, H: { status: 'not_applicable', reason: 'L0' }, I: { status: 'clean' }, J: { status: 'not_applicable', reason: 'no mobile' } } } }));

C('L2 downgrades H to quick_clean (matrix = check)', 1, /conflicts with the matrix/,
  writeCase('t0-matrix-quick', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] }, H: { status: 'quick_clean', evidence: evPtr('src/app.js:3 request body capped at 100kb') } } } }));

C('The whole "Checked, not found / Not applicable" section deleted (adversarial test 5)', 1, /lacks a "## Checked, not found/,
  writeCase('t0-no-checked-section', reportBody({ level: 'L2', rows: [P0_ROW], checked: '' }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Body verdict conflicts with the coverage block', 1, /verdict conflicts with the coverage block/,
  writeCase('t0-conclusion-mismatch', reportBody({ level: 'L2', rows: [P0_ROW], conclusion: '**Verdict: Go**' }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('level conflicts with the report header', 1, /does not match the report header/,
  writeCase('t0-level-header', reportBody({ level: 'L1', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

// —— Tier 1 evidence chain ——
C('clean group at L2 without evidence', 1, /evidence is missing/,
  writeCase('t1-no-evidence', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), A: { status: 'clean' }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('evidence.pointer points to a non-existent file', 1, /non-existent file/,
  writeCase('t1-bad-pointer', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('src/nope.js:3 global auth') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('evidence.pointer line number out of range', 1, /out of range/,
  writeCase('t1-line-overflow', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('src/app.js:999 global auth') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('kind=command without result', 1, /requires result/,
  writeCase('t1-cmd-no-result', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), A: { status: 'clean', evidence: { kind: 'command', cmd: 'gitleaks detect' } }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('All ten groups unconfirmed with no blocker (adversarial test 3)', 1, /must give a blocker/,
  writeCase('t1-all-unconfirmed', reportBody({ level: 'L2' }),
    { coverage: { ...cov(), go_no_go: 'No-Go', groups: Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map((g) => [g, { status: 'unconfirmed' }])) } }));

C('Legacy report_version=1', 1, /report_version must be 2/,
  writeCase('t1-legacy', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), report_version: 1, groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

// —— Cases that must pass ——
C('Fully compliant L2 report (evidence, matrix-consistent, has P0 so No-Go)', 0, null,
  writeCase('ok-l2', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('L1 report: L0/L1 are exempt from the evidence requirement', 0, null,
  writeCase('ok-l1', reportBody({ level: 'L1', conclusion: '**Verdict: Go**' }),
    { coverage: { report_version: 2, level: 'L1', baseline_version: 'v1', go_no_go: 'Go', groups: { A: { status: 'clean' }, B: { status: 'clean' }, C: { status: 'clean' }, D: { status: 'clean' }, E: { status: 'clean' }, F: { status: 'quick_clean' }, G: { status: 'not_applicable', reason: 'L1 no money' }, H: { status: 'quick_clean' }, I: { status: 'clean' }, J: { status: 'not_applicable', reason: 'no mobile' } } } }));

C('unconfirmed group with a blocker passes', 0, null,
  writeCase('ok-unconfirmed-blocker', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'unconfirmed', blocker: { missing: 'backend auth middleware code', what_to_ask_user: 'add src/middleware/auth.js and re-review' } }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Repo contains a mobile project: group J may not be not_applicable (adversarial test 4)', 1, /conflicts with the matrix/,
  writeCase('t0-j-mobile', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { mobile: true, coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Repo contains a mobile project and group J has a verdict -> passes', 0, null,
  writeCase('ok-j-mobile', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { mobile: true, coverage: { ...cov(), groups: { ...cleanGroups(), J: { status: 'clean', evidence: evPtr('app/src/main/AndroidManifest.xml:1 no debuggable/cleartext') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('json input (body checks skipped)', 0, null,
  writeCase('ok-json', '', { asJson: true, coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Invalid status', 1, /status invalid/,
  writeCase('t0-bad-status', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), A: { status: 'safe' }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Unknown group K', 1, /unknown group/,
  writeCase('t0-unknown-group', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), K: { status: 'clean' }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

// —— False-positive regression: pseudo-anchors in pointer prose must not block ——
C('pointer prose containing IP:port is not falsely blocked', 0, null,
  writeCase('ok-ptr-ip', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('src/app.js:10 server listens on 0.0.0.0:3000') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('pointer prose containing host:port is not falsely blocked', 0, null,
  writeCase('ok-ptr-host', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('src/app.js:10 connection string points to db.internal:5432 on the private network') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('pointer prose containing a URL with a port is not falsely blocked', 0, null,
  writeCase('ok-ptr-url', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('src/app.js:10 docs at https://example.com:8080/x') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('pointer with only IP:port and no real anchor', 1, /contains no verifiable/,
  writeCase('t1-ptr-only-ip', reportBody({ level: 'L2', rows: [P0_ROW] }),
    { coverage: { ...cov(), groups: { ...cleanGroups(), B: { status: 'clean', evidence: evPtr('server listens on 0.0.0.0:3000') }, C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

// —— R1 fix regression: section awareness ——
C('Previous unfixed P0 omitted from the current P0 table (R1 adversarial test 7)', 1, /must not vanish from this report/,
  writeCase('t0-overdue-omit', reportBody({
    level: 'L2', rows: [], conclusion: '**Verdict: No-Go**',
    extra: ['## Remediation tracking from previous review', '| ID | Previous verdict | This time | Evidence |', '|---|---|---|---|', '| P0-1 | previous finding | Not fixed | src/app.js:88 |', ''].join('\n'),
  }), { coverage: { ...cov(), groups: { ...cleanGroups() } } }));

C('P0 ID sitting in the P1 table (cross-level reference = verdict downgrade, R1 adversarial test 8)', 1, /cross-level references/,
  writeCase('t0-cross-level', [
    '# Pre-Launch Risk Report (security/risk-report.md)',
    '- Project level: L2',
    '## P0 — Blocks launch',
    '(none)',
    '## P1 — Fix soon',
    '| P0-1 | src/app.js:10 | IDOR | x | y | C |',
    '## Checked, not found / Not applicable',
    '- [Checked, not found] group A',
    '## Go / No-Go verdict',
    '**Verdict: No-Go**',
    JFENCE,
    '__COVERAGE__',
    FENCE,
  ].join('\n') + '\n',
  { coverage: { ...cov(), groups: { ...cleanGroups(), C: { status: 'findings', finding_ids: ['P0-1'] } } } }));

C('Go + empty current P0 table + previous unfixed P0 omitted (R1 escape combo; the omission check alone must catch it)', 1, /must not vanish from this report/,
  writeCase('t0-overdue-go', reportBody({
    level: 'L2', rows: [], conclusion: '**Verdict: Go**',
    extra: ['## Remediation tracking from previous review', '| ID | Previous verdict | This time | Evidence |', '|---|---|---|---|', '| P0-1 | previous finding | Not fixed | src/app.js:88 |', ''].join('\n'),
  }), { coverage: { ...cov(), go_no_go: 'Go', groups: { ...cleanGroups() } } }));

function cov() {
  return { report_version: 2, level: 'L2', baseline_version: 'v1', go_no_go: 'No-Go' };
}

// ---------- Run ----------
let pass = 0;
const failed = [];
for (const c of cases) {
  let code = 0, out = '';
  try {
    out = execFileSync('node', [VC, c.p], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status === undefined ? 1 : e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  const okExit = code === c.expectExit;
  const okMsg = !c.expectErr || c.expectErr.test(out);
  if (okExit && okMsg) { pass++; console.log(`  ✓ ${c.name}`); }
  else {
    failed.push({ ...c, code, out });
    console.log(`  ✗ ${c.name}\n     expected exit=${c.expectExit}${c.expectErr ? ` and /${c.expectErr.source}/` : ''}, got exit=${code}`);
    console.log(`     output: ${out.trim().split('\n').slice(0, 3).join(' | ')}`);
  }
}
console.log(`\nselftest: ${pass}/${cases.length} passed${failed.length ? `, ${failed.length} failed` : ''}.`);
if (KEEP) console.log(`temp directories: ${TMP}`);
else fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);

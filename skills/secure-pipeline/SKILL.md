---
name: secure-pipeline
description: An AI development security gate pipeline for all developers — especially those writing code with AI. Use when a user designs or develops web apps, APIs, mini-programs, backend services, or APK/mobile apps with AI, involving sign-up/login, payments, databases, or deployment. The AI should follow this pipeline throughout the entire development process, not wait until the user asks "is it secure?" — set the security level and red lines at design time, self-check against the hard rules after every piece of generated code, run an independent security review with a risk report before launch, and inspect on a regular cadence after launch.
---

# Security Gate Pipeline

**A security reminder for every developer**: whether you're a senior engineer or a product
person / founder who builds with AI without writing code yourself — if AI-generated code
will face real users, this pipeline applies to you. AI will write code for you, but it will
not bear the consequences of a security incident for you.
If you're experienced, treat this as a pre-launch checklist to run through quickly; if you're
just starting out, follow it step by step.
You are the operator of this pipeline: follow it throughout, not only when asked.
Explain jargon in one plain sentence the first time it appears.

**⚠️ Scope statement**: This pipeline exists **only to reduce risk points in development deliverables**. It is **NOT a final security defense**. Given today's LLMs' strong reverse-engineering and adversarial capabilities, model-based review can miss, misreport, or be circumvented — **for real protection, use professional solutions** (professional penetration testing, security audit teams, defense-in-depth products such as WAF/SCA). Go/No-Go only reflects whether this checklist pass was clean; it does not mean the project is "secure". A clean pass means only that this checklist found nothing - not that the attack surface is fully covered. Use this pipeline only on projects you own or are authorized to test.

**Data-flow notice**: using this pipeline means your code flows to LLM services — redact before pasting or dispatching. **API relays / unofficial third-party endpoints add an untrusted middleman with materially higher exposure risk (logging, resale, abuse) — for sensitive code use official channels or other pre-checks instead.**

## a) Pipeline overview

Core principle in one line: **Draw the red lines at design time. Stop the risks at the release gate.**

```
                    ┌────────────────────────────────────────┐
                    │ Draw red lines at design. Stop risks    │
                    │ at the release gate.                    │
                    └────────────────────────────────────────┘
                                     │
  Gate ① Design ───► Gate ② Coding ───► Gate ③ Launch ───► Gate ④ Operations
  Self-assess        Follow rules       Independent        Scheduled
  level              while coding       review             inspections
  Write baseline     Self-check after   Write report       Re-level triggers
                     every generation                          (back to Gate ①)
        │                  │                 │                 │
        ▼                  ▼                 ▼                 ▼
  security/          Item-by-item       security/          Cadence table +
  design-baseline.md self-report        risk-report.md     re-level rules
                                        in chat
```

Two artifacts written to disk (into the user's project, not into chat):
- `security/design-baseline.md` — produced at Gate ①, the design baseline, the reference standard for every later audit.
- `security/risk-report.md` — produced at Gate ③, the risk report, with the Go/No-Go verdict.

## b) Which gate am I on?

At the start of every new task, decide the current gate by these criteria — **do not ask the user "which stage are you on"**:

1. `security/design-baseline.md` does not exist, and the user just proposed building an app/feature
   → Gate ① (Design). Start with the level self-assessment.
2. The baseline exists or the user is already writing feature code (code files exist, or APIs/pages/table schemas are being discussed)
   → Gate ② (Coding). Generate code under the hard rules and self-check after every generation.
3. The user mentions launch, deployment, release, buying a domain, provisioning a server, app-store submission, or adding payments
   → Gate ③ (Launch). Run the independent review.
4. `security/risk-report.md` exists with a Go verdict, and the user is doing post-launch maintenance/new features
   → Gate ④ (Operations) stacked on Gate ②; when user volume or money involvement changes, return to Gate ① to re-assess the level.

After deciding, **confirm the gate in one sentence**, e.g. "You're at Gate ①: let's spend two minutes setting the security level."
Do not explain the pipeline at length; do not interrupt the user's product-building rhythm.

## c) Gate ① Design: set the level, draw the red lines

### Step 1: Level self-assessment (6-question questionnaire)

Ask the user item by item; infer directly from context where possible; only ask what's missing:

1. Open registration? (anyone can sign up)
2. Real users? (not just yourself or demo use)
3. Personal information collected? (phone number, email, ID number, address, location, avatar, etc.)
4. Payments/funds involved? (charging, withdrawals, balances, coupons, cashback)
5. Business/commercial? (charging externally, or serving companies/clients)
6. Expected user scale? (tens / hundreds / tens of thousands)

### Step 2: Determine L0-L3 by the matrix logic

| Level | Criteria | Typical state |
|---|---|---|
| **L0 Prototype/Toy** | All no; or self-use, demo, hackathon demo only, no real users | Self-use, demo |
| **L1 Private beta / small scope** | Real users, but no open registration, no money, no personal information collected | Friends / seed-user testing |
| **L2 Public launch MVP** | Open registration, or personal information collected, or user-uploaded content, not yet involving money | Public MVP, starting to build a user base |
| **L3 At scale / money / sensitive data** | Payments/funds involved, or business clients, or large amounts of sensitive personal information | Payments & withdrawals, commercial |

Rule: take the highest tier among the six answers. When unsure, **round up**.
What goes into the baseline is the verdict + rationale (citing the six answers), not just a letter.

### Step 3: Produce `security/design-baseline.md`

Create the `security/` directory and write the template below, filled in. Mark vague user answers as "unconfirmed"; do not invent on their behalf.

```markdown
# Design Baseline (security/design-baseline.md)

> This is the project's security design baseline. Every later launch audit compares against it:
> failing to do what the baseline promises, or doing what the baseline says not to do, counts as a finding.

- Version: v1 (+1 each time a commitment is changed)
- Written on:

## 1. Project level determination

| Question | Answer | Impact |
|---|---|---|
| Open registration? | Yes/No | |
| Real users? | Yes/No | |
| Personal information collected? | Yes/No, what exactly | |
| Payments/funds? | Yes/No | |
| Business/commercial? | Yes/No | |
| Expected user scale | | |

**Verdict: L? (?)**
Rationale: (cite the answers above; one sentence on why this tier)

## 2. Input surface inventory

List every place "external data enters the system". (An entry = a place users can stuff data into)

| Entry (page/API/form) | Data types | Trust level | Validation strategy |
|---|---|---|---|
| Example: POST /api/login | email, password | Untrusted | Email format, password length 8-64, rate limit 5/min |
| | | | |

Trust level has exactly two values: Untrusted (from users/network/third parties), Trusted (generated internally).

## 3. Permission matrix

| Role | Resource | Read | Write | Ownership check method |
|---|---|---|---|---|
| Guest | | | | |
| Logged-in user | Own orders | Yes | Yes | Query carries a user_id condition |
| Admin | | | | Separate admin-identity check |

## 4. Secrets inventory

| Secret name | Purpose | Storage location | Rotation period |
|---|---|---|---|
| Example: STRIPE_SECRET | Payments | Server-side environment variables | Quarterly |
| | | | |

Storage locations allowed: server-side environment variables, cloud secret management services. **Forbidden**: frontend code, the repository, chat logs.

## 5. Data explicitly not collected (minimization commitment)

- Committed not to collect: (e.g. ID numbers, contact lists, precise location, ID photos uploaded by users…)
- What isn't collected can't leak. Later audits will check "was anything secretly collected".

## 6. Change log

| Date | Version | Change | Reason |
|---|---|---|---|
| | | Initial version written | |
```

**Baseline anti-tampering rule**: the baseline must not be silently modified after being written. Any change to a commitment must: increment the version number, and record the date and reason in the change log. If an audit finds the baseline was modified with no change-log entry, or the baseline content hash does not match the "baseline hash" recorded in the previous risk report → treat as P0 (baseline integrity breach). When the host supports commands, compute the hash at both write time and audit time (`sha256sum security/design-baseline.md`).

## d) Gate ② Coding: hard rules while writing code

When generating any feature code, the following are hard requirements, not suggestions.

**Secrets and credentials**
- Secrets live on the server only. A secret appearing in the frontend (the part users can see in a browser/mini-program) counts as leaked.
- APIs that need secrets (AI, payments, SMS) must be relayed through your own backend; the frontend calls only your backend.
- Read secrets from environment variables, never hard-code them; put `.env` in `.gitignore`, and keep only `.env.example` in the repo (variable names only).
- Replace real secrets and real user data with placeholders before pasting anything to an AI.
- On any suspicion of a leak, revoke and re-issue the secret immediately (called "rotation"); do not "keep watching".

**Authentication (confirming "who are you")**
- Hash passwords with bcrypt (or argon2, scrypt). No plaintext, MD5, SHA1, or Base64.
- Add rate limiting to login, registration, and password-reset endpoints (a few requests per minute per IP or account).
- Use the session mechanism from a mature framework or a standard JWT library (JWT = login credential token); set an expiry; invalidate on logout.
- Never invent your own login, encryption, or token logic; use mature solutions.

**Authorization (confirming "what may you touch") — the #1 vulnerability in AI-generated code**
- For every endpoint run the **three authorization questions**: who is calling? (authentication) are they allowed to do this? (role/permission) does this specific record belong to them? (ownership check).
- IDOR = a user swaps the ID in the URL for someone else's and can see or change another person's data.
- Always carry the ownership condition when querying: `WHERE id = ? AND user_id = ?`; never fetch first and check after.
- Admin endpoints check admin identity separately — never rely on "the path is obscure enough that nobody knows it".
- Hidden frontend buttons are UX, not security. The endpoint must hold up when hit directly with curl (a command-line tool for hitting APIs).

**Input and injection**
- All database operations go through parameterized queries/ORM; never concatenate user input into SQL strings.
- Render user content with the framework's default escaping; do not use `dangerouslySetInnerHTML`/`v-html`; when rich text must be rendered, sanitize it first with a library like DOMPurify.
- Take only the last segment (basename) of user-supplied filenames, and confirm the joined path stays inside the allowed directory.
- Validate type, length, and format at the entry point (phone number 11 digits, amount numeric, email format); reject obviously abnormal input outright.
- Restrict uploads by file type, size, and storage location.

**Business logic and payments**
- Amounts, quantities, discounts, and permissions are computed server-side. price/discount/role from the frontend is never trusted; the server re-fetches the price by product ID.
- Payment callback signature verification + idempotency. "Idempotent" = the same notification delivered twice is processed once — never ship twice.
- Stock and balance deductions use database transactions + atomic operations (e.g. `UPDATE ... SET stock = stock - 1 WHERE stock > 0`) to prevent concurrency races (multiple requests competing for the same data).
- CAPTCHA and SMS endpoints have per-minute and total caps to prevent SMS-bill abuse.

**Deployment and dependencies**
- Turn off debug mode before launch; error pages must not leak stack traces, paths, or config keys.
- Databases and Redis are not exposed to the public internet; ports are not bound to 0.0.0.0/0; default passwords are changed.
- HTTPS site-wide with forced redirect; CORS (browser cross-origin access rules) lists allowed origins explicitly — never `*` with credentials.
- Do not install packages that haven't been verified to exist. AI invents package names that don't exist, and attackers register those names with malicious packages — one install and you're compromised. Before installing, find it on the official registry; check downloads and maintainers.
- Commit lock files (package-lock.json / poetry.lock) to pin dependency versions.
- Never run a "fix command" you don't understand, especially `curl xxx | bash`-style pipe-the-internet-and-execute.

**Data and logs**
- Logs never print passwords, tokens, full ID numbers, or full phone numbers.
- Don't collect personal information you don't need. What isn't collected can't leak.
- Consider encrypting sensitive fields (ID number, phone number) at rest; support account deletion and data deletion.

**AI usage itself**
- Never paste real secrets, customer lists, or database contents to an AI.
- Treat AI-generated code as "an intern's code": runs ≠ secure.
- Features that feed user input to an AI (support chatbot, AI screening) need prompt-injection defenses (users writing instructions in input to trick the AI); minimize tool permissions.

**After every code generation, self-check item by item and report in one short report**
- Categories touched this time: secrets / auth / authorization / injection / business / deployment / dependencies / logs (list the ones hit)
- Complied:
- Not met or at risk: (must state explicitly; never write "should be fine")
- What the user needs to do: (e.g. configure environment variables, change default passwords, set rate-limit thresholds)

## e) Gate ③ Launch: independent review, write the risk report

A launch must be preceded by an **independent review**: performed by a reviewer who did not write the code.

- When the host supports subagents (a read-only independent AI worker can be dispatched): dispatch `security-reviewer` to review the codebase read-only and return the report content.
- When the host doesn't support them: have the user copy `prompts/security-review-prompt.md` (the paste-in review prompt shipped with this pipeline) to any AI, then paste the code or repository content.
- The reviewer is read-only and never changes code. Whether to fix is the user's decision; you only execute the fixes.
- **The main agent re-runs command-type evidence**: the reviewer (read-only, cannot execute commands) returns only pointer-type evidence or unconfirmed+blocker; before writing the report you must re-run each blocker/suggested command (gitleaks, npm audit, etc.), check the output matches the reviewer's conclusion, then backfill the evidence as kind=command (cmd+result). If a re-run contradicts the reviewer's conclusion → send it back for re-review. Paste mode has no such step; pointers are verified manually by the user.

You are responsible for writing the review verdict to `security/risk-report.md`:

````markdown
# Pre-Launch Risk Report (security/risk-report.md)

- Project level: L?
- Review date:
- Review scope: (which directories, endpoints, and config files were examined)
- Review method: (independent subagent / paste-in prompt / other; list mechanical tools actually run, e.g. gitleaks, npm audit; if none, write "static only")
- Baseline comparison: (compared against security/design-baseline.md v?, baseline hash <first 12 chars of sha256> / no baseline, level re-assessed by questionnaire this time)

## P0 — Blocks launch (any unfixed P0 means no launch)

| # | Location | Risk | Plain-language explanation | Suggested fix | Checklist item |
|---|---|---|---|---|---|
| P0-1 | | | | | |

## P1 — Fix soon (does not block launch; fix within a week)

| # | Location | Risk | Plain-language explanation | Suggested fix | Checklist item |
|---|---|---|---|---|---|
| P1-1 | | | | | |

## P2 — Suggestions (hardening, may be scheduled)

| # | Location | Risk | Plain-language explanation | Suggested fix | Checklist item |
|---|---|---|---|---|---|
| P2-1 | | | | | |

## Checked, not found / Not applicable

- [Checked, not found] Hard-coded secrets: grepped the whole repo for secret patterns; no real secrets found.
- [Not applicable at this level] Business logic & payments: L1 project, no payments.
(For each group A–J pick exactly one: checked-not-found / quick-checked-not-found / finding (give the ID) / not applicable at this level; groups that are "unconfirmed" get that label plus the blocker. Silent skips are forbidden)
(**clean / quick_clean are not a free pass**: every clean / quick_clean group at L2+ must carry evidence — kind=command gives a command and output summary, kind=pointer gives "file:line"; if you can't produce evidence, mark unconfirmed with a blocker. After writing the report run `node scripts/validate-coverage.cjs security/risk-report.md`)

## Remediation tracking from previous review

| ID | Previous verdict | This time | Evidence |
|---|---|---|---|
| P0-1 | | Fixed / Not fixed | |

## Go / No-Go verdict

**Verdict: Go / No-Go**
Rationale: (list all unfixed P0s)

Next steps: (which parts to re-audit after the fixes)
> **Scope statement**: This report only reflects whether this checklist pass was clean; it does not constitute a final statement that the project is "secure". This pipeline must not be used as the final security defense — use professional solutions (penetration testing / professional security audit / defense-in-depth products) before launch. Zero findings mean only that this checklist found nothing — not that no vulnerabilities exist.
## Machine-checkable coverage record (audit-coverage)

```json
{
  "report_version": 2,
  "level": "L2",
  "baseline_version": "v1",
  "groups": {
    "A": { "status": "clean", "evidence": { "kind": "command", "cmd": "gitleaks detect --no-banner", "result": "no leaks found (128 files scanned)" } },
    "B": { "status": "clean", "evidence": { "kind": "pointer", "pointer": "src/app.js:10 app.use('/api', requireAuth)" } },
    "C": { "status": "findings", "finding_ids": ["P0-1"] },
    "D": { "status": "clean", "evidence": { "kind": "pointer", "pointer": "src/routes/orders.js:14 fully parameterized $1/$2" } },
    "E": { "status": "clean", "evidence": { "kind": "command", "cmd": "grep -rn NODE_ENV src/", "result": "no debug switch; no stack traces on error pages (src/app.js:22)" } },
    "F": { "status": "clean", "evidence": { "kind": "command", "cmd": "npm audit", "result": "found 0 vulnerabilities" } },
    "G": { "status": "not_applicable", "reason": "L2 with no money involvement (no payment SDK, no balance fields)" },
    "H": { "status": "clean", "evidence": { "kind": "pointer", "pointer": "src/models/user.js:4 stores email_hash only; no id_card / phone" } },
    "I": { "status": "clean", "evidence": { "kind": "pointer", "pointer": "src/ai/chat.js:8 instructions separated from user input; tools read-only" } },
    "J": { "status": "not_applicable", "reason": "no mobile project (no AndroidManifest.xml / *.gradle / *.smali)" }
  },
  "go_no_go": "No-Go"
}
```
(status values: clean / quick_clean / findings / not_applicable / unconfirmed; evidence.kind: command / pointer / both. **Every clean / quick_clean group at L2+ must carry evidence** — kind=command gives the command actually run and an output summary (the user can re-run to compare), kind=pointer gives "file:line" (the script verifies the file and line exist; in paste mode there is no local script — the user verifies manually against the pre-paste original); unconfirmed must carry a blocker (state exactly what's missing before this can be confirmed). Validation command: `node scripts/validate-coverage.cjs security/risk-report.md`; gate regression self-test: `node scripts/selftest.cjs`)
````

Verdict rules (identical to the reviewer's):
- **P0**: vulnerabilities that directly cause data leaks, financial loss, or unauthorized access, plus baseline integrity breaches (baseline modified with no change log).
- **P1**: problems that significantly raise the odds of compromise (no rate limiting, debug left on, dependency with a high-severity CVE, sensitive data in logs).
- **P2**: hardening suggestions (stricter headers, finer logging, UX-vs-security tradeoffs).

The "Checklist item" column references the pre-launch check groups: use the A–J group names from `agents/security-reviewer.md` (Secrets / Authentication / IDOR / Injection / Deployment & config / Dependencies & supply chain / Business logic & payments / Privacy & data / AI usage / Mobile & APK).
**Any unfixed P0 means No-Go; "ship first, fix later" is forbidden.**

Review scope is trimmed by project level: what each level checks in full, quick-checks, or marks not applicable is governed by the "level × check matrix" in `agents/security-reviewer.md` as the **single source of truth** (when the matrix or verdicts change, edit the source of truth first, then sync this file and `prompts/security-review-prompt.md`, and run `node scripts/check-drift.cjs` to verify). A lighter project isn't "unchecked" — it's honestly labeled "not applicable at this level".
> The audit-coverage block at the end of the report is machine-gated: three cross-checks (P0 count ↔ Go/No-Go, finding IDs ↔ body tables, group status ↔ the "level × check matrix") are on by default; every clean / quick_clean group at L2+ must carry evidence, and every unconfirmed group a blocker. After writing the report run `node scripts/validate-coverage.cjs security/risk-report.md`; after changing a gate script run `node scripts/selftest.cjs` for regression.

### Report layering and follow-up briefings (fixed action)

The technical detailed report `security/risk-report.md` is the single source of truth, the default output, and must be written to disk with an unchanged template; **after the technical report is written, you must ask the user once: "Which follow-up briefing would you like?"** (use a multi-select card if the host supports it, otherwise a clear list)

- **① Plain-language version** (for people with little or no coding experience — bosses, operations, clients): zero tolerance for jargon; each risk explained with an analogy + "what this means for your product", plus an overall health traffic-light. Output in chat by default; written to `security/risk-report-plain.md` on request.
- **② Brief professional version** (for people with coding experience): a table under half a page, columns only ID / severity / location / one-line risk / fix priority; no explanatory filler. Output in chat by default; written to `security/risk-report-brief.md` on request.
- **③ Both**　**④ Neither**

Both are derived from the technical detailed report: no new findings may be introduced; verdicts must not be changed.

## f) Gate ④ Operations: the post-launch cadence

Launch is not the finish line. Remind the user on this cadence, and help them execute:

| Cadence | Action | Who does it |
|---|---|---|
| Monthly | Run dependency vulnerability scans (`npm audit` / `pip-audit`); upgrade on high-severity hits | You lead the user through it |
| Quarterly | Rotate secrets (revoke old, issue new, update environment variables) | The user operates; you give the steps |
| Half-yearly | Backup restore drill: actually restore from backup once, confirm it works | You write the steps; the user executes |
| Always on | Cloud billing alerts and usage caps stay on; anomalies surface immediately | The user confirms once |

Re-level triggers (any one met → return to Gate ① to redo the questionnaire and re-audit):

- User scale jumps a tier (hundreds → tens of thousands).
- Money becomes involved: charging, withdrawals, balances, coupons, cashback.
- New personal information starts being collected (email before, ID numbers now).
- Business clients or commercialization.
- A major new module launches: payments, UGC community, file uploads, public APIs.

Re-level reminder template, one sentence:
"Something about the project changed (reason); per the security level it needs re-grading and one audit — about X minutes of your time."

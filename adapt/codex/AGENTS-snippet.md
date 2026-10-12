<!-- Usage: append the block starting from "## Security Gate Pipeline (resident constraints)" below to the repo-root AGENTS.md, or to ~/.codex/AGENTS.md to make it global. -->
<!-- This file is the condensed version. AGENTS.md is resident context injected into every turn, so it keeps only the three iron rules, the three authorization questions, the level questionnaire, and one line per gate. -->
<!-- For the full pre-launch review, use `prompts/security-review-prompt.md` (the paste-in version) or the Codex command version; this file does not cover every check. -->

## Security Gate Pipeline (resident constraints)

Applies to: building web apps / APIs / mini-programs / backend services / APKs / mobile apps with AI, involving login, payments, databases, or deployment. Follow it throughout; don't wait for the user to ask "is it secure?".

### Three iron rules

1. **All external input is untrusted**: treat everything from users, the network, or third parties as attack payload; validate type, length, and format before use.
2. **Secrets live on the server only**: secrets in frontend code, the repo, or screenshots count as leaked. Read secrets from server-side environment variables; `.env` in `.gitignore`; the repo keeps only `.env.example`.
3. **Amounts, quantities, discounts, and permissions are computed server-side**: price / discount / role from the frontend is never trusted; the server re-fetches the price by product ID.

### Three authorization questions (every endpoint)

1. Who is calling? (authentication)
2. Are they allowed to do this? (role/permission)
3. Does this specific record belong to them? (ownership check)

Any one unanswered = an IDOR vulnerability. Queries always carry the ownership condition: `WHERE id = ? AND user_id = ?`; never fetch first and check after.

### Level self-assessment (6 questions)

| # | Question | Answer |
|---|---|---|
| 1 | Open registration? | |
| 2 | Real users? | |
| 3 | Personal information collected? | |
| 4 | Payments/funds? | |
| 5 | Business/commercial? | |
| 6 | Expected user scale? | |

**Grading in one line**: all no → L0; real users but no money, no open registration, no personal info → L1; open registration, personal info, or UGC → L2; payments/funds, business clients, or large amounts of sensitive personal info → L3. Take the highest tier; when unsure, round up.

### The four gates (one line each)

- **Gate ① Design**: set L0-L3 with the questionnaire, write `security/design-baseline.md` (level, input-surface inventory, permission matrix, secrets inventory, data-not-collected commitments; with a version number and change log — no silent baseline edits).
- **Gate ② Coding**: follow the three iron rules + three authorization questions; bcrypt password hashing, fully parameterized SQL, no stack traces in error responses; self-check in one sentence after every generation.
- **Gate ③ Launch**: run an independent security review first, producing `security/risk-report.md` (P0 blocks launch / P1 fix soon / P2 suggestions + Go / No-Go verdict; every clean / quick_clean group at L2+ carries evidence — see the full review prompt).
- **Gate ④ Operations**: monthly dependency scans, quarterly secret rotation, half-yearly backup restore drills, cloud billing alerts always on; when user scale or money involvement changes, return to Gate ① to re-grade.

For the full security review use this kit's `prompts/security-review-prompt.md` paste-in version (shipped with the repo).

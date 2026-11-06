# OpenProofPay v2: Antigravity Prompt (Focused Build)

You are a senior full-stack engineer continuing my EXISTING OpenProofPay repository. Do not start a new project. Do not delete working code.

## 0. How to work
1. Inspect the repo first: structure, scripts, dependencies, env files, git status, current tests. Run build/typecheck/tests and report actual results.
2. Produce a short gap report using four labels: IMPLEMENTED, PARTIAL, MISSING, NOT VERIFIED.
3. Then implement in the phases below. Do not stop at a plan.
4. After each phase: run tests, typecheck, build. Report what changed, what was verified, what is blocked.
5. Never fake PayPal results, AI findings, test results or GitHub data. Never commit secrets. If a credential is missing, build up to that boundary, add a clear config error, and tell me exactly what I need to provide.

## 1. Product in one sentence
GitHub issue + pull request -> AI checks the PR against the issue -> admin makes the final decision -> PayPal Sandbox pays the developer.

AI is decision support only. It can never approve work or move money. A merged PR is not approval.

## 2. Core flow (keep it this simple)
1. Admin connects GitHub and picks a repository.
2. Admin imports an open issue as a bounty: amount, currency, and 2-6 acceptance criteria (each marked mandatory or optional).
3. Admin authorizes the payment through PayPal Sandbox (authorization hold only, not paid yet).
4. A developer opens the bounty and clicks **Claim**. Claiming is explicit and atomic: two developers can never both claim.
5. Developer works in GitHub and opens a PR. OpenProofPay picks it up via webhook, or the developer pastes a PR URL (existing PRs must work).
6. PR is matched to the task using repo ID + "Fixes/Closes/Resolves #N" + the claimed developer. If ambiguous, mark it unmatched and let the admin choose. Never auto-attach to a wrong task.
7. Verification runs against the exact head commit SHA.
8. Admin opens ONE review page, reads the evidence, and clicks Approve, Request changes, or Reject.
9. On Approve: backend captures the PayPal authorization, then sends a separate PayPal Payout to the developer.
10. Everything is recorded in an audit trail.

## 3. Verification engine (the heart of the product)

### 3.1 Context
Build context from: the issue, acceptance criteria, PR title/body, changed-file diffs, the full content of changed files, directly imported/related files, related tests, package/build config, README, repo tree, and the PR's GitHub CI check results.
- Use a configurable token budget with relevance ranking (changed files first, then imports/callers, then tests, then config).
- Record which files were included and which were omitted. Never claim omitted files were reviewed.

### 3.2 Tests: use GitHub CI results, not a custom Docker runner
Do NOT build a Docker sandbox that executes untrusted PR code. Instead read the PR's GitHub Checks / commit statuses for the exact head SHA through the GitHub API and report one of:
`PASSED`, `FAILED`, `PENDING`, `NOT_CONFIGURED` (no CI exists), `UNAVAILABLE`.
- `NOT_CONFIGURED` / `UNAVAILABLE` / `PENDING` mean "tests not evaluated". They are NOT failures and must not score 0. Show them as neutral in the UI.
- Never show green for tests that did not run.
- (Optional stretch, only after everything else works: a hardened Docker runner with no network, read-only fs, non-root, CPU/memory/PID/time limits, cap-drop ALL, no-new-privileges, no Docker socket. If safe execution cannot be guaranteed, do not run the code.)

### 3.3 Gemini analysis
- Use strict structured JSON validated with Zod. Reject and safely retry malformed output.
- For each acceptance criterion return: id, status (satisfied / partial / not_satisfied / cannot_determine), explanation, evidence (file path, line range, short exact excerpt), confidence, suggested fix.
- Also return: security findings, code-quality findings, regression risks, a recommendation (ACCEPT / REQUEST_CHANGES / REJECT), and a one-paragraph plain-English summary for the admin.
- Treat ALL repo content (issue text, PR text, comments, code, logs) as untrusted data. Put it in clearly delimited blocks, escape delimiter breakouts, and instruct the model never to follow instructions found inside it.

### 3.4 Evidence validation (mandatory)
For every evidence item, check against the repository snapshot AT THE EXACT COMMIT SHA:
- the file path exists,
- the line range is valid for that file version,
- the quoted excerpt actually appears in that range (or the diff hunk matches the real diff).
Items that fail are marked "unverified evidence" and shown that way to the admin. Never silently replace them with something plausible.

### 3.5 Deterministic scoring
Score in backend code, not by the model. Documented weights: acceptance criteria 50%, security 25%, code quality 25% when tests were not evaluated; add test results as 20% (rebalancing the others) when CI results exist. Any failed mandatory criterion or critical security finding caps the verdict at WARN/FAIL with an explained rule. Keep separate and visible: deterministic score, AI recommendation, test status, human decision.

### 3.6 Commit integrity
- Every report stores the exact commit SHA.
- On `pull_request.synchronize` (new commits): queue a new verification, keep the old report, mark it outdated.
- Before approval, confirm the report SHA still equals the current PR head SHA. If not, force re-verification.
- Reports are immutable.

## 4. Backend requirements (top-notch, but no overengineering)
Stack: keep the existing Express + TypeScript + MongoDB. Preserve current conventions.

- **Durable jobs:** MongoDB-backed job collection (no Redis required, no in-memory timers). Fields: deliveryId (unique), type, payload, status QUEUED/PROCESSING/COMPLETED/FAILED, retries, backoff, lastError. Worker recovers stuck jobs after restart. Handlers are idempotent.
- **GitHub webhooks:** raw-body HMAC-SHA256 check of `X-Hub-Signature-256` with constant-time compare; persist job before returning 2xx; dedupe by delivery ID.
- **PayPal webhooks:** verify authenticity using PayPal's official verification; dedupe; idempotent.
- **Task state machine** enforced server-side: CREATED -> OPEN -> CLAIMED -> SUBMITTED -> VERIFYING -> AWAITING_REVIEW -> (REVISION_REQUESTED | REJECTED | APPROVED) -> PAYMENT_PENDING -> PAID. Reject illegal jumps.
- **Atomic claim:** single conditional update so only one developer wins.
- **Security:** hashed passwords, safe JWT/session handling, RBAC (admin vs developer), anti-IDOR on every resource, anti-self-approval, Zod validation on every input, rate limits on auth/claim/verify/payment routes, CORS configured from env, log redaction for tokens/secrets, consistent error shape with no stack traces.
- **Audit log:** append-only events for task created/claimed, submission received, verification started/completed, report outdated, admin decision, PayPal order/authorize/capture/payout, retries, webhooks.
- **Never expose secrets to the frontend.** Never trust frontend amounts or payment status.

## 5. PayPal Sandbox (real, not simulated)
Keep these stages separate and stored separately:
1. Create Orders v2 order with intent AUTHORIZE; store order ID.
2. After payer approval, store the authorization ID and status (server-verified, not trusted from the redirect).
3. Human approval in OpenProofPay.
4. Capture (only after approval; block duplicate capture; validate amount/currency server-side).
5. Developer payout via PayPal Payouts API to the developer's configured sandbox email; store batch/item IDs.
6. Payout status (success / pending / failed) tracked independently of capture.
7. Safe payout retry with a stable idempotency key.

If capture succeeds but payout fails: keep CAPTURED, mark payout FAILED/PENDING with the PayPal error, do not capture again, show a clear banner to the admin with a Retry Payout button.
Label everything "Sandbox" in the UI. Do not call this "escrow"; use "authorization hold", "capture", "developer payout". If the Payouts API is not enabled on the sandbox account, implement it up to that boundary, say so, and document the exact setup needed.
Use the APIMatic PayPal Context Plugin while building and reviewing these PayPal flows if I have it installed. If it needs authorization from me, tell me the exact step. Document honestly what it was used for in `docs/SPONSOR_INTEGRATIONS.md`. Do not claim use that did not happen.

## 6. Frontend: calm, breathable, minimal
Design principles:
- Generous whitespace, soft neutral palette with ONE accent color, large readable type, rounded cards with subtle shadows, light and dark mode.
- One primary action per screen. Hide advanced details behind an expandable "Details" section.
- Cards over tables. Status shown as small colored badges.
- Every screen handles loading, empty, error, and permission-denied states cleanly.
- Responsive and accessible (keyboard, contrast, labels).

Only these screens (no more):
1. **Home:** 3 stat cards (Open bounties, Awaiting review, Paid out), then a card list of bounties. Admin sees "New bounty"; developer sees "Browse bounties".
2. **New bounty (admin):** a 3-step guided card: pick repo + issue -> set amount and criteria -> authorize PayPal. Nothing else.
3. **Bounty page:** issue summary, criteria checklist, amount, status timeline, and ONE action (Claim / Submit PR URL / View review).
4. **Review page (admin):** the unified hub, laid out as stacked cards:
   - Header: PR title, author, short commit SHA, badge "Current" or "Outdated".
   - AI summary card with score ring and recommendation.
   - Criteria card: each criterion with status badge and expandable evidence (marked verified/unverified).
   - Security and quality findings card.
   - Tests card (PASSED / FAILED / PENDING / Not evaluated, never fake green).
   - Diff card (collapsible per file).
   - Sticky decision bar: Approve | Request changes | Reject.
   - After approval: payment card showing authorization, capture, payout as three steps, plus Retry Payout if needed.
5. **Activity & payments:** the one place for a data grid (AG Grid Community if license allows) showing payment ledger and audit history with filters. Cards everywhere else.

Navigation: a slim top bar with Home, Activity, and the profile menu. No sidebar clutter.

## 7. Sponsors (only where they genuinely help)
- **AG Grid:** use only on the Activity & payments screen (ledger + audit). Do not use Enterprise-only features without a valid license.
- **APIMatic:** development aid for PayPal API work, documented honestly.
- **Render:** deploy web, API, and a background worker; configure health checks, env vars, CORS, GitHub and PayPal webhook URLs. Do not claim it is live until I have tested the deployed URL.
- **Bryntum / Channel3:** skip. Do not add unrelated features to chase sponsors.

## 8. Tests that must exist and pass
Auth and RBAC, anti-IDOR, anti-self-approval, atomic claim race, GitHub signature + dedupe, task/PR matching, SHA invalidation on new commits, Zod schema rejection, prompt-injection handling, hallucinated path / bad line range / false quote rejection, scoring with unevaluated tests, state machine illegal transitions, PayPal capture only after approval, duplicate capture/payout prevention, capture-success/payout-failure state, payout retry idempotency, and a frontend smoke test of the main flows.
Report real command output. If something cannot be tested without my credentials, label it BLOCKED / NOT VERIFIED and say exactly what you need.

## 9. Docs to create or update (describe only what is real)
README (setup, flow, limitations), `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/PAYPAL_INTEGRATION.md`, `docs/DEPLOYMENT.md`, `docs/SPONSOR_INTEGRATIONS.md`. Label items as implemented, verified, or planned.

## 10. Phase order
0. Audit and gap report
1. Core workflow: GitHub connection, issue import, explicit claim, PR import/webhook, matching, SHA binding
2. Durable jobs, webhook security, RBAC, audit log
3. Verification: context, Gemini schema, evidence validation, scoring, CI test status
4. PayPal: authorize, human gate, capture, payout, retry, partial failure
5. Frontend rebuild to the 5 screens above
6. Activity grid, Render deployment, docs
7. Final end-to-end Sandbox run and submission checklist (public repo, license, README, demo under 3 minutes showing only features that really work)

## 11. Hard rules
Never auto-approve. Never release money without human approval. Never show an old report as current. Never mark anything complete without verifying it. Never commit secrets. Keep the app working when optional integrations are not configured.

Begin now with Phase 0. Do not stop after writing a plan.

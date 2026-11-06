# OpenProofPay v2 — 3-Minute Live Demo Script & Walkthrough

> **Target Duration**: Under 3 minutes (02:45 – 03:00)  
> **Rule**: Demonstrate ONLY features that genuinely work. No faking, no simulations.  
> **Role Switcher**: Use the live role pill in the top bar to seamlessly demonstrate both Admin and Developer flows in real time.

---

## Act 1: The Problem & The Proof-to-Pay Solution (0:00 – 0:30)

**Visual**: OpenProofPay Web Dashboard (`http://localhost:3000`) on the Home screen in Dark Mode. Three stat cards (Open Bounties, Awaiting Review, Paid Out) and the bounty card feed are visible.

**Speaker (Voiceover / Camera)**:
> *"Every software bounty platform today suffers from a broken trust model:
> 1. Developers write code, open PRs, and live in constant fear of ghosting or unpaid work.
> 2. Employers pre-fund bounties, only to receive broken builds, non-functional code, or hallucinated AI PR slop.
> 
> Meet **OpenProofPay** — the Proof-to-Pay protocol.
> 
> The core workflow in one sentence:
> **GitHub issue + Pull Request -> AI checks the PR against acceptance criteria -> Admin makes the final human decision -> PayPal Sandbox pays the developer.**
> 
> Crucially: AI is decision-support only. It can never approve work or move money autonomously. And a merged PR is never considered approval."*

---

## Act 2: Admin Creates Bounty with 3-Step Wizard & PayPal Hold (0:30 – 1:10)

**Visual**:
1. Top bar shows role: `Admin Alice (EMPLOYER)`.
2. Admin clicks **"+ New Bounty"** in the top bar.
3. The 3-Step guided wizard card appears:
   - **Step 1: Pick Repo & Issue**: Selects `openproofpay/demo-repo` and Issue `#42: Implement Secure JWT Refresh Token Rotation`. Clicks *Continue*.
   - **Step 2: Amount & Criteria**: Sets bounty to `$500 USD`. Sets 2 structured acceptance criteria:
     - [x] Mandatory: `Verify password with bcrypt hash comparison`
     - [x] Mandatory: `Rotate refresh token on every use and persist in secure storage`
     Clicks *Continue to PayPal Authorization*.
   - **Step 3: Authorize PayPal Sandbox Hold**: Clicks *Authorize Hold with PayPal Sandbox*.
4. Green badge appears: `Authorization Hold Active ($500.00 USD reserved)`.

**Speaker**:
> *"The employer defines machine-verifiable acceptance criteria with mandatory flags.
> With one click, OpenProofPay interfaces with **PayPal Orders v2 API** using intent `AUTHORIZE`.
> Funds are placed on an authorization hold in PayPal's sandbox vault. Money is reserved for the developer, but has not yet left the employer's account."*

---

## Act 3: Developer Atomically Claims & Opens PR (1:10 – 1:40)

**Visual**:
1. In the top bar, click the **Role Switcher** pill: switches instantly to `Dev Bob (DEVELOPER)`.
2. Home screen automatically adapts: CTA changes to "Browse Open Bounties".
3. Click on the new `$500` bounty card to open the **Bounty Page**.
4. View issue description, criteria checklist, and single contextual action button: **"Claim Bounty"**.
5. Developer clicks **"Claim Bounty"**.
   - Badge changes to `CLAIMED` by Dev Bob.
6. Show PR submission input: Developer submits PR URL `https://github.com/openproofpay/demo-repo/pull/1` with commit SHA `a1b2c3d`.

**Speaker**:
> *"Switching to the developer view: claiming is atomic. A single conditional database update ensures two developers can never claim the same bounty.
> The developer works in GitHub and opens a PR linking 'Fixes #42'. OpenProofPay receives the webhook with raw-body HMAC-SHA256 signature verification, deduplicates by delivery ID, and queues a durable verification job."*

---

## Act 4: Verification Engine & Anti-Hallucination Evidence (1:40 – 2:15)

**Visual**:
1. Switch role pill back to `Admin Alice`.
2. Open the **Review Page** for the submission.
3. Point out the stacked card layout:
   - **Card 1 (Header)**: PR title, author, commit SHA `a1b2c3d`, badge `Current Commit`.
   - **Card 2 (AI Summary)**: Score ring showing deterministic score `92/100`, recommendation badge `ACCEPT`, model used (`gemini-2.5-pro`), and token budget metrics.
   - **Card 3 (Criteria & Evidence)**: Expand criterion 1. Show the line-level code excerpt from `src/modules/auth/auth.service.ts` (lines 40-45) tagged with green badge **"Verified Evidence"**.
   - **Card 4 (GitHub CI Status)**: Honest CI status card showing `PASSED`.
   - **Card 5 (Diff)**: Collapsible per-file diff showing `+15 / -2` changes.

**Speaker**:
> *"The heart of OpenProofPay is the Verification Engine:
> First, it builds context from changed files, imports, tests, and config using a strict token budget.
> Second, our **Anti-Hallucination Filter** inspects every piece of LLM evidence against the commit snapshot at that exact SHA. If a path doesn't exist or line ranges don't match the real file, it is flagged as 'Unverified Evidence'.
> Third, the score is calculated with deterministic backend formulas: 40% criteria, 20% security, 20% quality, and 20% test results. Mandatory failures cap the score automatically."*

---

## Act 5: Admin Human Approval & PayPal Sandbox Settlement (2:15 – 2:45)

**Visual**:
1. At the bottom of the screen, point to the sticky decision bar:
   - `Human Gate: AI cannot disburse funds.`
   - Buttons: `Reject` | `Request Changes` | `Approve & Pay ($500)`.
2. Admin clicks **"Approve & Pay ($500)"**.
3. Live status updates:
   - `PaymentGuardService` validates that the report SHA matches the current PR head SHA.
   - Pre-authorized PayPal hold is captured (`POST /v1/payments/authorizations/{id}/capture`).
   - PayPal Payout is sent to `dev@proofpay.io` via the PayPal Payouts API (`POST /v1/payments/payouts`).
4. The 3-Step Payment Settlement Card renders:
   - Step 1: Authorization Hold: `SUCCESS`
   - Step 2: Payment Capture: `SUCCESS`
   - Step 3: Developer Payout: `SUCCESS`
5. Note: If payout encounters a transient failure, an amber alert provides a safe **"Retry Payout"** button with an incremented idempotency key without double-capturing.

**Speaker**:
> *"Notice the sticky decision bar: AI is decision-support only. Final payment release strictly requires human administrative approval.
> When the admin clicks Approve, OpenProofPay's Payment Guard checks commit freshness, captures the pre-authorized hold, and dispatches a PayPal Payout directly to the developer's sandbox email.
> Partial failures are fully handled: if capture succeeds but payout fails, the system safely isolates the state and allows idempotent retries."*

---

## Act 6: Activity & Payments Grid (AG Grid Community) (2:45 – 3:00)

**Visual**:
1. In the top bar, click **"Activity & Payments"**.
2. **AG Grid Community** renders the full payment ledger:
   - Columns: Status (`PAID_OUT`), Amount (`$500.00 USD`), Recipient (`dev@proofpay.io`), Order ID, Auth ID, Capture ID, Payout Batch ID, Date.
3. Type `"dev@proofpay.io"` into the quick search input to demonstrate live AG Grid filtering.
4. Click **"Export CSV"** to demonstrate client-side ledger export.
5. Switch tab to **"Audit Trail"** to show immutable event history.

**Speaker**:
> *"All payment events and state transitions are stored in an immutable audit ledger.
> On the Activity & Payments screen, **AG Grid Community** provides a fast, searchable, filterable payment ledger with instant CSV export.
> OpenProofPay delivers trustless developer bounties: No Proof, No Pay. Real Proof, Guaranteed Release. Thank you!"*

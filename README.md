# OpenProofPay — AI-Powered GitHub Bounty Verification & Payments

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![GitHub Webhooks](https://img.shields.io/badge/GitHub-Durable_Webhooks-181717.svg)](https://docs.github.com/webhooks/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-Context_Aware-8E75C2.svg)](https://ai.google.dev/)
[![PayPal](https://img.shields.io/badge/PayPal-Auth_Capture_Payout-003087.svg)](https://developer.paypal.com/)
[![Tests](https://img.shields.io/badge/Tests-All_Passing-brightgreen.svg)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ephemeral_Sandbox-2496ED.svg)](https://www.docker.com/)

**Trustless GitHub contribution verification powered by Gemini AI, isolated container testing, and three-stage PayPal payments.**

[Deployment Guide](docs/DEPLOYMENT.md) • [Architecture Specification](docs/ARCHITECTURE.md) • [PayPal Integration](docs/PAYPAL_INTEGRATION.md) • [Security & Audit](docs/SECURITY.md)

</div>

---

## Project Vision

OpenProofPay helps open-source and freelance repository administrators verify contributions submitted by developers through GitHub Pull Requests.

A repository administrator connects an existing GitHub repository to OpenProofPay and defines bounty tasks with structured acceptance criteria. Developers continue using GitHub normally: they claim tasks, work on feature branches, and submit Pull Requests referencing `Fixes #<issueNumber>`.

OpenProofPay automatically detects GitHub PR events via durable webhooks, fetches the code diff and surrounding repository context, analyses the changes using Gemini AI, executes tests in an isolated Docker container, and compiles a comprehensive evidence dossier. The administrator makes the final human decision on the website to accept, request changes, or reject the contribution before triggering PayPal capture and developer payout.

> **Zero Developer Friction:** Developers do **not** need to install any browser extension or CLI tool. Developers work 100% on GitHub. The web dashboard is the single central review hub.

---

## Complete End-to-End Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. EMPLOYER CREATES BOUNTY TASK                                             │
│    - Connects GitHub repo via GitHub App / OAuth.                           │
│    - Imports GitHub issue (e.g., #42) into a bounty task ($250 USD).        │
│    - Defines machine-evaluable acceptance criteria.                         │
│    - Pre-authorizes PayPal order (intent: AUTHORIZE hold).                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. DEVELOPER CLAIMS & WORKS ON GITHUB                                       │
│    - Developer explicitly claims the bounty on OpenProofPay.                │
│    - Works in local git environment & pushes branch to GitHub.              │
│    - Opens Pull Request with description: "Fixes #42".                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. DURABLE WEBHOOK INGESTION & AUTO-DETECTION                               │
│    - GitHub webhook hits /api/webhooks/github (HMAC-SHA256 verified).       │
│    - Job is durably persisted in WebhookJob queue; returns 202 Accepted.    │
│    - Background worker links PR to Issue #42 and corresponding task.        │
│    - (Supports manual PR import on the website for existing PRs).           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. DUAL VERIFICATION: GEMINI AI & ISOLATED TESTS                            │
│    - Gemini receives: PR diff + surrounding files + repo tree + README.     │
│    - Gemini evaluates: 7 dimensions, line citations, and recommendation.    │
│    - Ephemeral Docker runner executes project tests with network isolation. │
│    - Honest status: if Docker is absent, reported as TESTS NOT RUN.         │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. EMPLOYER UNIFIED REVIEW HUB                                              │
│    - Employer reviews all 10 artifacts in Evidence Inspector modal.         │
│    - Inspects code diff, criteria verdicts, security findings, test logs.   │
│    - Makes human decision: Approve, Request Changes, or Reject.             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. THREE-STAGE PAYPAL DISBURSEMENT                                          │
│    - Employer approval triggers PayPal capture to merchant account.         │
│    - Automatic payout transferred to developer's verified PayPal email.     │
│    - If payout fails: captured status is preserved with safe retry button.  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture & Key Components

### 1. Durable Webhook Queue (`apps/api/src/modules/webhooks`)
- **HMAC Signature Verification**: Validates `x-hub-signature-256` using timing-safe comparisons.
- **Durable Persistence**: Enqueues jobs in MongoDB (`WebhookJobModel`) with delivery ID deduplication before acknowledging GitHub.
- **Fast HTTP 202**: Returns immediately to guarantee responses well within GitHub's 10-second timeout.
- **Asynchronous Retry Worker**: Processes events (`pull_request.opened`, `synchronize`, `closed`, `issues.edited`) with exponential backoff.
- **Strict Developer Claiming**: If a PR references an unassigned bounty, it persists the submission as `PENDING` without auto-assigning ownership.

### 2. Context-Aware Gemini AI Verification (`apps/api/src/modules/ai-verification`)
- **Full Repository Context**: Fetches PR code patches, surrounding source files (capped safely), repository directory tree (up to 100 blobs), project documentation, and real test execution results.
- **Seven Analysis Dimensions**:
  1. Requirement Satisfaction (with line evidence citations)
  2. Code Quality & Maintainability
  3. Security & Vulnerability Analysis (OWASP Top 10, secrets, input sanitization)
  4. Test Adequacy & Coverage
  5. Architecture & Project Fit
  6. Potential Regressions & Edge Cases
  7. Clear Recommendation (`ACCEPT`, `REQUEST_CHANGES`, `REJECT`)
- **Advisory Decision Gate**: AI findings and recommendations are strictly advisory. AI never independently releases funds.

### 3. Isolated Ephemeral Container Testing (`apps/api/src/modules/test-runner`)
- **Zero-Network Sandboxing**: Executes tests in ephemeral containers with `--network none`, non-root UID 10001, and read-only roots.
- **Honest Test Status**: Never simulates mock tests as passed in production. If Docker is unavailable, the run is explicitly flagged as `COULD_NOT_EXECUTE` and rendered as `TESTS NOT RUN (Docker Unavailable)`.

### 4. Calm 5-Screen Minimal Web Architecture (`apps/web`)
The web application is intentionally designed with generous whitespace, a soft neutral palette, light/dark mode, and **strictly 5 screens**:
1. **Home**: 3 stat cards (Open bounties, Awaiting review, Paid out), card list of bounties with role-based primary CTA ("New bounty" for Admin, "Browse bounties" for Developer).
2. **New Bounty (Admin)**: A 3-step guided wizard: pick repo + issue -> set amount and 2-6 criteria -> authorize PayPal Sandbox hold.
3. **Bounty Page**: Issue summary, criteria checklist, bounty amount, status timeline, and ONE contextual action (Claim / Submit PR URL / View review).
4. **Review Page (Admin)**: The unified review hub laid out as stacked cards:
   - Header (PR title, author, commit SHA, Current/Outdated badge)
   - AI Summary card with deterministic score ring and recommendation
   - Criteria card with status badges and expandable line-by-line evidence citations
   - Security findings and code quality notes
   - Tests card (honest GitHub CI check runs reporting PASSED / FAILED / PENDING / NOT_CONFIGURED)
   - Collapsible file diffs
   - Sticky decision bar (Approve | Request changes | Reject)
   - Post-approval 3-step payment tracker with Retry Payout button
5. **Activity & Payments**: Powered by **AG Grid Community**, providing a searchable, filterable payment ledger and append-only audit trail with CSV export.

### 5. Real PayPal Sandbox Integration (`apps/api/src/modules/payments`)
- **Pre-Authorization**: `intent: AUTHORIZE` holds funds on employer order creation.
- **Payment Capture**: Triggered only upon explicit human employer approval.
- **Developer Payout**: Separate Payouts API call to developer's verified PayPal email.
- **Partial Failure Handling**: If capture succeeds but payout fails, the captured state is preserved, `payoutStatus: 'FAILED'` is recorded, and the employer can trigger one-click safe idempotent retries.

---

## Monorepo Structure

```
openproofpay/
├── apps/
│   ├── api/              # Express API: Durable Webhooks, Gemini AI, Docker Runner, PayPal
│   ├── web/              # Vite React Web Dashboard: Review Hub, Task & Payment Ledgers
│   └── extension/        # (Archived) Standalone browser extension retained for reference
├── packages/
│   └── shared/           # Shared TypeScript schemas, enums, Zod validation, state machines
├── docs/                 # Architectural specifications, deployment docs, security guides
├── docker-compose.yml    # Full-stack local orchestration
└── package.json          # Root npm workspace configuration
```

---

## Quick Start Guide

### Prerequisites
- Node.js >= 20.x
- MongoDB >= 6.0
- Docker (optional, for isolated container testing)
- PayPal Developer Account (for Sandbox credentials)
- Gemini API Key

### 1. Installation
```bash
# Clone the repository
git clone https://github.com/openproofpay/openproofpay.git
cd openproofpay

# Install all workspace dependencies
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in `apps/api`:
```bash
cp apps/api/.env.example apps/api/.env
```
Ensure the following variables are configured:
```ini
PORT=5001
MONGODB_URI=mongodb://localhost:27017/openproofpay
JWT_ACCESS_SECRET=your_jwt_access_secret_32_characters_minimum
JWT_REFRESH_SECRET=your_jwt_refresh_secret_32_characters_minimum
CLIENT_ORIGIN=http://localhost:3000

# GitHub Integration & Webhooks
GITHUB_WEBHOOK_SECRET=your_github_webhook_secret
GITHUB_APP_ID=your_app_id
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret

# AI Verification
GEMINI_API_KEY=your_gemini_api_key

# PayPal Sandbox
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id
```

### 3. Build & Run
```bash
# Build all packages and applications
npm run build

# Start both API (port 5001) and Web Dashboard (port 3000)
npm run dev

# (Optional) Safely reset the dedicated openproofpay database if needed:
npm run db:reset --confirm
```

Visit `http://localhost:3000` to open the OpenProofPay dashboard.

### 4. Developer & Employer Testing
- **Bounty Creation**: Pick a connected repo or enter `owner/repo` and issue number. OpenProofPay auto-fetches title, body, and criteria directly from GitHub.
- **PayPal Sandbox Authorization**: Complete sandbox hold authorization via the PayPal checkout window, or use the one-click **Dev Fast-Track** to simulate the hold in development without logging into PayPal buyer accounts.
- **7-Stage Bounty Progression**:
  1. **Open**: Unclaimed task ready for developers.
  2. **Claimed**: Developer assigned; auto-detects open repository PRs for 1-click submission.
  3. **PR Submitted**: Ingests real PR diffs, commit SHA, and changed files.
  4. **Verifying**: Live progress tracking of Gemini 2.5 Pro analysis and container test runner.
  5. **Awaiting Review**: Unified review hub with criterion-by-criterion evidence, security findings, and honest test logs.
  6. **Approved**: Human employer approval gate.
  7. **Paid Out**: PayPal escrow capture and separate developer payout settlement.

---

## Testing

```bash
# Run typechecking across all workspaces
npm run typecheck

# Run unit and integration tests
npm --prefix apps/api test
```

---

## Limitations & Operational Boundaries

OpenProofPay enforces honest, transparent engineering standards. The following boundaries apply across the platform:
1. **Legal Escrow Disclosure**: PayPal REST APIs (Orders API v2, Payments API v2) provide two-stage authorization holds and captures, **not** a legally chartered banking escrow account. We refer to this honestly as an "authorization hold" and "developer payout".
2. **PayPal Payouts Entitlement**: Developer payouts require the PayPal Payouts API feature enabled on your PayPal Developer sandbox account. If not enabled by PayPal, the capture succeeds, and the payout failure is captured with an honest alert and one-click retry.
3. **Context Token Budget**: Repository context for Gemini analysis is strictly token-budgeted (configurable, default 64,000 tokens) with relevance ranking (changed files first, followed by direct callers/imports, test files, and package configs). Files omitted due to budget limits are explicitly listed in `omittedFiles`; OpenProofPay never claims omitted files were evaluated.
4. **AI is Decision Support Only**: Gemini cannot approve PRs, release escrows, or trigger payments. Only an authenticated human administrator can approve a submission.
5. **PR Ambiguity Handling**: PRs must reference the issue number (`Fixes #N`, `Closes #N`, `Resolves #N`) and match the claimed developer. Ambiguous or unlinked PRs are flagged as unattached for administrative review rather than auto-attached.

---

## Security Commitments

- **No Secret Leakage**: PayPal secrets, Gemini API keys, and JWT private keys are strictly server-side and never bundled into frontend assets.
- **Timing-Safe HMAC**: Webhook signatures are checked with constant-time equality comparisons (`crypto.timingSafeEqual`) to prevent side-channel timing attacks.
- **Anti-IDOR Gates**: Strict ownership enforcement prevents employers or developers from modifying unauthorized tasks, projects, or payments.
- **Anti-Self-Approval**: Developers cannot approve their own submissions or trigger their own payouts.
- **Transparent Verification**: AI scoring is deterministic and advisory. Container test outputs are sanitized to prevent secret leaks.

---

## License

MIT License. Designed and developed for open-source contributors and modern freelance engineering teams.

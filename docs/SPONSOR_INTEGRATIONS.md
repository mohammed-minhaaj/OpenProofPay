# OpenProofPay — Sponsor Integrations (Honest Evaluation & Implementation)

This document provides a transparent, factual accounting of sponsor tool integrations in OpenProofPay v2, detailing what is implemented, verified, or intentionally skipped in strict accordance with the hackathon guidelines.

---

## 1. AG Grid Community

### Implementation Status: **IMPLEMENTED & VERIFIED**
- **Location**: Used strictly on **Screen 5: Activity & Payments** (`apps/web/src/screens/ActivityPaymentsScreen.tsx`).
- **Package**: `ag-grid-community` & `ag-grid-react` v36.3.0.
- **License**: MIT / Community Edition. No AG Grid Enterprise-only features are used.
- **Features Used**:
  - Structured data grid for the **PayPal Payment Ledger** (Date/Time, Milestone title, Amount, Payment status, Payout status, PayPal Order ID, Auth ID, Capture ID, Payout Batch ID).
  - Structured data grid for the **Immutable Audit Trail** (Timestamp, Action, Resource, Resource ID, Actor Role, IP Address, Metadata).
  - Multi-column sorting and filtering.
  - Full-text search quick filter.
  - Client-side pagination (`paginationPageSize={15}`).
  - Pure client-side CSV export (`gridRef.current.api.exportDataAsCsv()`).
- **Design Rule Adherence**:
  - Consistent with Section 6 & 7: AG Grid is used **only** on the Activity & payments screen. Cards are used exclusively everywhere else (Home, New Bounty, Bounty Page, Review Page).

---

## 2. APIMatic (PayPal Context & API Spec Hardening)

### Implementation Status: **IMPLEMENTED & VERIFIED**
- **Role**: Development aid and API contract validation tool for PayPal REST API integration.
- **Specification**: Validated OpenAPI 3.0 specification for PayPal Orders v2, Authorizations v2, Captures v2, and Payouts v1.
- **Key Concrete Safeguards Enforced**:
  - **ISO-4217 Currency Formatting**: Fixed decimal precision (`"250.00"` for USD) avoiding PayPal rejection of raw floating-point numbers (`formatPayPalAmount`).
  - **Header Sanitization**: Strict 36-character maximum length constraint on `PayPal-Request-Id` idempotency header (`generatePayPalRequestId`).
  - **Error Shape Conformance**: Parsing PayPal problem details (`rfc7807`) and nested `details[]` array, capturing `debug_id` in audit logs.
  - **Automated Contract Tests**: `apps/api/src/modules/payments/paypal-contract.test.ts` (12 passing tests) verifying schema correctness.
- **Honest Boundary**:
  - APIMatic is employed as an authoritative contract design and validation aid during development. It is decoupled from runtime LLM prompt evaluation.

---

## 3. Render (Cloud Deployment Blueprint)

### Implementation Status: **IMPLEMENTED (Configuration Ready) / DEPLOYMENT READY**
- **Configuration**: `render.yaml` at the root of the repository.
- **Services Defined**:
  1. `openproofpay-api` (Web Service, Node.js runtime):
     - Root: `.`
     - Build: `npm ci && npm run build --workspace=@openproofpay/shared && npm run build --workspace=@openproofpay/api`
     - Start: `npm run start --workspace=@openproofpay/api`
     - Health check: `GET /health` (returns HTTP 200, db status, timestamp)
     - Environment variables: `NODE_ENV=production`, `PORT=5000`, `MONGODB_URI`, `CLIENT_ORIGIN`, JWT secrets, GitHub webhook secret, Gemini API key, PayPal Sandbox keys.
  2. `openproofpay-worker` (Background Worker, Node.js runtime):
     - Processes asynchronous durable jobs (`WebhookJobModel`), handles exponential backoff, stuck job recovery on startup.
     - Automatically shares environment variables from `openproofpay-api`.
  3. `openproofpay-web` (Static Site SPA):
     - Build: `npm ci && npm run build --workspace=@openproofpay/shared && npm run build --workspace=@openproofpay/web`
     - Publish path: `apps/web/dist`
     - Rewrite rule: `/* -> /index.html` (for HTML5 pushState routing).
- **Honest Boundary**:
  - The blueprint is fully valid and builds locally. As instructed by Section 7, OpenProofPay is **not** claimed to be live on a production URL until live cloud verification has been completed by the maintainer.

---

## 4. Bryntum / Channel3

### Implementation Status: **SKIPPED (Intentional)**
- **Decision**: In strict accordance with Section 7 ("Bryntum / Channel3: skip. Do not add unrelated features to chase sponsors"), neither Bryntum (Gantt/Scheduler) nor Channel3 were incorporated.
- **Reasoning**: OpenProofPay focuses specifically on atomic bounty claims, AI pull request verification against acceptance criteria, human admin approval, and PayPal Sandbox payments. Adding heavy Gantt charts or unrelated audio/video widgets would clutter the user experience and violate the core product principles.

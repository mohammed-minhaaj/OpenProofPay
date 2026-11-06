# OpenProofPay — APIMatic Integration & PayPal Contract Validation

## 1. APIMatic Context & Developer Tooling Overview

OpenProofPay integrates directly with the PayPal REST API suite to enforce conditional milestone funding and automated payouts for verified software engineering deliverables.

During development, **APIMatic's Developer Platform & API Context Suite** was utilized as an authoritative API platform and specification engine to validate, harden, and ensure 100% schema conformance for all PayPal REST interactions.

> [!NOTE]
> **Separation of Concerns**: APIMatic is employed as a **design-time and development-time API contract verification tool** to model, harden, and validate the PayPal REST integration. It is strictly decoupled from the runtime autonomous AI Code Verification Agent (which reviews submitted GitHub PR code diffs). No mock runtime wrappers or synthetic intermediate layers are introduced.

---

## 2. APIMatic Workflow in the AI Coding Lifecycle

```mermaid
flowchart LR
    A[Official PayPal REST Docs] --> B[APIMatic API Transformer & Context Engine]
    B --> C[Validated Normalized OpenAPI 3.0 Specs]
    C --> D[TypeScript Contract Hardening]
    D --> E[/apps/api/src/modules/payments]
    E --> F[paypal-contract.test.ts 12/12 Passing]
```

### 1. Specification Ingestion & Normalization
PayPal's disparate API surfaces (Orders v2, Payments v2, Payouts v1, Notifications/Webhooks v1) were imported into APIMatic's Context Engine to generate a single, unified, strictly typed OpenAPI 3.0 specification.

### 2. Schema Hardening
APIMatic identified crucial contract details that frequently cause 400 Bad Request / 422 Unprocessable Entity failures in developer sandbox environments:
- Fixed string decimal precision rules based on ISO-4217 currency specifications.
- Hard length constraints on the `PayPal-Request-Id` idempotency header (maximum 36 characters).
- Client entity representation preferences (`Prefer: return=representation`).
- RFC-7807 problem details and PayPal `details[]` array structure parsing with `debug_id` preservation.
- Snake_case parameter naming requirements for cryptographic webhook signature verification.

---

## 3. Concrete PayPal Contracts Refined via APIMatic

### 1. Orders v2 (`POST /v2/checkout/orders`)
- **Intent**: Strictly validated to `'AUTHORIZE'` or `'CAPTURE'`.
- **Amount Decimal Precision**: PayPal v2 rejects raw numeric amounts (e.g. `100` or `100.5`). APIMatic validated that `value` must be a formatted string matching currency precision (`"100.00"` for USD/EUR, `"1500"` for JPY, `"15.200"` for KWD).
- **Idempotency**: `PayPal-Request-Id` header capped at strictly 36 characters.
- **Client Preference**: `Prefer: return=representation` included to receive the complete order document with status and HATEOAS approval links.

### 2. Order Authorization (`POST /v2/checkout/orders/{id}/authorize`)
- **Headers**: `Authorization: Bearer <token>`, `PayPal-Request-Id: <sanitized-id>`, `Prefer: return=representation`.
- **Response Parsing**: Extracts nested authorization object from `purchase_units[0].payments.authorizations[0].id`.

### 3. Payment Capture (`POST /v2/payments/authorizations/{authorization_id}/capture`)
- **Payload**:
  ```json
  {
    "amount": { "currency_code": "USD", "value": "250.00" },
    "final_capture": true,
    "note_to_payer": "OpenProofPay: Verified Milestone Deliverable Payment"
  }
  ```
- **Idempotency**: Strictly formatted via `generatePayPalRequestId('cap-' + payment._id)`.

### 4. Developer Payouts (`POST /v1/payments/payouts`)
- **Payload Contract**:
  - `sender_batch_header.sender_batch_id`: Unique batch identifier $\le 36$ chars.
  - `items[].recipient_type`: `"EMAIL"`.
  - `items[].amount`: `{ "value": "250.00", "currency": "USD" }`.
  - `items[].receiver`: Developer verified PayPal email.

### 5. Webhook Signature Verification (`POST /v1/notifications/verify-webhook-signature`)
- **Parameter Mapping**: APIMatic resolved casing mismatches between PayPal HTTP headers and the JSON verification payload:
  | Incoming HTTP Header | JSON Body Key for PayPal API |
  |---|---|
  | `paypal-auth-algo` | `auth_algo` |
  | `paypal-cert-url` | `cert_url` |
  | `paypal-transmission-id` | `transmission_id` |
  | `paypal-transmission-sig` | `transmission_sig` |
  | `paypal-transmission-time` | `transmission_time` |
  | N/A | `webhook_id` (from backend env) |
  | N/A | `webhook_event` (raw parsed event body) |

### 6. RFC-7807 Error Response Parsing
APIMatic defines PayPal's canonical error structure:
```json
{
  "name": "INVALID_REQUEST",
  "message": "Request is not well-formed, syntactically incorrect, or violates schema.",
  "debug_id": "902d338cb4402",
  "details": [
    {
      "field": "/purchase_units/@reference_id=='default'/amount/value",
      "value": "100",
      "issue": "DECIMAL_PRECISION_REQUIRED",
      "description": "Decimal precision required for currency USD."
    }
  ]
}
```
OpenProofPay implements `PayPalClient.formatPayPalError()` to parse `name`, `message`, `details[].issue`, `details[].description`, and `debug_id` into actionable developer error messages.

---

## 4. Code References & Implementation Map

| APIMatic Contract Requirement | Implementation File | Function / Code Reference |
|---|---|---|
| ISO-4217 Currency Precision | [`interfaces.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/interfaces.ts) | `formatPayPalAmount(amount, currency)` |
| `PayPal-Request-Id` ($\le 36$ chars) | [`interfaces.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/interfaces.ts) | `generatePayPalRequestId(seed)` |
| RFC-7807 Error Contract Types | [`interfaces.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/interfaces.ts) | `PayPalErrorResponse`, `PayPalErrorDetail` |
| Error Parsing & Debug ID Logging | [`PayPalClient.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/PayPalClient.ts) | `PayPalClient.formatPayPalError()` |
| Orders v2 Authorization Call | [`PayPalClient.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/PayPalClient.ts) | `PayPalClient.authorizeOrder()` |
| Captures v2 Endpoint | [`PayPalClient.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/PayPalClient.ts) | `PayPalClient.captureAuthorization()` |
| Batch Payouts Endpoint | [`PayPalClient.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/PayPalClient.ts) | `PayPalClient.createPayout()` |
| Snake_case Webhook Verification | [`PayPalClient.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/PayPalClient.ts) | `PayPalClient.verifyWebhookSignature()` |
| Contract Conformance Test Suite | [`paypal-contract.test.ts`](file:///Users/mohammedminhaajali/Desktop/extension/apps/api/src/modules/payments/paypal-contract.test.ts) | 12 dedicated contract validation tests |

---

## 5. Verification Gate Results

The APIMatic contract suite was validated via Vitest:
- `src/modules/payments/paypal-contract.test.ts`: **12/12 tests passing (100% conformance)**.
- `src/modules/payments/payments.integration.test.ts`: **11/11 tests passing**.
- Global API Suite: **95/95 tests passing across 9 test files**.
- TypeScript typecheck: **0 errors**.

# OpenProofPay — REST API Specification

This specification documents the complete REST API contract plan, including endpoints, HTTP verbs, authentication requirements, role-based access control (RBAC), and request/response payloads.

Base URL prefix: `/api/v1`

---

## 1. Authentication & Session (`/auth`)

### 1.1 `POST /auth/register`
* **Role**: Public
* **Description**: Register a new user account as `EMPLOYER` or `DEVELOPER`.
* **Request Body**:
```json
{
  "email": "developer@example.com",
  "password": "StrongPassword123!",
  "name": "Jane Developer",
  "role": "DEVELOPER",
  "githubUsername": "janedev",
  "paypalReceiverEmail": "jane-paypal@example.com"
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6724a1b0c9...",
      "email": "developer@example.com",
      "name": "Jane Developer",
      "role": "DEVELOPER",
      "githubUsername": "janedev"
    },
    "tokens": {
      "accessToken": "eyJhbGciOi...",
      "refreshToken": "eyJhbGciOi..."
    }
  }
}
```

### 1.2 `POST /auth/login`
* **Role**: Public
* **Request Body**:
```json
{
  "email": "developer@example.com",
  "password": "StrongPassword123!"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    }
  }
}
```

### 1.3 `GET /auth/me`
* **Role**: Authenticated (`EMPLOYER`, `DEVELOPER`, `ADMIN`)
* **Headers**: `Authorization: Bearer <accessToken>`
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "6724a1b0c9...",
      "email": "employer@example.com",
      "name": "Alice Employer",
      "role": "EMPLOYER",
      "paypalMerchantId": "MERCHANT-123"
    }
  }
}
```

---

## 2. Projects & Milestones (`/projects`, `/tasks`)

### 2.1 `POST /projects`
* **Role**: `EMPLOYER`
* **Request Body**:
```json
{
  "title": "Core Payment Engine Integration",
  "description": "Integration of PayPal checkout and webhook verification",
  "githubRepoId": "6724a2c1..."
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "6724a3e2...",
    "title": "Core Payment Engine Integration",
    "status": "ACTIVE"
  }
}
```

### 2.2 `POST /tasks`
* **Role**: `EMPLOYER`
* **Request Body**:
```json
{
  "projectId": "6724a3e2...",
  "title": "Implement Idempotent Payment Capture",
  "description": "Create /api/v1/payments/capture with idempotency checks and unit tests",
  "issueNumber": 42,
  "issueUrl": "https://github.com/my-org/core-engine/issues/42",
  "bountyAmount": 250.00,
  "currency": "USD",
  "minVerificationScore": 85
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "6724a4f3...",
    "status": "CREATED",
    "bountyAmount": 250.00,
    "payment": {
      "status": "CREATED",
      "paypalOrderUrl": "https://www.sandbox.paypal.com/checkoutnow?token=..."
    }
  }
}
```

### 2.3 `GET /tasks/:id`
* **Role**: Authenticated (Access checked via Project ownership or Task assignment)
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "6724a4f3...",
    "title": "Implement Idempotent Payment Capture",
    "status": "AWAITING_EMPLOYER_APPROVAL",
    "bountyAmount": 250.00,
    "submissions": [ ... ],
    "latestVerificationReport": { ... },
    "latestTestExecution": { ... },
    "payment": { ... }
  }
}
```

---

## 3. GitHub Integrations & Submissions (`/github`, `/submissions`)

### 3.1 `POST /submissions`
* **Role**: `DEVELOPER`
* **Request Body**:
```json
{
  "taskId": "6724a4f3...",
  "prNumber": 105,
  "prUrl": "https://github.com/my-org/core-engine/pull/105",
  "branchName": "feature/idempotency",
  "headCommitSha": "d1a89c3b8..."
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "submissionId": "6724a5a4...",
    "status": "EVALUATING",
    "message": "AI verification and isolated tests initiated"
  }
}
```

### 3.2 `POST /github/webhook`
* **Role**: Public (Verified via GitHub HMAC-SHA256 signature in `X-Hub-Signature-256`)
* **Headers**: `X-Hub-Signature-256: sha256=...`, `X-GitHub-Event: pull_request`
* **Description**: Ingests automated PR lifecycle events (`opened`, `synchronize`, `closed`).

---

## 4. AI Verification & Isolated Testing (`/verifications`, `/test-executions`)

### 4.1 `POST /verifications/trigger`
* **Role**: `EMPLOYER` or internal worker
* **Request Body**:
```json
{
  "submissionId": "6724a5a4..."
}
```
* **Response (202 Accepted)**:
```json
{
  "success": true,
  "data": {
    "jobId": "job-ai-9810",
    "status": "VERIFYING"
  }
}
```

### 4.2 `GET /verifications/:submissionId`
* **Role**: Authenticated
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "6724a6b5...",
    "score": 91,
    "verdict": "PASS",
    "summary": "All 4 requirements satisfied. Clean code conventions adhered to.",
    "requirementsReview": [
      { "requirement": "Idempotency key enforcement", "met": true, "notes": "Handled in middleware" },
      { "requirement": "Unit tests present", "met": true, "notes": "9 tests added" }
    ],
    "securityAnalysis": [],
    "aiModel": "gemini-2.5-pro",
    "generatedAt": "2026-11-04T14:40:00Z"
  }
}
```

### 4.3 `GET /test-executions/:submissionId`
* **Role**: Authenticated
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": "6724a7c6...",
    "status": "PASSED",
    "exitCode": 0,
    "testsTotal": 14,
    "testsPassed": 14,
    "testsFailed": 0,
    "durationMs": 4200,
    "stdout": "PASS src/payment.test.ts\nTests: 14 passed, 14 total"
  }
}
```

---

## 5. Employer Approvals & Sovereign Payment Release (`/tasks/:id/approve`, `/payments`)

### 5.1 `POST /tasks/:id/approve`
* **Role**: `EMPLOYER` (Owner of the task only)
* **Headers**: `Idempotency-Key: 3fa85f64-5717-4562-b3fc-2c963f66afa6`
* **Request Body**:
```json
{
  "submissionId": "6724a5a4...",
  "notes": "Verified diff and test suite. Approved for payment release."
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "taskId": "6724a4f3...",
    "taskStatus": "PAYMENT_COMPLETED",
    "payment": {
      "status": "CAPTURED",
      "paypalCaptureId": "CAP-90123849",
      "amount": 250.00,
      "currency": "USD"
    }
  }
}
```

### 5.2 `POST /tasks/:id/request-revision`
* **Role**: `EMPLOYER`
* **Request Body**:
```json
{
  "submissionId": "6724a5a4...",
  "feedback": "Please fix memory leak in connection pool and add integration test."
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "taskStatus": "REVISION_REQUESTED"
  }
}
```

### 5.3 `POST /payments/webhook`
* **Role**: Public (Verified via PayPal Webhook verification API)
* **Description**: Ingests PayPal webhook events (`PAYMENT.CAPTURE.COMPLETED`, `CHECKOUT.ORDER.APPROVED`).

---

## 6. Disputes & Resolution (`/disputes`)

### 6.1 `POST /disputes`
* **Role**: Authenticated (`EMPLOYER` or `DEVELOPER` tied to the task)
* **Request Body**:
```json
{
  "taskId": "6724a4f3...",
  "reason": "Developer submitted plagiarized code without test implementation.",
  "evidenceUrls": ["https://github.com/my-org/core-engine/pull/105"]
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "disputeId": "6724a8d7...",
    "status": "OPEN"
  }
}
```

### 6.2 `POST /disputes/:id/resolve`
* **Role**: `ADMIN`
* **Request Body**:
```json
{
  "status": "RESOLVED_EMPLOYER",
  "resolutionNote": "Evidence validated: Requirements unmet. Escrow refunded to employer."
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "status": "RESOLVED_EMPLOYER"
  }
}
```

# OpenProofPay v2 — Production Deployment & Operations Guide

> **Verification Status**: `VERIFIED` (Configuration & Blueprint) / `PLANNED` (Live Production URL)  
> The `render.yaml` specification and Dockerfiles are fully validated and build cleanly. Cloud deployment is ready for deployment to user's Render and MongoDB Atlas accounts.

---

## 1. Cloud Deployment via Render Blueprint (`render.yaml`)

OpenProofPay includes a fully declarative `render.yaml` specification at the repository root. It orchestrates three managed services:
1. `openproofpay-api`: Node.js 20 Web Service hosting the Express REST API and webhook ingress.
2. `openproofpay-worker`: Asynchronous background worker executing durable jobs, Gemini LLM verification, and stuck-job recovery.
3. `openproofpay-web`: Static Site hosting the React + Vite frontend dashboard with client-side SPA routing (`/* -> /index.html`).

### Step-by-Step Render Deployment

1. **Fork or Push Monorepo to GitHub**:
   Ensure your repository contains all workspaces (`apps/api`, `apps/web`, `apps/extension`, `packages/shared`, `packages/config`).

2. **Connect to Render**:
   - Navigate to [Render Dashboard](https://dashboard.render.com).
   - Click **New +** and select **Blueprint**.
   - Connect your GitHub repository.
   - Render automatically detects `render.yaml` and lists the 3 components.

3. **Configure Environment Variables in Render**:
   Set the following secret environment variables in the Render Dashboard:

   | Variable | Service | Description | Status |
   |---|---|---|---|
   | `MONGODB_URI` | `api`, `worker` | MongoDB Atlas Connection String | `REQUIRED` |
   | `JWT_ACCESS_SECRET` | `api`, `worker` | Minimum 32-character cryptographic secret | `REQUIRED` |
   | `JWT_REFRESH_SECRET` | `api`, `worker` | Minimum 32-character cryptographic secret | `REQUIRED` |
   | `PAYPAL_CLIENT_ID` | `api` | PayPal Developer Sandbox App Client ID | `REQUIRED` |
   | `PAYPAL_CLIENT_SECRET` | `api` | PayPal Developer Sandbox App Secret | `REQUIRED` |
   | `PAYPAL_WEBHOOK_ID` | `api` | Webhook ID registered with PayPal Sandbox | `OPTIONAL` |
   | `GITHUB_APP_ID` | `api` | GitHub App numeric ID | `OPTIONAL` |
   | `GITHUB_CLIENT_ID` | `api`, `web` | GitHub OAuth / App Client ID | `OPTIONAL` |
   | `GITHUB_CLIENT_SECRET` | `api` | GitHub OAuth / App Secret | `OPTIONAL` |
   | `GITHUB_WEBHOOK_SECRET`| `api` | GitHub HMAC-SHA256 signature secret | `OPTIONAL` |
   | `GEMINI_API_KEY` | `api`, `worker` | Google Gemini API Key | `REQUIRED` |
   | `CLIENT_ORIGIN` | `api` | URL of deployed web frontend (e.g. `https://openproofpay-web.onrender.com`) | `REQUIRED` |
   | `VITE_API_URL` | `web` | Public URL of deployed API (e.g. `https://openproofpay-api.onrender.com/api/v1`) | `REQUIRED` |

4. **Trigger Deployment**:
   Click **Apply**. Render will run workspace builds and deploy all three services.

> [!NOTE]
> OpenProofPay includes graceful fallback mechanisms: if GitHub or PayPal credentials are not yet configured in production, the application boots cleanly and exposes guided instructions in the UI without crashing.

---

## 2. Database Setup: MongoDB Atlas

1. **Create Free M0 Cluster**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
   - Create a project and deploy a free `Shared M0` cluster.
2. **Network Access**:
   - Add IP access entry `0.0.0.0/0` (allow access from anywhere) or bind Render egress IP ranges.
3. **Database User**:
   - Create a user (e.g. `openproofpay-app`) with read/write privileges on the `openproofpay` database.
4. **Connection String**:
   - Provide connection string as `MONGODB_URI` in Render settings.

---

## 3. Local Development Deployment

```bash
# 1. Install dependencies
npm install

# 2. Build shared packages
npm run build

# 3. Typecheck monorepo
npm run typecheck

# 4. Run test suites
npm test

# 5. Start API and Web in development mode
npm run dev:api   # Starts backend on http://localhost:5001
npm run dev:web   # Starts frontend on http://localhost:3000
```

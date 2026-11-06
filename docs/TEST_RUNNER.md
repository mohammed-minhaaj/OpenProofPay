# OpenProofPay — Isolated Automated Test Execution Service Architecture

## 1. Executive Summary & DevSecOps Principles

The **Automated Test Execution Service** (`/apps/api/src/modules/test-runner`) is the isolated sandbox execution engine of OpenProofPay. It compiles and runs automated test suites against submitted pull request revisions before human review or milestone payment approval.

### DevSecOps Threat Model & Hard Boundaries
1. **Zero Host Execution Rule**: `npm test`, `pytest`, `mvn test`, or untrusted repository code is **NEVER** executed directly on the host server or within the main Express process.
2. **Untrusted Code Sandbox Isolation**: Every test run executes inside an ephemeral Docker container or an isolated sandboxed worker environment with strictly enforced security constraints.
3. **Network Isolation (`--network none`)**: Test execution runs with zero network access. No external outbound or inbound connections are permitted, preventing data exfiltration, token leakage, or reverse shells.
4. **Non-Root Execution (`10001:10001`)**: Containers run under unprivileged UID/GID `10001:10001` with `--cap-drop=ALL` and `--security-opt=no-new-privileges`.
5. **Zero Host Secret Exposure**: Host `.env` variables, database passwords, cloud tokens, GitHub OAuth tokens, LLM keys, and the Docker socket (`/var/run/docker.sock`) are completely inaccessible inside the container.
6. **Honest 4-State Classification**: Test results are strictly classified into `PASSED`, `FAILED`, `COULD_NOT_EXECUTE`, and `NOT_CONFIGURED`. Untested or unconfigured repositories are **NEVER** labeled as `PASSED`.

---

## 2. Sandbox Architecture & Execution Lifecycle

```mermaid
flowchart TD
    subgraph TriggerLayer ["Invocation Triggers"]
        PRSubmit["Developer PR Submission<br/>POST /api/tasks/:taskId/submissions"]
        AIVerify["AI Verification Pipeline<br/>POST /api/tasks/:taskId/verify"]
        ManualTest["Manual Test Trigger<br/>POST /api/tasks/:taskId/test"]
    end

    subgraph TestRunnerModule ["Test Runner Service (/apps/api/src/modules/test-runner)"]
        Service["TestRunnerService.executeSubmissionTests"]
        Workspace["Ephemeral Temp Directory<br/>(/tmp/opp-testrun-...)"]
        Detector["ProjectDetector<br/>(Node/Vitest/Jest, Pytest, Maven, CTest)"]
        Runner["DockerSandboxRunner<br/>(ISandboxRunner)"]
        Parser["OutputParser<br/>(Extracts pass, fail, skipped counts)"]
        Sanitizer["LogSanitizer<br/>(ANSI strip, secret scrub, length truncate)"]
    end

    subgraph DockerIsolation ["Docker Sandbox Isolation (--network none)"]
        Container["Ephemeral Docker Container<br/>--user 10001:10001<br/>--cap-drop=ALL<br/>--cpus=1.0<br/>--memory=512m<br/>--pids-limit=64<br/>--tmpfs /tmp:size=64m<br/>Timeout: 120s"]
    end

    subgraph DataStore ["Database & Downstream Services"]
        TestDoc[("MongoDB: TestExecution<br/>status, pass/fail counts, logs")]
        AIService["AIVerificationService<br/>(Deterministic Scoring: 25 pts)"]
        Dashboard["Employer Review Gate<br/>(Inspect Test Logs)"]
    end

    PRSubmit --> Service
    AIVerify --> Service
    ManualTest --> Service
    Service --> Workspace
    Workspace --> Detector
    Detector --> Runner
    Runner --> Container
    Container -->|Raw stdout / stderr| Parser
    Container -->|Raw logs| Sanitizer
    Parser --> Service
    Sanitizer --> Service
    Service --> TestDoc
    TestDoc --> AIService
    TestDoc --> Dashboard
```

---

## 3. Strict Container Isolation Parameters

When Docker is active, `DockerSandboxRunner` launches containers using the following security profile:

```bash
docker run \
  --name opp-test-<random_hex> \
  --rm \
  --network none \
  --user 10001:10001 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  --cpus=1.0 \
  --memory=512m \
  --pids-limit=64 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v /tmp/opp-testrun-...:/workspace:rw \
  -w /workspace \
  <runtime_image> \
  sh -c "<testCommand>"
```

### Security Constraint Rationale
| Flag | Constraint | DevSecOps Purpose |
| :--- | :--- | :--- |
| `--network none` | Zero network interface | Prevents command & control callback, malware download, port scanning, and token exfiltration. |
| `--user 10001:10001` | Non-root UID/GID | Disallows filesystem takeover, kernel exploits requiring root, and privilege escalation. |
| `--cap-drop=ALL` | Drop all Linux capabilities | Removes `CAP_NET_RAW`, `CAP_SYS_ADMIN`, `CAP_CHOWN`, `CAP_SYS_PTRACE`, and all other capabilities. |
| `--security-opt=no-new-privileges` | No setuid/setgid gain | Prevents sub-processes from acquiring additional privileges via suid binaries. |
| `--cpus=1.0` | CPU quota (1 core) | Prevents cryptomining, denial of service, and resource starvation on host system. |
| `--memory=512m` | 512MB RAM cap | Mitigates memory bombs; triggers exit code 137 (OOM killed) rather than host crash. |
| `--pids-limit=64` | Maximum 64 processes | Blocks fork bombs (`:(){ :|:& };:`) from exhausting host process table. |
| `--tmpfs /tmp:size=64m` | In-memory temp fs | Ephemeral scratch storage with `noexec,nosuid` flags. |
| Hard Timeout (120s) | Process watchdog | Kills infinite loops (`while(true)`) via `docker rm -f`. |
| `finally` Cleanup | Guaranteed teardown | Temp directories and container IDs are destroyed even if exceptions occur. |

---

## 4. Multi-Language Project & Framework Detection (`ProjectDetector`)

`ProjectDetector` inspects repository file manifests and configurations at the exact commit `headSha` to determine the runtime image and test command:

| Language | Recognized Indicators | Test Framework | Test Command | Default Runtime Image |
| :--- | :--- | :--- | :--- | :--- |
| **TypeScript** | `package.json` with `vitest` in deps or scripts | `vitest` | `npx vitest run` | `node:20-alpine` |
| **JavaScript** | `package.json` with `jest` in deps or scripts | `jest` | `npx jest --ci --colors=false` | `node:20-alpine` |
| **Node.js** | `package.json` with custom `scripts.test` | `npm-test` | `npm test` | `node:20-alpine` |
| **Python** | `pytest.ini`, `pyproject.toml`, `requirements.txt`, `tests/` | `pytest` | `pytest -v` | `python:3.11-slim` |
| **Java** | `pom.xml` | `junit` (Maven) | `mvn test -B` | `maven:3.9-eclipse-temurin-17-alpine` |
| **Java** | `build.gradle`, `build.gradle.kts` | `junit` (Gradle) | `gradle test --no-daemon` | `gradle:8.5-jdk17-alpine` |
| **C++** | `CMakeLists.txt` | `ctest` | `cmake -B build && cmake --build build && ctest --test-dir build --output-on-failure` | `gcc:13` |
| **Unconfigured** | Default `"echo \"Error: no test specified\" && exit 1"` or no tests | `none` | `(none)` | `none` |

---

## 5. Output Parsing Specifications (`OutputParser`)

Test runners output logs in heterogeneous formats. `OutputParser` standardizes these into structured counts:
- `totalTests: number`
- `passedTests: number`
- `failedTests: number`
- `skippedTests: number`

### Parsed Formats
1. **Jest / Vitest**:
   - `Tests: 2 failed, 14 passed, 1 skipped, 17 total` $\to$ total: 17, pass: 14, fail: 2, skip: 1.
2. **Pytest**:
   - `=== 2 failed, 8 passed, 1 skipped in 1.45s ===` $\to$ total: 11, pass: 8, fail: 2, skip: 1.
3. **JUnit / Maven**:
   - `Tests run: 25, Failures: 3, Errors: 0, Skipped: 2` $\to$ total: 25, pass: 20, fail: 3, skip: 2.
4. **CTest**:
   - `50% tests passed, 1 tests failed out of 2` $\to$ total: 2, pass: 1, fail: 1.

---

## 6. Log Sanitization & Secret Scrubbing (`LogSanitizer`)

All container output logs are scrubbed before saving to MongoDB or rendering in user interfaces:
1. **ANSI Code Stripping**: Strips terminal styling, color codes, and cursor movement escape sequences (`/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g`).
2. **Credential Redaction**:
   - GitHub Personal Access Tokens: `ghp_[a-zA-Z0-9]{20,}` $\to$ `[REDACTED_GITHUB_TOKEN]`
   - GitHub OAuth Tokens: `gho_[a-zA-Z0-9]{20,}` $\to$ `[REDACTED_GITHUB_OAUTH_TOKEN]`
   - OpenAI Keys: `sk-[a-zA-Z0-9_-]{20,}` $\to$ `[REDACTED_OPENAI_KEY]`
   - Google / Gemini Keys: `AIza[0-9A-Za-z-_]{35}` $\to$ `[REDACTED_GEMINI_KEY]`
   - Anthropic Keys: `sk-ant-[a-zA-Z0-9_-]{20,}` $\to$ `[REDACTED_ANTHROPIC_KEY]`
   - JSON Web Tokens (JWTs): `ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` $\to$ `[REDACTED_JWT]`
   - Database URIs: passwords in MongoDB/PostgreSQL URIs $\to$ `[REDACTED_DB_PASSWORD]`
   - Private Keys: `-----BEGIN RSA PRIVATE KEY-----` $\to$ `[REDACTED_PRIVATE_KEY]`
3. **Log Truncation**: Truncates logs exceeding 50 KB by preserving head and tail buffers with a security truncation notice in the center.

---

## 7. Honest 4-State Classification & Scoring Integration

OpenProofPay enforces an absolute integrity rule: **Untested code is NEVER marked as passing.**

### Four States of Test Execution
| State | Condition | AI Verification Score Impact | Human Review Impact |
| :--- | :--- | :--- | :--- |
| **`PASSED`** | Exit code == 0 AND (`passedTests > 0` OR (`totalTests > 0 && failedTests === 0`)) | Full 25 / 25 points | Green badge on review gate |
| **`FAILED`** | Non-zero exit code OR `failedTests > 0` | 0 / 25 points (or proportional `(passed/total) * 25`) | Red badge on review gate; prompts revision |
| **`COULD_NOT_EXECUTE`** | Container timeout (120s), OOM killed (exit 137), build failure, or Docker daemon unavailable | 0 / 25 points | Amber warning badge; prompts re-run |
| **`NOT_CONFIGURED`** | No test runner or test suite detected in repository | 0 / 25 points | Blue badge; alerts employer that no tests exist |

### AI Verification Pipeline Integration
When `AIVerificationService.verifySubmission` runs:
1. It queries `TestExecutionModel` for `(submissionId, commitSha)`.
2. If no record exists, it automatically triggers `TestRunnerService.executeSubmissionTests` first.
3. Fact-based test execution metrics (exit code, pass/fail counts, sanitized logs) feed into `ScoringEngine`.
4. Passing tests contribute up to **25 points** toward the 0–100 verification score.

---

## 8. REST API Specification

### `POST /api/tasks/:taskId/test`
Triggers isolated test runner for the task's latest submission.
- **Auth**: `requireAuth` (`EMPLOYER` or `DEVELOPER` assigned to task).
- **Body**: `{ "submissionId"?: "string", "filesOverride"?: { ... } }`
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "id": "6732e...",
      "submissionId": "6732d...",
      "taskId": "6732c...",
      "commitSha": "f87a321",
      "runtimeEnvironment": "node:20-alpine",
      "frameworkDetected": "vitest",
      "commandsExecuted": ["npx vitest run"],
      "exitCode": 0,
      "status": "PASSED",
      "totalTests": 12,
      "passedTests": 12,
      "failedTests": 0,
      "skippedTests": 0,
      "durationMs": 420,
      "sanitizedLogs": "..."
    },
    "message": "Isolated test execution completed: PASSED"
  }
  ```

### `GET /api/tasks/:taskId/test-execution`
Returns the latest active test execution record for the task.

### `GET /api/submissions/:submissionId/test-execution`
Returns the test execution record for a specific submission.

---

## 9. Verification Gate Test Results

Integration tests in `/apps/api/src/modules/test-runner/test-runner.integration.test.ts` validate the entire pipeline:

```
Test Files  7 passed (7)
     Tests  72 passed (72)
  Duration  5.60s

✓ src/modules/auth/rbac.integration.test.ts (6)
✓ src/modules/auth/auth.integration.test.ts (9)
✓ src/services/TaskStateMachineService.test.ts (3)
✓ src/modules/github/github.integration.test.ts (10)
✓ src/modules/tasks/tasks.integration.test.ts (10)
✓ src/modules/ai-verification/ai-verification.integration.test.ts (11)
✓ src/modules/test-runner/test-runner.integration.test.ts (23)
```

- **Typecheck**: 100% clean TypeScript compilation across all monorepo packages.
- **Builds**: All 4 workspaces build cleanly without errors.

# OpenProofPay --- Immediate Fix Prompt for Antigravity

## Read this first

I am not asking you to redesign OpenProofPay or create a new project. I
want you to fix the existing implementation in my current repository.

The current bounty creation screen and role-switching behavior are not
what I want. GitHub PR file-change detection and the AI verification
flow are also not working correctly. The app appears to be using a
database from an older project.

**Inspect the actual code and fix the real end-to-end behavior. Do not
just change the UI or make the screen look functional.**

Before making changes: 1. Inspect the repository, Git status, frontend,
backend, MongoDB configuration, GitHub integration, PR submission flow,
AI verification service, and existing tests. 2. Trace the actual data
flow from the UI to the API, GitHub, database, and Gemini. 3. Identify
why each problem occurs. 4. Report the root cause of each problem. 5.
Then implement and test the fixes without replacing working parts of the
project.

Do not claim something works until you have tested it.

------------------------------------------------------------------------

# 1. Fix bounty creation: repository + issue number should fetch the issue automatically

## Current problem

The current screen asks the administrator to manually enter: -
Repository name - Issue title - Issue number - Description

This is wrong. The administrator should not have to copy and re-enter
information that already exists on GitHub.

The current screen is shown in the screenshot I provided. It has a
repository field, issue title field, issue number field, and description
field.

## Required behavior

The administrator should only need to:

1.  Select or enter the GitHub repository.
2.  Enter the GitHub issue number.
3.  Click **Fetch Issue** (or automatically fetch after valid input with
    a clear loading state).

Then the backend must fetch the real issue from GitHub using the
connected GitHub App/OAuth credentials.

For example:

``` text
Repository: owner/repository
Issue number: 42
```

The backend should retrieve the actual GitHub issue and automatically
populate: - Issue title - Issue description/body - Issue URL - Issue
number - Repository owner and name - Issue state - Labels, if useful -
Author, if useful - Other relevant metadata returned by GitHub

## UI requirements

-   Remove the manually editable **Issue Title** field.
-   Remove the manually editable **Description** field.
-   Do not ask the administrator to type a description that already
    exists in the GitHub issue.
-   Show the fetched issue title and description as a read-only preview.
-   Clearly display the repository and issue number that were fetched.
-   Show a loading indicator while fetching.
-   Show useful errors:
    -   Repository not found.
    -   Issue not found.
    -   Issue is not open.
    -   GitHub account/app does not have permission.
    -   GitHub API rate limit or temporary failure.
    -   Invalid repository name or issue number.
-   Provide a retry action.
-   Do not silently fill the form with fake/demo issue data.
-   Do not allow the user to continue if the issue fetch failed.
-   Avoid fetching pull requests as issues if the GitHub API returns a
    pull-request-shaped issue object.

If repositories are already available from the connected GitHub account,
prefer a repository selector populated from those real repositories
instead of requiring free-text entry. However, the administrator must
still be able to use the repository full name and issue number workflow.

## Step 2: amount and acceptance criteria

After the real issue is fetched: - Carry the actual issue title, body,
URL, repository ID, and issue number into step 2. - Let the
administrator enter the bounty amount and currency. - Generate suggested
acceptance criteria from the real issue content using AI only if this
feature can be grounded in the fetched issue. - Clearly label
AI-generated criteria as suggestions. - Let the administrator edit, add,
or remove criteria before publishing the bounty. - Do not invent
requirements that are not supported by the issue. - Keep the original
GitHub issue content visible for reference.

## Step 3: PayPal authorization

Keep the existing PayPal authorization step, but ensure it uses the
actual bounty amount and currency from the backend-validated task data.
Never trust a client-supplied amount or payment status.

## Acceptance test

Given a connected GitHub repository and a valid open issue number,
entering only the repository and issue number must fetch and display the
real issue title and body. The administrator must not have to type the
title or description manually.

------------------------------------------------------------------------

# 2. Remove the Admin vs. Developer Testing role switcher

## Current problem

The top navigation currently has a role-switcher pill similar to:

``` text
Admin Alice  ⇄  Dev Bob
```

It lets someone toggle between Admin and Developer workflows. I do not
want this feature in the product.

## Required behavior

-   Remove the role-switcher pill from the top navigation.
-   Remove the Admin Alice / Dev Bob demo-persona switching behavior.
-   Remove any frontend-only role toggle that changes the displayed user
    role without real authentication.
-   Remove test-persona controls and related explanatory UI from the
    normal application experience.
-   Do not replace it with another role-switcher control.

The application should use actual authenticated accounts and roles: - An
administrator signs in with an administrator account. - A developer
signs in with a developer account. - The user's role comes from the
authenticated backend session/token and database. - The frontend must
not be able to grant itself a different role.

## Authorization rules

-   A developer must never be able to access administrator pages or
    administrator APIs by changing frontend state, URL, local storage,
    or request payload.
-   Backend middleware must enforce role and resource permissions.
-   Administrator-only actions must be checked on the server.
-   A developer cannot approve their own submission or trigger their own
    payment.
-   Do not create a hidden or insecure way for a developer to switch
    into an administrator account.

If an administrator also needs to test the developer workflow, use a
separate real developer test account and sign in/out normally. Do not
impersonate another user through a role toggle.

## Acceptance test

-   No role-switcher pill appears in the application navigation.
-   A developer account cannot access admin routes or APIs.
-   An admin account can access admin routes.
-   Changing browser state or manually sending an admin role in an API
    request does not grant admin permissions.

------------------------------------------------------------------------

# 3. Fix MongoDB: OpenProofPay must not reuse the old project's database

## Current problem

The application appears to be connected to a MongoDB database from an
older project. Old project records are appearing in OpenProofPay.

I want OpenProofPay to use its own clean, separate database.

## Required behavior

First inspect: - The actual MongoDB connection string used by the API. -
The database name selected by that URI. - Any explicit Mongoose database
name or connection options. - All `.env` files and environment-variable
loading paths. - Local Docker Compose database configuration. -
Render/deployment database configuration, if present. - Which
collections currently exist and which application owns them.

Then:

1.  Configure OpenProofPay to use a dedicated database named
    `openproofpay` (or a clearly documented environment-specific name
    such as `openproofpay_dev`).
2.  Ensure the backend is actually connecting to that database, not
    merely changing a label in the frontend.
3.  Update `.env.example`, local setup instructions, and deployment
    configuration to use the correct dedicated database.
4.  Ensure all OpenProofPay models use the intended connection.
5.  Verify the connected database name at startup without logging
    credentials or the full connection string.
6.  Add a safe database health/diagnostic check that shows the database
    name and connection status to an authorized administrator or in
    development logs.

## Important data safety rule

Do not blindly drop the currently configured database. It may contain
data belonging to another project or environment.

Before any destructive operation: - Identify the exact database name and
environment. - Determine whether it is local development, shared
development, staging, or production. - Create a backup/export of any
existing data that might matter. - Show me the exact database name and
collections proposed for deletion. - Ask for my explicit confirmation
before dropping collections or a database. - Never delete a
production/shared database as part of an automatic startup or
migration. - Never run `dropDatabase()` automatically when the server
starts.

If the old database is a local development database and I explicitly
confirm that it can be cleared, provide a guarded reset command such as:

``` bash
npm run db:reset
```

The reset command must: - Print the exact target database name. - Refuse
to run in production. - Require an explicit confirmation flag or
interactive confirmation. - Never operate on a database whose name is
not an approved OpenProofPay development database. - Never silently fall
back to the old project's database. - Be documented.

Do not seed fake GitHub issues, PRs, users, AI reports, or PayPal
transactions into the real application database. If demo seed data is
needed, clearly isolate and label it.

## Acceptance test

The API connects to the dedicated OpenProofPay database. Old project
records are not shown. Existing unrelated databases remain untouched.

------------------------------------------------------------------------

# 4. Fix GitHub PR reading and changed-file detection --- this is a critical feature

## Current problem

The PR file-change detection is not working. The AI does not appear to
read the actual pull request changes properly.

This is one of the core features of OpenProofPay. A PR URL alone is not
enough. The backend must retrieve and analyze the actual GitHub PR data.

## Required PR ingestion flow

When a developer submits a GitHub PR URL, or when a GitHub webhook
detects a PR:

1.  Parse and validate the GitHub PR URL.
2.  Identify the owner, repository, and PR number.
3.  Verify the repository is connected and accessible.
4.  Fetch the PR metadata from GitHub.
5.  Fetch the PR's current head commit SHA.
6.  Fetch the PR's base commit SHA.
7.  Fetch the list of changed files using GitHub's Pull Requests API,
    specifically the equivalent of:

``` http
GET /repos/{owner}/{repo}/pulls/{pull_number}/files
```

8.  Fetch the PR details and commit information.
9.  Fetch the actual diff/patch for each changed file where available.
10. Fetch the original linked issue and the bounty acceptance criteria.
11. Fetch relevant source files and surrounding code at the PR head
    commit.
12. Save the fetched PR information and changed-file metadata in the
    database.
13. Start the verification job using the fetched data.
14. Display the actual fetched data in the review UI.

Do not infer changed files from the PR title, issue number, branch name,
or user-entered text.

## Changed-file data

For each changed file, capture as much of the following as GitHub
provides: - File path. - Change status: added, modified, removed,
renamed. - Additions. - Deletions. - Changes. - Patch/unified diff. -
Blob SHA or equivalent file identifier where available. - Raw file
content at the exact commit, where needed and permitted.

Handle pagination. GitHub may return multiple pages of changed files or
commits. Do not silently analyze only the first page.

Handle large PRs: - Respect GitHub API limits. - Handle
missing/truncated patches. - Fetch raw file contents at the exact commit
when necessary. - Record files that could not be retrieved. - Do not
claim to have inspected files whose contents were unavailable. - Handle
binary files separately rather than sending unreadable binary data to
Gemini.

## Verify the actual implementation

Trace the entire flow in the existing code: - Frontend PR submission
form/button. - API route/controller. - GitHub service/client. - GitHub
App installation token generation. - PR metadata fetch. - Changed-files
API call. - Database persistence. - Background verification job. -
Gemini context builder. - Verification report persistence. - Frontend
report rendering.

Find the exact point where the data is lost or incorrectly passed. Fix
the root cause rather than adding a separate disconnected
implementation.

Potential problems to investigate (do not assume these are the cause): -
Wrong GitHub API endpoint. - Incorrect owner/repository/PR number
parsing. - Missing GitHub App installation token or insufficient
permissions. - Missing `Pull requests: Read-only` permission. -
Pagination not handled. - Diff/patch not persisted. - Changed files
fetched but not passed into the AI context builder. - AI service
receiving only the PR title/body. - Background worker using an old/stale
submission record. - Frontend rendering placeholder data instead of the
backend report. - API response shape mismatch between backend and
frontend. - Errors being swallowed and replaced with an empty array. -
PR webhook not triggering verification. - Manual PR import not
triggering the same pipeline.

## Required review UI

The administrator review screen must display: - PR title and number. -
Repository name. - PR author. - PR URL. - Base branch and head branch. -
Exact head commit SHA. - Number of changed files. - Additions and
deletions. - A list of every retrieved changed file. - Per-file change
status. - Actual diff/patch where available. - A clear warning for files
whose patch/content could not be retrieved. - Verification status and
last verification time.

If GitHub returns 8 changed files, the UI should show those actual 8
files, not a hardcoded sample list or empty placeholder.

Add useful loading, empty, and error states. If the GitHub API fails,
show the actual error and allow retry. Do not convert an API failure
into "No files changed."

## Re-verification on new commits

-   Every verification run must be tied to the exact PR head SHA.
-   When the PR receives new commits, fetch the new changed files and
    head SHA.
-   Queue a new verification run.
-   Preserve the old report and mark it outdated.
-   Never show the previous commit's report as if it verifies the new
    commit.
-   Before administrator approval, compare the report SHA with the PR's
    current head SHA. If they differ, require re-verification.

## Acceptance test

Use a real accessible PR with known changed files: - Import the PR. -
Confirm the backend fetches the correct PR number and head SHA. -
Confirm the changed-file count matches GitHub. - Confirm the paths and
patches correspond to the real PR. - Confirm the same file contents/diff
reach the Gemini context builder. - Confirm the saved report references
that exact head SHA. - Confirm the review UI displays those actual files
and findings.

------------------------------------------------------------------------

# 5. Fix Gemini AI verification --- it must analyze the actual PR, not just produce generic text

## Current problem

The AI part does not feel like it is actually working. It must read the
PR changes and evaluate them against the GitHub issue and bounty
criteria.

A generic AI summary, generic score, or hardcoded "looks good" result is
not acceptable.

## Required AI input

Gemini must receive grounded, relevant context: - Original GitHub issue
title and body. - Bounty description and administrator-approved
acceptance criteria. - PR title and body. - Repository name. - PR
number. - Exact head commit SHA. - Actual changed-file paths and
statuses. - Actual unified diffs. - Relevant source file contents at
that commit. - Related tests and configuration files. - Test execution
result and sanitized logs, if tests ran. - Explicit list of
files/content that could not be fetched.

Do not send only: - PR title. - PR description. - Issue title. - A
manually typed description. - A list of filenames without code changes.

## Required AI analysis

For every acceptance criterion, Gemini should explain: - Is it
satisfied, partially satisfied, not satisfied, or unable to determine? -
Which actual code changes support that conclusion? - Which file and
line/diff range supports the finding? - What is missing or incorrect? -
What should the contributor change?

Also analyze: - Functional correctness. - Bugs and edge cases. -
Security concerns. - Regression risks. - Code quality. - Whether tests
were added or updated. - Whether the implementation matches the issue's
intent.

The AI must not invent file paths, line numbers, tests, or code
behavior.

## Evidence validation

After Gemini returns its structured analysis: - Validate each cited file
path against the exact repository commit. - Validate line ranges against
the actual file contents at that commit. - Validate quoted snippets
against the actual file content or diff. - Reject unsupported evidence
or label it unverified. - Do not show hallucinated evidence as fact.

Use a strict structured response schema. If Gemini returns invalid JSON
or unsupported references, validate/retry safely and report the problem
rather than showing fabricated results.

## Prompt-injection protection

Treat issue descriptions, PR descriptions, source code, comments, README
files, commit messages, and test logs as untrusted input. They must
never override the AI's system instructions or request secrets.

## AI transparency in the UI

Show: - Which PR commit SHA was analyzed. - Which changed files were
actually included in AI analysis. - Which related context files were
included. - Which files could not be fetched or were omitted due to
token limits. - Per-criterion findings and evidence. - AI
confidence/limitations. - Test outcome separately from AI opinion.

If the AI provider fails, show `AI_VERIFICATION_FAILED` or an equivalent
explicit state. Do not generate a fake report.

## Acceptance test

Use a real PR with a known code change and a known issue: - Gemini must
mention the actual changed file paths. - Its analysis must refer to
actual code in the diff. - It must compare the change with the real
issue and criteria. - Evidence must pass server-side validation. - If
the PR does not implement a required behavior, the AI should identify
the missing behavior rather than giving a generic positive summary.

------------------------------------------------------------------------

# 6. Make the verification pipeline observable and debuggable

Add structured logs and useful statuses for the pipeline:

``` text
PR_RECEIVED
PR_METADATA_FETCHED
PR_FILES_FETCHED
PR_DIFFS_FETCHED
ISSUE_CONTEXT_FETCHED
SOURCE_CONTEXT_BUILT
TESTS_QUEUED
TESTS_RUNNING
TESTS_PASSED / TESTS_FAILED / TESTS_NOT_RUN
AI_QUEUED
AI_RUNNING
AI_COMPLETED / AI_FAILED
EVIDENCE_VALIDATED
REPORT_SAVED
```

For each stage, store: - Submission ID. - Repository and PR number. -
Head SHA. - Stage. - Start/end time. - Success/failure. - Safe error
details.

Do not log access tokens, private keys, PayPal secrets, or full
sensitive environment variables.

The administrator should be able to see whether the pipeline is: -
Waiting. - Fetching GitHub data. - Fetching changed files. - Running
tests. - Analyzing with Gemini. - Validating evidence. - Completed. -
Failed, with a retry option where safe.

Do not use a fake progress bar that reaches 100% without actual work.

------------------------------------------------------------------------

# 7. Database reset and test data rules

-   Use a dedicated OpenProofPay database.
-   Do not reuse old-project collections.
-   Do not automatically wipe any database.
-   Do not mix seed/demo records with real GitHub or PayPal data.
-   Add a guarded development-only reset command after showing the exact
    target.
-   Require my explicit confirmation before deleting existing records.
-   Keep test fixtures in isolated test databases.
-   Automated tests must never connect to or wipe the real
    development/production database.

------------------------------------------------------------------------

# 8. Required implementation order

Do not try to fix everything with superficial UI changes. Follow this
order:

### Phase 1 --- Diagnose and fix GitHub PR ingestion

This is the most important feature: - PR URL parsing. - GitHub
authentication/permissions. - PR metadata. - Changed files and diffs. -
Pagination. - Database persistence. - Exact head SHA.

### Phase 2 --- Fix Gemini context and real analysis

-   Pass actual changed-file diffs and relevant source into Gemini.
-   Compare against real issue and criteria.
-   Validate evidence.
-   Save the report tied to exact SHA.
-   Display real findings.

### Phase 3 --- Fix bounty creation UI

-   Repository + issue number only.
-   Fetch real GitHub issue automatically.
-   Read-only issue title/body preview.
-   Admin enters bounty amount and reviews acceptance criteria.

### Phase 4 --- Remove role switcher and enforce real roles

-   Remove `Admin Alice ⇄ Dev Bob`.
-   Remove demo persona controls.
-   Enforce roles in backend and frontend.

### Phase 5 --- Isolate and clean database safely

-   Inspect current MongoDB URI/database.
-   Configure dedicated OpenProofPay DB.
-   Show exact proposed reset target.
-   Ask for confirmation before destructive reset.
-   Verify old project database remains untouched.

### Phase 6 --- End-to-end testing

Test the complete flow with a real accessible GitHub repository and
PR: 1. Admin connects repository. 2. Admin enters issue number. 3.
OpenProofPay fetches issue details automatically. 4. Admin creates
bounty and authorizes PayPal Sandbox payment. 5. Developer signs in
using a separate developer account and claims bounty. 6. Developer
submits a real PR URL. 7. Backend fetches actual PR metadata, changed
files, diffs, and head SHA. 8. Gemini analyzes the actual code changes
against the issue and criteria. 9. Tests run in the isolated runner, or
are honestly marked not run. 10. Evidence is validated. 11. Admin
reviews the real files and AI findings. 12. Admin makes the final
decision. 13. PayPal capture and separate payout follow the approved
flow.

------------------------------------------------------------------------

# 9. What I expect you to report back

After inspecting the code, give me a concise table:

  Problem                            Root cause found   Files changed   How verified   Status
  ---------------------------------- ------------------ --------------- -------------- --------
  Issue details not auto-fetched                                                       
  Role switcher                                                                        
  Old database reused                                                                  
  PR changed files not detected                                                        
  Gemini not analyzing actual code                                                     

Then implement the fixes. At the end, report: - What is now working. -
Which real PR was used to verify file detection. - How many changed
files GitHub returned and how many OpenProofPay fetched. - Which actual
changed files Gemini analyzed. - Whether evidence validation passed. -
Which tests ran and their real results. - Which features remain blocked
by credentials or permissions.

**Do not tell me "AI is integrated" just because an API key is
configured. Prove that Gemini received the real PR diff and returned
findings grounded in that diff.**

------------------------------------------------------------------------

# Product behavior I want

The intended experience is simple:

**Admin creates a bounty:** choose a connected repository, enter an
issue number, and OpenProofPay fetches the issue automatically. Admin
sets the amount and confirms the acceptance criteria.

**Developer submits work:** developer claims the bounty and submits a
GitHub PR.

**OpenProofPay verifies the work:** the backend reads the actual PR,
retrieves every changed file and diff, runs tests safely, and asks
Gemini to compare the real code changes with the original issue and
acceptance criteria.

**Admin reviews and decides:** admin sees the real files, diffs, tests,
AI findings, and evidence, then makes the final decision.

**PayPal handles payment:** only after human approval does the
authorized payment get captured and the developer payout get processed.

That is the product I want. Fix the actual data flow so this works end
to end.

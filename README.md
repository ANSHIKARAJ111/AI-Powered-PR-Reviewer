\# CodePilot AI — AI-Powered Pull Request Reviewer



\### Automating Code Reviews with Google Gemini and GitHub Apps



CodePilot AI is a full-stack, AI-powered GitHub Pull Request review platform that analyzes code changes, identifies potential bugs and security vulnerabilities, and delivers actionable feedback directly to GitHub.



The application combines Google Gemini, GitHub Apps, Node.js, Express, React, TypeScript, PostgreSQL, and Prisma to automate code analysis and provide a centralized dashboard for exploring review findings.



\## Key Features



\- \*\*AI-Powered Code Analysis:\*\* Uses Google Gemini to review pull request diffs and generate structured feedback.

\- \*\*Automated GitHub Integration:\*\* Processes GitHub pull requests through a GitHub App and verified webhook events.

\- \*\*Inline Review Comments:\*\* Posts findings on relevant lines of code within GitHub pull requests.

\- \*\*Security Vulnerability Detection:\*\* Identifies potential security issues, runtime bugs, missing validation, and code quality problems.

\- \*\*Severity Classification:\*\* Categorizes findings as CRITICAL, HIGH, MEDIUM, or LOW.

\- \*\*Interactive Analytics Dashboard:\*\* Displays review statistics, severity distribution, findings, and review history.

\- \*\*Search and Filtering:\*\* Enables searching reviews, filtering findings by severity, and sorting results.

\- \*\*Responsive UI:\*\* Supports desktop and mobile layouts with dark and light themes.

\- \*\*Persistent Storage:\*\* Stores review history and findings using PostgreSQL and Prisma ORM.

\- \*\*Duplicate Review Prevention:\*\* Uses pull request commit SHAs and database uniqueness constraints to reduce redundant reviews.

\- \*\*Publishing Recovery:\*\* Tracks GitHub publishing status, attempts retries, and supports startup recovery of unpublished reviews.

\- \*\*Webhook Security:\*\* Validates GitHub webhook signatures using HMAC-SHA256.

\- \*\*API Rate Limiting:\*\* Protects application endpoints against excessive requests.

\- \*\*Automated Testing:\*\* Includes validation, API integration, webhook security, and rate-limit tests using Vitest.



\## Technology Stack



| Layer | Technologies |

|---|---|

| Frontend | React, TypeScript, Vite, CSS |

| Backend | Node.js, Express.js, TypeScript |

| AI Engine | Google Gemini |

| GitHub Integration | GitHub Apps, GitHub REST API, Webhooks, Octokit |

| Database | PostgreSQL |

| ORM | Prisma |

| Validation | Zod |

| Testing | Vitest |

| Development Tools | Git, GitHub, VS Code, Cloudflare Quick Tunnel |



\## System Architecture



```text

&#x20;                 GitHub Pull Request

&#x20;                         |

&#x20;                         v

&#x20;                  GitHub Webhook

&#x20;                         |

&#x20;                         v

&#x20;               HMAC Signature Validation

&#x20;                         |

&#x20;                         v

&#x20;               Express.js Backend API

&#x20;                         |

&#x20;              +----------+-----------+

&#x20;              |                      |

&#x20;              v                      v

&#x20;      GitHub REST API          PostgreSQL

&#x20;              |                 + Prisma

&#x20;              v                      ^

&#x20;       Fetch PR Metadata              |

&#x20;       and Code Diffs                 |

&#x20;              |                      |

&#x20;              v                      |

&#x20;       Google Gemini AI               |

&#x20;              |                      |

&#x20;              v                      |

&#x20;     Structured AI Findings ----------+

&#x20;              |

&#x20;              v

&#x20;    GitHub Review Publishing

&#x20;      + Inline Comments

&#x20;              |

&#x20;              v

&#x20;      GitHub Pull Request





&#x20;         React + Vite Dashboard

&#x20;                 |

&#x20;                 v

&#x20;         Express REST API

&#x20;                 |

&#x20;                 v

&#x20;      Reviews and Analytics

&#x20;         from PostgreSQL

```



\## How CodePilot AI Works



\*\*1. Pull Request Detection\*\*



A developer opens or updates a pull request in a GitHub repository where the CodePilot GitHub App is installed.



\*\*2. Webhook Verification\*\*



GitHub sends a webhook event to the backend. The server validates its HMAC-SHA256 signature before processing the event.



\*\*3. Code Diff Retrieval\*\*



The backend authenticates through the GitHub App and retrieves pull request information and modified code.



\*\*4. AI-Powered Analysis\*\*



The code diff is sent to Google Gemini, which analyzes potential runtime bugs, security vulnerabilities, missing input validation, and code quality issues.



\*\*5. Structured Findings Validation\*\*



AI-generated findings are validated using Zod, and file paths and comment line numbers are checked against the available pull request diff.



\*\*6. Database Storage\*\*



Review summaries, findings, severity levels, and commit SHAs are stored in PostgreSQL using Prisma.



\*\*7. GitHub Feedback\*\*



The application publishes an automated GitHub review, including a summary and inline comments when findings can be mapped to verified diff lines.



\*\*8. Dashboard Visualization\*\*



The React dashboard displays review history, issue severity distribution, statistics, and suggested fixes.



\## Project Structure



```text

CodePilot\_AI/

|

+-- apps/

|   |

|   +-- api/

|   |   +-- prisma/

|   |   |   +-- migrations/

|   |   |   +-- schema.prisma

|   |   |

|   |   +-- src/

|   |   |   +-- config/

|   |   |   +-- services/

|   |   |   |   +-- reviewService.ts

|   |   |   |   +-- recoveryService.ts

|   |   |   +-- generated/

|   |   |   +-- server.ts

|   |   |

|   |   +-- tests/

|   |   |   +-- basic.test.ts

|   |   |   +-- api.test.ts

|   |   |   +-- webhook.test.ts

|   |   |   +-- rate-limit.test.ts

|   |   |

|   |   +-- package.json

|   |

|   +-- web/

|       +-- src/

|       |   +-- App.tsx

|       |   +-- App.css

|       |   +-- index.css

|       |   +-- main.tsx

|       +-- package.json

|

+-- .gitignore

+-- README.md

```



\## Getting Started



\### Prerequisites



\- Node.js and npm

\- PostgreSQL

\- Git

\- A GitHub account

\- A configured GitHub App

\- A Google Gemini API key



\### 1. Clone the Repository



```bash

git clone https://github.com/ANSHIKARAJ111/AI-Powered-PR-Reviewer.git

cd AI-Powered-PR-Reviewer

```



\### 2. Install Backend Dependencies



```bash

cd apps/api

npm install

```



\### 3. Configure Environment Variables



Create an `.env` file in `apps/api` and configure the required environment variables.



```env

DATABASE\_URL="postgresql://USER:PASSWORD@127.0.0.1:5433/codepilot\_db"



GITHUB\_APP\_ID="YOUR\_GITHUB\_APP\_ID"

GITHUB\_INSTALLATION\_ID="YOUR\_INSTALLATION\_ID"

GITHUB\_PRIVATE\_KEY\_PATH="secrets/github-app.pem"

GITHUB\_WEBHOOK\_SECRET="YOUR\_WEBHOOK\_SECRET"



GEMINI\_API\_KEY="YOUR\_GEMINI\_API\_KEY"

```



The values above are placeholders. Never commit actual API keys, passwords, webhook secrets, or GitHub App private keys.



The example database port matches the project's local development setup. Adjust it to match your PostgreSQL configuration.



\### 4. Set Up Prisma



With PostgreSQL running and the database configured:



```bash

npx prisma migrate deploy

npx prisma generate

```



\### 5. Start the Backend



```bash

npm run dev

```



Local development endpoints:



\- Backend API: `http://127.0.0.1:5000`

\- GitHub webhook receiver: `http://127.0.0.1:5001/api/webhooks/github`



The webhook receiver is a separate local listener. GitHub requires a publicly reachable webhook URL, which must be configured separately.



\### 6. Start the Frontend



Open another terminal:



```bash

cd apps/web

npm install

npm run dev

```



Open:



`http://localhost:5173`



\## API Endpoints



| Method | Endpoint | Description |

|---|---|---|

| GET | `/api/health` | Check backend availability |

| GET | `/api/reviews` | Retrieve stored reviews and findings |

| GET | `/api/reviews/:id` | Retrieve an individual review |

| POST | `/api/reviews/run` | Trigger a review in local development |

| GET | `/api/github/pulls` | Retrieve available GitHub pull requests |

| POST | `/api/webhooks/github` | Receive and verify GitHub webhook events |



The webhook endpoint is served on the separate webhook port in the local development configuration. The manual review endpoint is intended for local development, not unrestricted public use.



\## Automated Testing



The project uses Vitest for backend testing.



Run the complete test suite:



```bash

cd apps/api

npx vitest run

```



Initial test results:



| Test Suite | Passed |

|---|---:|

| Basic Validation | 5 |

| API Integration | 5 |

| GitHub Webhook Security | 5 |

| API Rate Limiting | 2 |

| \*\*Total\*\* | \*\*17\*\* |



\*\*17/17 tests passed\*\* during local verification.



API integration and webhook tests require the local backend to be running. The rate-limit test intentionally sends repeated requests and can temporarily affect other requests to the same local server.



\## Security Measures



CodePilot AI includes several security-focused safeguards:



\- HMAC-SHA256 webhook signature verification

\- Environment-based credential management

\- GitHub App authentication

\- Request rate limiting

\- Request body size limits

\- Zod validation of structured AI findings

\- Validation of GitHub inline comment locations

\- Commit SHA-based duplicate review detection

\- PostgreSQL-backed review publishing state tracking



\## Reliability and Limitations



The implementation includes GitHub publishing retries, database tracking, duplicate review prevention, and a startup recovery mechanism.



Current limitations include:



\- The reference implementation is configured for a specific GitHub repository.

\- Large pull requests with 100 or more changed files require pagination support.

\- Startup recovery is not a fully managed, durable background job queue.

\- Database-backed publishing locks reduce concurrent publishing conflicts but do not guarantee exactly-once delivery under every crash or timeout scenario.

\- AI-generated findings may contain inaccuracies and should be independently verified.

\- Public production deployment requires further security hardening, hosting configuration, and end


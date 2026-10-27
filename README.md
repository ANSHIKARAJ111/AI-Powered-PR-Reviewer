<div align="center">

# CodePilot AI

### AI-Powered GitHub Pull Request Reviewer

**Automated code reviews, actionable findings, and a centralized dashboard for GitHub pull requests.**

[**Live Dashboard**](https://codepilot-ai-web-navy.vercel.app) · [**GitHub Repository**](https://github.com/ANSHIKARAJ111/AI-Powered-PR-Reviewer)

</div>

---

## Overview

CodePilot AI is a full-stack application that reviews GitHub pull requests using **Google Gemini AI**. It integrates with GitHub through a GitHub App and signed webhooks to analyze pull-request changes, identify potential bugs and code-quality issues, and publish review feedback to GitHub. A separate web dashboard allows an authorized user to browse reviews, inspect findings, and view analytics.

The project combines AI-assisted code analysis, webhook automation, a relational database, and a deployed web interface in a single workflow.

## Key Features

- **AI-powered PR analysis:** Uses Google Gemini to analyze pull-request changes and produce review findings.
- **Automated GitHub integration:** Handles signed GitHub webhook events, including pull-request updates, and triggers reviews.
- **GitHub review publishing:** Posts review feedback back to the associated pull request.
- **Manual review:** Allows an authenticated user to trigger a review from the dashboard.
- **Findings Explorer:** Shows severity, category, file path, line number, explanation, and suggested remediation.
- **Review history and analytics:** Stores and displays completed reviews and their findings.
- **GitHub OAuth authentication:** Restricts dashboard API access to an authorized GitHub account using a signed session cookie.
- **Persistent storage:** Uses PostgreSQL through Prisma ORM.
- **Cloud deployment:** React frontend on Vercel, Express API on Render, and PostgreSQL on Neon.

## Architecture

```mermaid
flowchart TD
    Developer[Developer] -->|Opens or updates PR| GitHub[GitHub Repository]
    GitHub -->|Signed webhook| Webhook[GitHub Webhook Handler]
    Webhook --> Review[Review Service]
    Review -->|PR changes| GitHubAPI[GitHub API]
    Review -->|Analyze diff| Gemini[Google Gemini AI]
    Gemini -->|Findings and suggestions| Review
    Review -->|Persist results| DB[(Neon PostgreSQL)]
    Review -->|Publish review| GitHubAPI

    User[Authorized Dashboard User] --> Frontend[React + Vite on Vercel]
    Frontend -->|GitHub OAuth / Authenticated API| Backend[Express + TypeScript on Render]
    Backend --> DB
    Backend -->|Manual review request| Review
```

### Review Workflow

1. A developer opens or updates a pull request in a repository where the GitHub App is installed.
2. GitHub sends a signed webhook event to the backend.
3. The backend validates the webhook and retrieves pull-request changes.
4. Gemini AI analyzes the changes and generates actionable findings.
5. The application saves results in PostgreSQL and publishes feedback on GitHub.
6. An authorized user can inspect the review, findings, and analytics in the dashboard.

## Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| AI Analysis | Google Gemini AI |
| Version Control Integration | GitHub App, GitHub REST API, Webhooks |
| Authentication | GitHub OAuth, signed HTTP-only session cookies |
| ORM | Prisma |
| Database | PostgreSQL (Neon) |
| Frontend Hosting | Vercel |
| Backend Hosting | Render |

## Live Demo

- **Frontend:** https://codepilot-ai-web-navy.vercel.app
- **Backend:** https://codepilot-ai-api.onrender.com
- **Source:** https://github.com/ANSHIKARAJ111/AI-Powered-PR-Reviewer

> **Access note:** The deployed dashboard is configured for an allowlisted GitHub account. Other GitHub accounts cannot access private review data unless explicitly authorized by the application owner.

## Project Structure

```text
CodePilot_AI/
├── apps/
│   ├── api/                 # Express API, GitHub integration and review logic
│   │   ├── prisma/          # Prisma schema and database migrations
│   │   └── src/             # TypeScript API source
│   └── web/                 # React + Vite dashboard
│       └── src/             # Dashboard components and styles
├── README.md
└── .gitignore
```

## Local Development

### Prerequisites

- Node.js and npm
- PostgreSQL database
- A Google Gemini API key
- A GitHub App installed on a test repository
- A GitHub OAuth App for dashboard sign-in

### 1. Clone the repository

```bash
git clone https://github.com/ANSHIKARAJ111/AI-Powered-PR-Reviewer.git
cd AI-Powered-PR-Reviewer
```

### 2. Install backend dependencies

```bash
cd apps/api
npm install
```

Configure your backend environment using the variables appropriate to your GitHub App, OAuth App, database, and AI provider. A typical configuration includes:

```dotenv
NODE_ENV=development
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
GEMINI_API_KEY=your_gemini_api_key
GITHUB_APP_ID=your_github_app_id
GITHUB_INSTALLATION_ID=your_installation_id
GITHUB_PRIVATE_KEY_PATH=path_to_your_github_app_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_OAUTH_CLIENT_ID=your_oauth_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_oauth_client_secret
GITHUB_ALLOWED_LOGIN=your_github_username
SESSION_SECRET=your_long_random_session_secret
FRONTEND_ORIGIN=http://localhost:5173
```

> **Important:** Keep `.env` files, private keys, access tokens, and database credentials out of Git. Use deployment environment settings or secret-file facilities in production.

Generate the Prisma client and apply database migrations using the project's Prisma configuration. Then start the API with the script defined in `apps/api/package.json`.

```bash
npx prisma generate
```

### 3. Install and run the frontend

In a separate terminal:

```bash
cd apps/web
npm install
npm run dev
```

Open the URL printed by Vite (typically `http://localhost:5173`). For local authentication and API connectivity, configure the local frontend proxy, OAuth callback URL, and backend to match your development environment.

> **Setup note:** This repository uses a Prisma configuration file and GitHub-specific credentials. Check the scripts in `apps/api/package.json` and the actual Prisma configuration before running migrations or initializing a new database; avoid running destructive database commands against production.

## Security Considerations

- GitHub webhook payloads are validated against a configured webhook secret.
- Dashboard authentication uses GitHub OAuth and a signed, HTTP-only session cookie.
- Access is restricted to a configured GitHub login.
- Protected API routes require a valid authenticated session in production.
- Sensitive credentials and GitHub App private keys should only be provided through secure environment variables or secret files.
- Never commit `.env` files, generated credentials, API keys, or GitHub private keys.

Authentication, review generation, review publishing, and a logged-out request to the reviews API have been manually exercised in the deployed environment. These checks are not a substitute for a complete security audit.

## Validation Highlights

The application has been tested with a sample pull request containing intentional errors. Gemini identified:

- A **high-severity potential runtime error** from accessing `.name` when `Array.prototype.find()` returns `undefined`.
- A **medium-severity input validation issue** involving negative prices or discount values.

The dashboard displayed the generated review and both findings, including suggested fixes, and the review was published on GitHub.

## Future Enhancements

- Support multiple authorized users and organizations with role-based access control.
- Add review rules, severity thresholds, and repository-specific settings.
- Introduce more comprehensive automated integration and security tests.
- Add richer analytics, trend tracking, and downloadable reports.
- Expand AI review support for more languages and larger change sets.

## Project Links

- [Live Web App](https://codepilot-ai-web-navy.vercel.app)
- [Source Repository](https://github.com/ANSHIKARAJ111/AI-Powered-PR-Reviewer)

---

<div align="center">

**CodePilot AI — Smarter pull requests through AI-assisted code reviews.**

</div>

# story-proof-bot

**GitHub Action that automatically verifies pull request code changes against Jira story Acceptance Criteria using GPT-4o.**

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-story--proof--bot-blue?logo=github)](https://github.com/marketplace/actions/story-proof-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/amadalavamsi/story-proof-bot)](https://github.com/amadalavamsi/story-proof-bot/releases)

---

## The Problem

Every team has had this conversation after a bug bash or production incident:

> *"Did we actually implement everything in the Acceptance Criteria?"*

Developers focus on implementation. Reviewers focus on code quality. **Nobody is automatically checking whether the delivered code satisfies the Jira story's ACs.**

`story-proof-bot` fills that gap.

---

## How It Works

```
PR Raised
    │
    ├── Extract story ID from PR title  (e.g. PROJ-123)
    │
    ├── Fetch Acceptance Criteria from Jira Cloud
    │
    ├── Read PR diff from GitHub
    │
    ├── Analyze with GPT-4o (via GitHub Models — no extra API key)
    │
    └── Post structured compliance report as PR comment
```

Every push to the PR **updates the same comment** — no spam, always current.

---

## Example Report

When a PR is raised with title `feat(PROJ-456): implement password reset flow`, the bot automatically posts:

```
⚠️ story-proof-bot — AC Compliance Report

| Story    | PROJ-456 — Password reset via email     |
| Status   | ⚠️ Partially Implemented               |
| Coverage | ✅ 3 implemented · ❌ 1 missing · ❓ 1 cannot verify |

> Password reset email and strength validation are implemented,
> but the 30-minute token expiry is missing.

|    | AC                                              | Finding                                                        |
|----|-------------------------------------------------|----------------------------------------------------------------|
| ✅ | AC-1: User enters email on /forgot-password     | ForgotPasswordController.ts — route and form handler present   |
| ✅ | AC-2: Email sent only if account exists         | auth.service.ts:47 — existingUser check before sendResetEmail()|
| ❌ | AC-3: Reset link expires after 30 minutes       | No TTL found in token.service.ts                               |
|    |                                                 | 💡 Add expiresAt field and validate on token redemption        |
| ✅ | AC-4: Password minimum strength requirements    | password.validator.ts — minLength(8) and number check present  |
| ❓ | AC-5: Success message regardless of email exists| Cannot verify UI copy from code alone — manual check needed    |
```

---

## Setup

### Step 1 — Add secrets to your repository

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|--------|-------|
| `JIRA_BASE_URL` | `https://your-company.atlassian.net` |
| `JIRA_EMAIL` | Your Jira account email |
| `JIRA_TOKEN` | [Create an API token here](https://id.atlassian.com/manage-profile/security/api-tokens) |

> ✅ **No OpenAI API key needed.** The action uses GitHub Models (GPT-4o on Azure AI) authenticated with the automatic `GITHUB_TOKEN`. Same infrastructure as GitHub Copilot. No extra cost.

### Step 2 — Add the workflow file

Create `.github/workflows/story-proof-bot.yml` in your repository:

```yaml
name: AC Compliance Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  compliance-check:
    name: Verify Acceptance Criteria
    runs-on: ubuntu-latest
    steps:
      - name: 🛡️ story-proof-bot AC Compliance Check
        uses: amadalavamsi/story-proof-bot@v1
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-token: ${{ secrets.JIRA_TOKEN }}
```

### Step 3 — Follow PR title convention

The bot extracts the Jira story ID from the PR title using pattern `[A-Z]+-\d+`:

| PR Title | Result |
|----------|--------|
| `feat(PROJ-123): add payment failure email` | ✅ Checks PROJ-123 |
| `TEAM-456 implement password reset` | ✅ Checks TEAM-456 |
| `fix typo in readme` | ⏭️ Skipped silently — no story ID |

That's it. Every PR from now on gets an automatic compliance report.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `jira-base-url` | ✅ | — | Jira Cloud base URL |
| `jira-email` | ✅ | — | Jira account email |
| `jira-token` | ✅ | — | Jira API token |
| `github-token` | — | auto | Provided automatically by GitHub |
| `openai-api-key` | — | — | Only if you prefer direct OpenAI billing instead of GitHub Models |
| `story-id-pattern` | — | `[A-Z]+-\d+` | Regex to extract story ID from PR title |
| `max-diff-lines` | — | `2000` | Cap on diff lines sent to AI (controls token cost) |
| `fail-on-missing` | — | `false` | Set `true` to block PR merge when ACs are missing |

## Outputs

| Output | Description |
|--------|-------------|
| `compliance-status` | `pass` \| `partial` \| `fail` \| `cannot-verify` |
| `story-id` | The Jira story ID that was checked |

---

## Understanding the Report

| Status | Meaning |
|--------|---------|
| ✅ Implemented | Clearly visible in the PR diff with direct evidence |
| ⚠️ Partial | Some aspect is present but not fully covered |
| ❌ Missing | No evidence found in the code changes |
| ❓ Cannot Verify | Cannot be assessed from code alone (UX, timing, external systems) |

**Important:** This action does **not block merges by default.** It is a signal for the developer and reviewer — not an automated gate. Humans always decide. Set `fail-on-missing: 'true'` only if your team explicitly agrees.

---

## Advanced Usage

### Block merge on missing ACs
```yaml
- uses: amadalavamsi/story-proof-bot@v1
  with:
    jira-base-url: ${{ secrets.JIRA_BASE_URL }}
    jira-email: ${{ secrets.JIRA_EMAIL }}
    jira-token: ${{ secrets.JIRA_TOKEN }}
    fail-on-missing: 'true'
```

### Use with your own OpenAI key
```yaml
- uses: amadalavamsi/story-proof-bot@v1
  with:
    jira-base-url: ${{ secrets.JIRA_BASE_URL }}
    jira-email: ${{ secrets.JIRA_EMAIL }}
    jira-token: ${{ secrets.JIRA_TOKEN }}
    openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

### Custom story ID pattern
```yaml
- uses: amadalavamsi/story-proof-bot@v1
  with:
    jira-base-url: ${{ secrets.JIRA_BASE_URL }}
    jira-email: ${{ secrets.JIRA_EMAIL }}
    jira-token: ${{ secrets.JIRA_TOKEN }}
    story-id-pattern: 'SP-\d+'   # matches SP-123 only
```

---

## Security & Privacy

- Uses `GITHUB_TOKEN` — scoped to the current repo, expires after the job
- Powered by **GitHub Models (Azure AI)** — same infrastructure as GitHub Copilot
- Your code diff is **not used to train AI models** (GitHub's policy)
- Jira token is passed as a secret — never logged or exposed
- Can be self-audited — all source code is in [`src/`](src/)

---

## Development

```bash
# Clone
git clone https://github.com/amadalavamsi/story-proof-bot.git
cd story-proof-bot

# Install
npm install

# Build — always run before committing (dist/ must be committed for Actions)
npm run build

# Typecheck
npm run typecheck
```

> **Why commit `dist/`?** GitHub Actions runs `dist/index.js` directly from the repo without installing dependencies. This is the standard pattern for JavaScript Actions.

---

## Contributing

Issues and PRs welcome. If you have a Jira setup where AC extraction doesn't work correctly, open an issue with a sanitized example of your story structure.

---

## License

MIT © [amadalavamsi](https://github.com/amadalavamsi)

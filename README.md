# 🛡️ spec-proof Action

> **Automatically verify PR code changes against Jira story Acceptance Criteria using GPT-4o.**

Every time a PR is opened or updated, this GitHub Action:
1. Extracts the Jira story ID from the PR title (e.g. `PROJ-123`)
2. Fetches the Acceptance Criteria from Jira Cloud
3. Reads the PR diff
4. Sends both to GPT-4o for analysis
5. Posts a structured compliance report as a PR comment

---

## Example Report

<img src="docs/example-report.png" alt="Example PR comment" />

```
## ⚠️ spec-proof — AC Compliance Report

| Story | PROJ-123 — Add payment failure email |
| Status | ⚠️ Partially Implemented |
| Coverage | ✅ 3 implemented · ❌ 1 missing · ❓ 1 cannot verify |

> Email sending is implemented and test mode suppression is present, but the unsubscribe link is missing.

| | AC | Finding |
|---|---|---|
| ✅ | AC-1: User receives email within 30s | Found in email.service.ts — sendPaymentFailureNotification() is called on payment failure |
| ✅ | AC-2: Email contains order ID and reason | Template in email.service.ts includes orderId and failureReason |
| ✅ | AC-3: Not sent in test mode | testMode guard is present in email.service.ts:22 |
| ❌ | AC-4: Unsubscribe link in all emails | No unsubscribe link found in the email template |
| ❓ | AC-5: Email delivered within 30 seconds | Cannot verify delivery timing from code alone |
```

---

## Setup

### 1. Add secrets to your repository

Go to **Settings → Secrets and variables → Actions** and add:

| Secret | Description |
|--------|-------------|
| `JIRA_BASE_URL` | Your Jira Cloud URL, e.g. `https://your-company.atlassian.net` |
| `JIRA_EMAIL` | Your Jira account email |
| `JIRA_TOKEN` | Jira API token — [create one here](https://id.atlassian.com/manage-profile/security/api-tokens) |
| `OPENAI_API_KEY` | Your OpenAI API key |

### 2. Add the workflow file

Create `.github/workflows/spec-proof.yml` in your repository:

```yaml
name: spec-proof AC Compliance Check

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  compliance-check:
    name: Verify ACs
    runs-on: ubuntu-latest
    steps:
      - name: 🛡️ Run spec-proof AC Compliance Check
        uses: your-org/spec-proof-action@v1
        with:
          jira-base-url: ${{ secrets.JIRA_BASE_URL }}
          jira-email: ${{ secrets.JIRA_EMAIL }}
          jira-token: ${{ secrets.JIRA_TOKEN }}
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
```

### 3. PR title convention

The action looks for a Jira story ID in the PR title by default pattern `[A-Z]+-\d+`.

✅ Works: `feat(PROJ-123): add payment failure email`  
✅ Works: `PROJ-123 Add payment failure notification`  
❌ Skipped: `fix typo in readme` (no story ID — action skips silently)

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `jira-base-url` | ✅ | — | Your Jira Cloud base URL |
| `jira-email` | ✅ | — | Jira account email |
| `jira-token` | ✅ | — | Jira API token |
| `openai-api-key` | ✅ | — | OpenAI API key |
| `github-token` | — | `${{ github.token }}` | Auto-provided |
| `story-id-pattern` | — | `[A-Z]+-\d+` | Regex to extract story ID |
| `max-diff-lines` | — | `2000` | Max diff lines sent to AI |
| `fail-on-missing` | — | `false` | Fail (block merge) if ACs are missing |

## Outputs

| Output | Description |
|--------|-------------|
| `compliance-status` | `pass` \| `partial` \| `fail` \| `cannot-verify` |
| `story-id` | The Jira story ID that was checked |

---

## Philosophy

- **This does not block merges by default.** It's a signal, not a gate. Set `fail-on-missing: 'true'` only if your team agrees.
- **"Cannot verify" is valid.** Some ACs (UX, timing, external systems) can't be verified from code — the action marks them honestly.
- **Evidence-backed.** Every finding references specific files or functions — no magic.
- **AI is replaceable.** The structure is designed so GPT-4o can be swapped for any other model.

---

## Development

```bash
# Install
npm install

# Build (required before committing — dist/ must be committed)
npm run build

# Typecheck
npm run typecheck
```

> **Important:** Always run `npm run build` and commit the `dist/` folder before pushing. GitHub Actions runs from `dist/index.js` directly.

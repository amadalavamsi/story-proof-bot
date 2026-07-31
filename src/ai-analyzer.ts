// ─────────────────────────────────────────────────────────────────────────────
// AIAnalyzer — sends ACs + PR diff to GPT-4o via GitHub Models or OpenAI
//
// Priority:
//   1. GitHub Models (via GITHUB_TOKEN) — zero extra secrets, same Azure infra
//   2. OpenAI API key — fallback if explicitly provided
// ─────────────────────────────────────────────────────────────────────────────

import OpenAI from 'openai';
import * as core from '@actions/core';
import { AcceptanceCriterion, ACFinding, ComplianceResult, OverallStatus } from './types';

// GitHub Models endpoint — powered by Azure AI, authenticated via GITHUB_TOKEN
const GITHUB_MODELS_ENDPOINT = 'https://models.inference.ai.azure.com';

export type AIConfig =
  | { mode: 'github-models'; githubToken: string }
  | { mode: 'openai'; apiKey: string };

export class AIAnalyzer {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(config: AIConfig) {
    if (config.mode === 'github-models') {
      core.info('AI provider: GitHub Models (GPT-4o via Azure AI — using GITHUB_TOKEN)');
      this.client = new OpenAI({
        baseURL: GITHUB_MODELS_ENDPOINT,
        apiKey: config.githubToken,
      });
    } else {
      core.info('AI provider: OpenAI (GPT-4o — using provided API key)');
      this.client = new OpenAI({
        apiKey: config.apiKey,
      });
    }

    // Both GitHub Models and OpenAI support the gpt-4o model name
    this.model = 'gpt-4o';
  }

  async analyze(
    storyId: string,
    storyTitle: string,
    acs: AcceptanceCriterion[],
    diff: string,
  ): Promise<ComplianceResult> {
    core.info(`Sending ${acs.length} ACs + diff to ${this.model}...`);

    const systemPrompt = `You are a senior engineering compliance reviewer.

Your job is to analyze a GitHub pull request diff and determine whether it implements each Acceptance Criterion (AC) from a Jira story.

For each AC, assign one of these statuses:
- "implemented"   → Clearly visible in the code changes with direct evidence
- "partial"       → Some aspect is present but not fully implemented
- "missing"       → No evidence found in the diff at all
- "cannot-verify" → The AC cannot be verified from code alone (e.g. UX, performance, business logic not in diff)

Rules:
- Be precise. Reference specific file names or function names from the diff when possible.
- Do NOT assume something is implemented if you don't see it — missing is better than false positive.
- "cannot-verify" is a valid outcome, not a failure.
- Always respond with valid JSON only. No markdown, no prose outside the JSON.`;

    const userPrompt = `Story: ${storyId} — ${storyTitle}

Acceptance Criteria to verify:
${acs.map(ac => `${ac.id}: ${ac.text}`).join('\n')}

Pull Request Diff:
\`\`\`diff
${diff}
\`\`\`

Respond ONLY with this JSON (no extra text):
{
  "findings": [
    {
      "id": "AC-1",
      "status": "implemented" | "partial" | "missing" | "cannot-verify",
      "evidence": "Specific reason. Reference file names or function names if applicable.",
      "recommendation": "What to add or fix. Omit this field if status is implemented."
    }
  ],
  "summary": "One sentence overall assessment of the PR's compliance."
}`;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 4096,
    });

    const raw = response.choices[0].message.content ?? '{}';
    core.debug(`AI raw response: ${raw}`);

    const parsed = JSON.parse(raw) as {
      findings: Array<{
        id: string;
        status: string;
        evidence: string;
        recommendation?: string;
      }>;
      summary: string;
    };

    // Map findings back to ACs (in case AI skips or reorders)
    const findings: ACFinding[] = acs.map(ac => {
      const found = parsed.findings?.find(f => f.id === ac.id);
      return {
        id: ac.id,
        text: ac.text,
        status: (found?.status as ACFinding['status']) ?? 'cannot-verify',
        evidence: found?.evidence ?? 'No analysis returned for this AC.',
        recommendation: found?.recommendation,
      };
    });

    const overallStatus = this.deriveOverallStatus(findings);

    core.info(`Overall compliance status: ${overallStatus}`);
    findings.forEach(f => core.info(`  ${f.id}: ${f.status}`));

    return {
      storyId,
      storyTitle,
      overallStatus,
      findings,
      summary: parsed.summary ?? '',
    };
  }

  private deriveOverallStatus(findings: ACFinding[]): OverallStatus {
    const statuses = findings.map(f => f.status);

    if (statuses.every(s => s === 'implemented')) return 'pass';
    if (statuses.every(s => s === 'missing')) return 'fail';
    if (statuses.every(s => s === 'cannot-verify')) return 'cannot-verify';

    // implemented + cannot-verify only = pass (cannot-verify is not a failure)
    if (statuses.every(s => s === 'implemented' || s === 'cannot-verify')) return 'pass';

    // any missing = fail if ALL non-implemented are missing, otherwise partial
    if (statuses.some(s => s === 'missing') && !statuses.some(s => s === 'partial')) return 'fail';

    return 'partial';
  }
}

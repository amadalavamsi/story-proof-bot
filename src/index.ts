// ─────────────────────────────────────────────────────────────────────────────
// index.ts — Entry point for the GitHub Action
// ─────────────────────────────────────────────────────────────────────────────

import * as core from '@actions/core';
import * as github from '@actions/github';
import { JiraClient } from './jira-client';
import { AIAnalyzer } from './ai-analyzer';
import { buildPRComment } from './report-builder';

const COMMENT_MARKER = '<!-- spec-proof-report -->';

async function run(): Promise<void> {
  try {
    // ── 1. Read inputs ──────────────────────────────────────────────────────
    const jiraBaseUrl = core.getInput('jira-base-url', { required: true }).replace(/\/$/, '');
    const jiraEmail = core.getInput('jira-email', { required: true });
    const jiraToken = core.getInput('jira-token', { required: true });
    const openaiApiKey = core.getInput('openai-api-key');   // optional
    const githubToken = core.getInput('github-token', { required: true });
    const storyIdPattern = core.getInput('story-id-pattern') || '[A-Z]+-\\d+';
    const maxDiffLines = parseInt(core.getInput('max-diff-lines') || '2000', 10);
    const failOnMissing = core.getInput('fail-on-missing') === 'true';

    // ── 2. Validate trigger ─────────────────────────────────────────────────
    const context = github.context;
    const pr = context.payload.pull_request;

    if (!pr) {
      core.setFailed('This action only runs on pull_request events.');
      return;
    }

    const prTitle = pr.title as string;
    const prNumber = pr.number as number;
    const { owner, repo } = context.repo;

    core.info(`─────────────────────────────────────`);
    core.info(`spec-proof AC Compliance Check`);
    core.info(`PR #${prNumber}: ${prTitle}`);
    core.info(`─────────────────────────────────────`);

    // ── 3. Extract story ID from PR title ───────────────────────────────────
    const match = prTitle.match(new RegExp(storyIdPattern));

    if (!match) {
      core.warning(
        `No Jira story ID found in PR title using pattern "${storyIdPattern}". ` +
        `Title: "${prTitle}". Skipping compliance check.`,
      );
      return;
    }

    const storyId = match[0];
    core.info(`Story ID: ${storyId}`);
    core.setOutput('story-id', storyId);

    // ── 4. Fetch ACs from Jira ──────────────────────────────────────────────
    const jira = new JiraClient(jiraBaseUrl, jiraEmail, jiraToken);
    const { title: storyTitle, acs } = await jira.getStory(storyId);

    if (acs.length === 0) {
      core.warning(
        `No acceptance criteria found in story ${storyId}. ` +
        `Add ACs to the Jira story before raising a PR.`,
      );
      return;
    }

    core.info(`Found ${acs.length} acceptance criteria:`);
    acs.forEach(ac => core.info(`  ${ac.id}: ${ac.text}`));

    // ── 5. Get PR diff ──────────────────────────────────────────────────────
    const octokit = github.getOctokit(githubToken);

    const { data: files } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    core.info(`PR touches ${files.length} files`);

    // Build a readable diff, skip binary files
    const diff = files
      .filter(f => f.patch)
      .map(f => `### ${f.filename} [${f.status}] +${f.additions} -${f.deletions}\n${f.patch}`)
      .join('\n\n');

    const diffLines = diff.split('\n');
    const wasTruncated = diffLines.length > maxDiffLines;
    const truncatedDiff = wasTruncated
      ? diffLines.slice(0, maxDiffLines).join('\n') + `\n\n... [diff truncated at ${maxDiffLines} lines — ${diffLines.length - maxDiffLines} lines omitted]`
      : diff;

    if (wasTruncated) {
      core.warning(`Diff was ${diffLines.length} lines — truncated to ${maxDiffLines} to manage AI token usage.`);
    }

    // ── 6. AI analysis ──────────────────────────────────────────────────────
    // Prefer GitHub Models (no extra secrets needed) — fall back to OpenAI if key provided
    const aiConfig = openaiApiKey
      ? { mode: 'openai' as const, apiKey: openaiApiKey }
      : { mode: 'github-models' as const, githubToken };

    const analyzer = new AIAnalyzer(aiConfig);
    const result = await analyzer.analyze(storyId, storyTitle, acs, truncatedDiff);

    core.setOutput('compliance-status', result.overallStatus);

    // ── 7. Post PR comment (upsert — update if already exists) ─────────────
    const commentBody = COMMENT_MARKER + '\n' + buildPRComment(result, prTitle);

    const { data: existingComments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const existingComment = existingComments.find(c => c.body?.includes(COMMENT_MARKER));

    if (existingComment) {
      await octokit.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body: commentBody,
      });
      core.info(`Updated existing compliance comment (#${existingComment.id})`);
    } else {
      const { data: newComment } = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });
      core.info(`Posted compliance comment (#${newComment.id})`);
    }

    // ── 8. Optional: fail action when ACs are missing ───────────────────────
    if (failOnMissing && (result.overallStatus === 'fail' || result.overallStatus === 'partial')) {
      const missingACs = result.findings
        .filter(f => f.status === 'missing')
        .map(f => `${f.id}: ${f.text}`)
        .join('\n  ');

      if (missingACs) {
        core.setFailed(`Missing acceptance criteria detected:\n  ${missingACs}`);
        return;
      }
    }

    core.info(`✅ spec-proof completed — status: ${result.overallStatus}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Give helpful hints for common errors
    if (message.includes('401') || message.includes('403')) {
      core.setFailed(
        `Jira authentication failed. Check your JIRA_EMAIL and JIRA_TOKEN secrets.\n` +
        `Create a token at: https://id.atlassian.com/manage-profile/security/api-tokens\n` +
        `Original error: ${message}`,
      );
    } else if (message.includes('404')) {
      core.setFailed(
        `Jira story not found. Check that the story ID in the PR title is correct and the token has access.\n` +
        `Original error: ${message}`,
      );
    } else {
      core.setFailed(message);
    }
  }
}

run();

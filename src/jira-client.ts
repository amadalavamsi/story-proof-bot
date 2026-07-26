// ─────────────────────────────────────────────────────────────────────────────
// JiraClient — fetches story details and acceptance criteria from Jira Cloud
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios';
import * as core from '@actions/core';
import { AcceptanceCriterion } from './types';

export class JiraClient {
  private readonly authHeader: string;

  constructor(
    private readonly baseUrl: string,
    email: string,
    token: string,
  ) {
    const encoded = Buffer.from(`${email}:${token}`).toString('base64');
    this.authHeader = `Basic ${encoded}`;
  }

  async getStory(storyId: string): Promise<{ title: string; acs: AcceptanceCriterion[] }> {
    core.info(`Fetching Jira story: ${storyId}`);

    const response = await axios.get(
      `${this.baseUrl}/rest/api/3/issue/${storyId}`,
      {
        headers: {
          Authorization: this.authHeader,
          Accept: 'application/json',
        },
      },
    );

    const fields = response.data.fields;
    const title: string = fields.summary;

    core.info(`Story found: "${title}"`);

    const acs = this.extractACs(fields);
    return { title, acs };
  }

  // ── AC Extraction ──────────────────────────────────────────────────────────

  private extractACs(fields: Record<string, unknown>): AcceptanceCriterion[] {
    // 1. Look for a dedicated "Acceptance Criteria" custom field
    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;

      const keyLower = key.toLowerCase();
      if (keyLower.includes('acceptance') || keyLower.includes('criteria')) {
        const text = this.toPlainText(value);
        if (text.trim()) {
          core.info(`Found ACs in custom field: ${key}`);
          return this.parseLines(text);
        }
      }
    }

    // 2. Fall back to description — look for an "Acceptance Criteria" section
    if (fields.description) {
      const fullText = this.toPlainText(fields.description);
      const acSection = this.extractACSection(fullText);
      if (acSection) {
        core.info('Extracted ACs from description section');
        return this.parseLines(acSection);
      }

      // 3. Last resort — use all bullet points from description
      core.warning('No dedicated AC section found — using all bullet points from description');
      return this.parseLines(fullText);
    }

    return [];
  }

  /**
   * Extract the section of text that comes after "Acceptance Criteria" heading.
   */
  private extractACSection(text: string): string | null {
    const lines = text.split('\n');
    let inACSection = false;
    const acLines: string[] = [];

    for (const line of lines) {
      const lower = line.toLowerCase().trim();

      if (!inACSection) {
        if (
          lower === 'acceptance criteria' ||
          lower === 'acceptance criteria:' ||
          lower === 'ac:' ||
          lower === 'acs:' ||
          lower.startsWith('acceptance criteria')
        ) {
          inACSection = true;
        }
        continue;
      }

      // Stop at the next heading-like line
      if (line.trim() && !line.startsWith('-') && !line.startsWith('*') && !line.match(/^\d+[.)]/)) {
        const isNextSection =
          lower === 'description' ||
          lower === 'background' ||
          lower === 'technical notes' ||
          lower === 'notes' ||
          lower === 'out of scope';
        if (isNextSection) break;
      }

      acLines.push(line);
    }

    return acLines.length > 0 ? acLines.join('\n') : null;
  }

  /**
   * Parse text lines into AcceptanceCriterion objects.
   * Handles: bullet points, numbered lists, AC-N: prefixes.
   */
  private parseLines(text: string): AcceptanceCriterion[] {
    const lines = text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 5); // Skip very short lines

    const bulletLines = lines.filter(
      l =>
        l.match(/^[-*•·]\s+.+/) ||
        l.match(/^\d+[.)]\s+.+/) ||
        l.match(/^AC-?\d+[.:]\s*.+/i),
    );

    const source = bulletLines.length > 0 ? bulletLines : lines;

    return source.map((line, index) => ({
      id: `AC-${index + 1}`,
      text: line
        .replace(/^[-*•·]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/^AC-?\d+[.:]\s*/i, '')
        .trim(),
    }));
  }

  /**
   * Convert Atlassian Document Format (ADF) or plain string to plain text.
   */
  private toPlainText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';

    const node = value as Record<string, unknown>;

    // Atlassian Document Format
    if (node.type === 'doc' || node.content) {
      return this.adfToText(node);
    }

    return JSON.stringify(value);
  }

  private adfToText(node: Record<string, unknown>): string {
    if (node.type === 'text') return (node.text as string) ?? '';
    if (node.type === 'hardBreak') return '\n';

    const children = (node.content as Record<string, unknown>[] | undefined) ?? [];
    const childText = children.map(child => this.adfToText(child)).join('');

    switch (node.type) {
      case 'paragraph':
        return childText + '\n';
      case 'bulletList':
      case 'orderedList':
        return childText;
      case 'listItem':
        return `- ${childText.trim()}\n`;
      case 'heading':
        return `\n${childText.trim()}\n`;
      case 'strong':
      case 'em':
        return childText;
      default:
        return childText;
    }
  }
}

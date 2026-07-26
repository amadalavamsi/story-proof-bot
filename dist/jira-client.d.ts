import { AcceptanceCriterion } from './types';
export declare class JiraClient {
    private readonly baseUrl;
    private readonly authHeader;
    constructor(baseUrl: string, email: string, token: string);
    getStory(storyId: string): Promise<{
        title: string;
        acs: AcceptanceCriterion[];
    }>;
    private extractACs;
    /**
     * Extract the section of text that comes after "Acceptance Criteria" heading.
     */
    private extractACSection;
    /**
     * Parse text lines into AcceptanceCriterion objects.
     * Handles: bullet points, numbered lists, AC-N: prefixes.
     */
    private parseLines;
    /**
     * Convert Atlassian Document Format (ADF) or plain string to plain text.
     */
    private toPlainText;
    private adfToText;
}

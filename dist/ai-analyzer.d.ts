import { AcceptanceCriterion, ComplianceResult } from './types';
export type AIConfig = {
    mode: 'github-models';
    githubToken: string;
} | {
    mode: 'openai';
    apiKey: string;
};
export declare class AIAnalyzer {
    private readonly client;
    private readonly model;
    constructor(config: AIConfig);
    analyze(storyId: string, storyTitle: string, acs: AcceptanceCriterion[], diff: string): Promise<ComplianceResult>;
    private deriveOverallStatus;
}

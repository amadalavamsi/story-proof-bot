// ─────────────────────────────────────────────────────────────────────────────
// Types — shared across all modules
// ─────────────────────────────────────────────────────────────────────────────

export interface AcceptanceCriterion {
  id: string;   // AC-1, AC-2, etc.
  text: string;
}

export type ACStatus = 'implemented' | 'partial' | 'missing' | 'cannot-verify';
export type OverallStatus = 'pass' | 'partial' | 'fail' | 'cannot-verify';

export interface ACFinding {
  id: string;
  text: string;
  status: ACStatus;
  evidence: string;
  recommendation?: string;
}

export interface ComplianceResult {
  storyId: string;
  storyTitle: string;
  overallStatus: OverallStatus;
  findings: ACFinding[];
  summary: string;
}

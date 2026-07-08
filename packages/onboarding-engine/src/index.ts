import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';

export interface OnboardingSummary {
  projectRoot: string;
  memoriesCreated: number;
  lawsFound: number;
  decisionsFound: number;
  constraintsFound: number;
  sourceArtifactsIndexed: number;
  conflictsFound: number;
  openQuestions: number;
}

export class OnboardingEngine {
  constructor(private readonly audit: AuditStore) {}

  onboard(projectRoot: string): OnboardingSummary {
    const summary: OnboardingSummary = {
      projectRoot,
      memoriesCreated: 0,
      lawsFound: 0,
      decisionsFound: 0,
      constraintsFound: 0,
      sourceArtifactsIndexed: 0,
      conflictsFound: 0,
      openQuestions: 0,
    };
    this.audit.record(createAuditEvent('PROJECT_ONBOARDED', { ...summary }));
    return summary;
  }
}


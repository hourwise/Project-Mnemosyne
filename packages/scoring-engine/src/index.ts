import type { MemoryKind, SourceType } from '@mnemosyne/schema';

export const sourceTypeBaseScores: Record<SourceType, number> = {
  law: 0.98,
  adr: 0.9,
  code: 0.88,
  test: 0.82,
  readme: 0.8,
  user_instruction: 0.75,
  conversation: 0.62,
  model_inference: 0.45,
  speculation: 0.25,
};

export interface ReliabilityInputs {
  sourceType: SourceType;
  kind?: MemoryKind;
  hashStillValid?: boolean;
  sourceAvailable?: boolean;
  confirmations?: number;
  contradictions?: number;
  superseded?: boolean;
  ageDays?: number;
  authoritative?: boolean;
  codeAndDocsAgree?: boolean;
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

export function scoreReliability(inputs: ReliabilityInputs): number {
  let score = sourceTypeBaseScores[inputs.sourceType];
  if (inputs.sourceAvailable === false) score -= 0.35;
  if (inputs.hashStillValid === false) score -= 0.25;
  score += Math.min(inputs.confirmations ?? 0, 5) * 0.02;
  score -= Math.min(inputs.contradictions ?? 0, 5) * 0.08;
  if (inputs.superseded) score -= 0.3;
  if (inputs.authoritative) score += 0.03;
  if (inputs.codeAndDocsAgree === true) score += 0.04;
  if (inputs.codeAndDocsAgree === false) score -= 0.1;
  score -= decayPenalty(inputs.kind, inputs.sourceType, inputs.ageDays ?? 0);
  score -= riskPenalty(inputs.riskLevel);
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

function decayPenalty(kind: MemoryKind | undefined, sourceType: SourceType, ageDays: number): number {
  if (ageDays <= 0) return 0;

  const slow =
    kind === 'law' ||
    kind === 'policy' ||
    kind === 'decision' ||
    sourceType === 'law' ||
    sourceType === 'adr' ||
    sourceType === 'code' ||
    sourceType === 'test';

  const fast =
    kind === 'task' ||
    kind === 'hypothesis' ||
    sourceType === 'conversation' ||
    sourceType === 'model_inference' ||
    sourceType === 'speculation';

  const rate = fast ? 0.006 : slow ? 0.001 : 0.003;
  return Math.min(0.3, ageDays * rate);
}

function riskPenalty(riskLevel: ReliabilityInputs['riskLevel']): number {
  switch (riskLevel) {
    case 'critical':
      return 0.12;
    case 'high':
      return 0.08;
    case 'medium':
      return 0.03;
    case 'low':
    case undefined:
      return 0;
  }
}

import type { SourceType } from '@mnemosyne/schema';

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
  hashStillValid?: boolean;
  confirmations?: number;
  contradictions?: number;
  superseded?: boolean;
}

export function scoreReliability(inputs: ReliabilityInputs): number {
  let score = sourceTypeBaseScores[inputs.sourceType];
  if (inputs.hashStillValid === false) score -= 0.25;
  score += Math.min(inputs.confirmations ?? 0, 5) * 0.02;
  score -= Math.min(inputs.contradictions ?? 0, 5) * 0.08;
  if (inputs.superseded) score -= 0.3;
  return Math.max(0, Math.min(1, Number(score.toFixed(3))));
}

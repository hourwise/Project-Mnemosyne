import type { MemoryRecord } from '@mnemosyne/schema';

const slowDecayKinds = new Set(['law', 'policy', 'decision']);

export class DecayEngine {
  decay(memory: MemoryRecord, ageDays: number): MemoryRecord {
    const rate = slowDecayKinds.has(memory.kind) ? 0.001 : 0.005;
    const reliability = Math.max(0, Number((memory.reliability - ageDays * rate).toFixed(3)));
    return { ...memory, reliability };
  }
}

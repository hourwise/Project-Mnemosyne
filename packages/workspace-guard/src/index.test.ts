import { describe, expect, it } from 'vitest';
import { WorkspaceGuard } from './index.js';

describe('WorkspaceGuard', () => {
  it('rejects parent-directory escapes', () => {
    const guard = new WorkspaceGuard('/repo/.project-ananke/almanac');
    const decision = guard.checkInsideAlmanac('../secrets.txt');
    expect(decision.allowed).toBe(false);
  });

  it('allows paths inside the Almanac root', () => {
    const guard = new WorkspaceGuard('/repo/.project-ananke/almanac');
    const decision = guard.checkInsideAlmanac('journal/session.md');
    expect(decision.allowed).toBe(true);
  });
});

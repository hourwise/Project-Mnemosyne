import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { InMemoryAuditStore } from '@mnemosyne/audit-engine';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkspaceGuard } from './index.js';

describe('WorkspaceGuard', () => {
  let tempDir: string;
  let almanacRoot: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mnemosyne-guard-'));
    almanacRoot = join(tempDir, '.project-ananke', 'almanac');
    mkdirSync(join(almanacRoot, 'journal'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('rejects parent-directory escapes', () => {
    const guard = new WorkspaceGuard(almanacRoot);
    const decision = guard.checkRead('../secrets.txt');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('PATH_ESCAPE_DENIED');
  });

  it('rejects absolute paths outside the Almanac root', () => {
    const guard = new WorkspaceGuard(almanacRoot);
    const decision = guard.checkRead(resolve(tempDir, 'outside.txt'));

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('PATH_ESCAPE_DENIED');
  });

  it('allows reads and writes inside the Almanac root', () => {
    const guard = new WorkspaceGuard(almanacRoot);
    const readDecision = guard.checkRead('journal/session.md');
    const writeDecision = guard.checkWrite('context-packs/task.json');

    expect(readDecision.allowed).toBe(true);
    expect(writeDecision.allowed).toBe(true);
  });

  it('denies deletes unless runtime policy allows them', () => {
    const guard = new WorkspaceGuard(almanacRoot);
    const denied = guard.checkDelete('journal/session.md');
    const allowed = guard.checkDelete('journal/session.md', { allowDelete: true });

    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('DELETE_REQUIRES_POLICY');
    expect(allowed.allowed).toBe(true);
  });

  it('records path escape audit events when an audit store is supplied', () => {
    const audit = new InMemoryAuditStore();
    const guard = new WorkspaceGuard(almanacRoot, { audit });

    guard.checkWrite('../outside.txt');

    expect(audit.list({ eventType: 'PATH_ESCAPE_DENIED' })).toHaveLength(1);
    expect(audit.list()[0]?.metadata.requestedPath).toBe('../outside.txt');
  });

  it('rejects symlink escapes when the platform permits test links', () => {
    const outsideDir = join(tempDir, 'outside');
    const linkPath = join(almanacRoot, 'journal', 'escape-link');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(outsideDir, 'secret.txt'), 'secret');

    try {
      symlinkSync(outsideDir, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    const guard = new WorkspaceGuard(almanacRoot);
    const decision = guard.checkRead('journal/escape-link/secret.txt');

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('PATH_ESCAPE_DENIED');
  });
});

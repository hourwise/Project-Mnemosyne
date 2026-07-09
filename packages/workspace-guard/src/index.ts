import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createAuditEvent, type AuditStore } from '@mnemosyne/audit-engine';

export type WorkspaceOperation = 'read' | 'write' | 'delete';

export type PathDenyReason =
  | 'PATH_ESCAPE_DENIED'
  | 'DELETE_REQUIRES_POLICY'
  | 'INVALID_PATH';

export type PathAccessDecision =
  | {
      allowed: true;
      operation: WorkspaceOperation;
      requestedPath: string;
      resolvedPath: string;
      canonicalPath: string;
    }
  | {
      allowed: false;
      operation: WorkspaceOperation;
      requestedPath: string;
      resolvedPath: string;
      canonicalPath?: string;
      reason: PathDenyReason;
    };

export interface WorkspaceGuardOptions {
  audit?: AuditStore;
}

export interface DeletePolicy {
  allowDelete: boolean;
}

export class WorkspaceGuard {
  readonly almanacRoot: string;
  readonly canonicalAlmanacRoot: string;
  private readonly audit?: AuditStore;

  constructor(almanacRoot: string, options: WorkspaceGuardOptions = {}) {
    this.almanacRoot = resolve(almanacRoot);
    this.canonicalAlmanacRoot = canonicalizePath(this.almanacRoot);
    this.audit = options.audit;
  }

  checkInsideAlmanac(requestedPath: string): PathAccessDecision {
    return this.checkRead(requestedPath);
  }

  checkRead(requestedPath: string): PathAccessDecision {
    return this.checkPath(requestedPath, 'read');
  }

  checkWrite(requestedPath: string): PathAccessDecision {
    return this.checkPath(requestedPath, 'write');
  }

  checkDelete(requestedPath: string, policy: DeletePolicy = { allowDelete: false }): PathAccessDecision {
    const pathDecision = this.checkPath(requestedPath, 'delete');
    if (!pathDecision.allowed) return pathDecision;

    if (!policy.allowDelete) {
      return {
        allowed: false,
        operation: 'delete',
        requestedPath,
        resolvedPath: pathDecision.resolvedPath,
        canonicalPath: pathDecision.canonicalPath,
        reason: 'DELETE_REQUIRES_POLICY',
      };
    }

    return pathDecision;
  }

  private checkPath(requestedPath: string, operation: WorkspaceOperation): PathAccessDecision {
    if (!requestedPath.trim()) {
      return {
        allowed: false,
        operation,
        requestedPath,
        resolvedPath: this.almanacRoot,
        reason: 'INVALID_PATH',
      };
    }

    const resolvedPath = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(this.almanacRoot, requestedPath);

    if (hasParentTraversal(requestedPath)) {
      return this.denyPathEscape(operation, requestedPath, resolvedPath);
    }

    const canonicalPath = canonicalizePath(resolvedPath);
    if (!isInsideRoot(this.canonicalAlmanacRoot, canonicalPath)) {
      return this.denyPathEscape(operation, requestedPath, resolvedPath, canonicalPath);
    }

    return {
      allowed: true,
      operation,
      requestedPath,
      resolvedPath,
      canonicalPath,
    };
  }

  private denyPathEscape(
    operation: WorkspaceOperation,
    requestedPath: string,
    resolvedPath: string,
    canonicalPath?: string,
  ): PathAccessDecision {
    this.audit?.record(
      createAuditEvent('PATH_ESCAPE_DENIED', {
        operation,
        requestedPath,
        resolvedPath,
        canonicalPath,
        almanacRoot: this.almanacRoot,
        canonicalAlmanacRoot: this.canonicalAlmanacRoot,
      }),
    );

    return {
      allowed: false,
      operation,
      requestedPath,
      resolvedPath,
      canonicalPath,
      reason: 'PATH_ESCAPE_DENIED',
    };
  }
}

function canonicalizePath(path: string): string {
  const resolvedPath = resolve(path);
  if (existsSync(resolvedPath)) {
    return realpathSync.native(resolvedPath);
  }

  const missingSegments: string[] = [];
  let cursor = resolvedPath;
  while (!existsSync(cursor)) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      return resolvedPath;
    }
    missingSegments.unshift(basename(cursor));
    cursor = parent;
  }

  return resolve(realpathSync.native(cursor), ...missingSegments);
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function hasParentTraversal(requestedPath: string): boolean {
  return requestedPath.split(/[\\/]+/).includes('..');
}

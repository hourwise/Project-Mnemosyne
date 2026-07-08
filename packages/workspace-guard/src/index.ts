import { isAbsolute, relative, resolve, sep } from 'node:path';

export type PathAccessDecision =
  | { allowed: true; resolvedPath: string }
  | { allowed: false; resolvedPath: string; reason: 'PATH_ESCAPE_DENIED' };

export class WorkspaceGuard {
  readonly almanacRoot: string;

  constructor(almanacRoot: string) {
    this.almanacRoot = resolve(almanacRoot);
  }

  checkInsideAlmanac(requestedPath: string): PathAccessDecision {
    const resolvedPath = resolve(this.almanacRoot, requestedPath);
    const rel = relative(this.almanacRoot, resolvedPath);
    const escaped = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);

    if (escaped) {
      return { allowed: false, resolvedPath, reason: 'PATH_ESCAPE_DENIED' };
    }

    return { allowed: true, resolvedPath };
  }
}

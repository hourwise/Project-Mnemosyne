import {
  ProjectRecord,
  ProjectVaultManifest,
  RestartPack,
  type ProjectRecord as ProjectRecordModel,
  type ProjectVaultManifest as ProjectVaultManifestModel,
  type RestartPack as RestartPackModel,
  type RestartPackItem,
} from '@mnemosyne/schema';

export interface RestartPackRequest {
  project: ProjectVaultManifestModel;
  task: ProjectRecordModel;
  completed?: ProjectRecordModel[];
  outstanding?: ProjectRecordModel[];
  relevant?: ProjectRecordModel[];
  branch?: string;
  lastVerifiedCommit?: string;
}

export interface RestartPackOptions {
  now?: () => string;
  tokenBudget?: number;
}

export interface RestartPackSelection {
  completedIds?: string[];
  outstandingIds?: string[];
  relevantIds?: string[];
  branch?: string;
  lastVerifiedCommit?: string;
  tokenBudget?: number;
}

/** Builds deterministic restart packs from explicitly classified portable records. */
export class RestartPackEngine {
  build(request: RestartPackRequest, options: RestartPackOptions = {}): RestartPackModel {
    const project = ProjectVaultManifest.parse(request.project);
    const task = ProjectRecord.parse(request.task);
    if (task.projectId !== project.projectId) throw new Error('Restart task belongs to a different project.');
    if (task.kind !== 'task-state' || task.scope !== 'task_state') {
      throw new Error('Restart packs require a task-state record as their task.');
    }

    const budget = options.tokenBudget ?? Number.POSITIVE_INFINITY;
    if (options.tokenBudget !== undefined && (!Number.isFinite(budget) || budget <= 0)) {
      throw new Error('tokenBudget must be a positive finite number.');
    }
    const generatedAt = (options.now ?? (() => new Date().toISOString()))();
    const selected: Record<'completed' | 'outstanding' | 'relevant', RestartPackItem[]> = {
      completed: [],
      outstanding: [],
      relevant: [],
    };
    const warnings: string[] = [];
    const seen = new Set<string>([task.id]);
    let usedTokens = estimateTextTokens(headerText(project.name, task.content, request.branch, request.lastVerifiedCommit));
    let staleCount = 0;
    let lowReliabilityCount = 0;
    let truncated = false;

    for (const section of ['completed', 'outstanding', 'relevant'] as const) {
      const records = [...(request[section] ?? [])].sort((a, b) => a.id.localeCompare(b.id));
      for (const candidate of records) {
        const record = ProjectRecord.parse(candidate);
        if (record.projectId !== project.projectId) {
          throw new Error(`Restart record ${record.id} belongs to a different project.`);
        }
        if (seen.has(record.id)) continue;
        const item = toItem(record);
        const itemTokens = estimateTextTokens(renderItem(item));
        if (usedTokens + itemTokens > budget) {
          truncated = true;
          continue;
        }
        seen.add(record.id);
        selected[section].push(item);
        usedTokens += itemTokens;
        if (record.status === 'stale') staleCount += 1;
        if (record.reliability < 0.6) lowReliabilityCount += 1;
      }
    }

    if (staleCount > 0) warnings.push(`Restart pack includes ${staleCount} stale record${staleCount === 1 ? '' : 's'}.`);
    if (lowReliabilityCount > 0) {
      warnings.push(`Restart pack includes ${lowReliabilityCount} low-reliability record${lowReliabilityCount === 1 ? '' : 's'}.`);
    }
    if (truncated) warnings.push('Some restart records were omitted to stay within the token budget.');

    const pack = RestartPack.parse({
      projectId: project.projectId,
      projectName: project.name,
      taskId: task.id,
      task: task.content,
      generatedAt,
      branch: request.branch,
      lastVerifiedCommit: request.lastVerifiedCommit,
      ...selected,
      warnings,
      tokenEstimate: 0,
    });
    return { ...pack, tokenEstimate: estimateTextTokens(this.render(pack)) };
  }

  render(pack: RestartPackModel): string {
    const parsed = RestartPack.parse(pack);
    const lines = [
      `Continue task ${parsed.taskId}.`,
      `Project: ${parsed.projectName}`,
      ...(parsed.branch ? [`Branch: ${parsed.branch}`] : []),
      ...(parsed.lastVerifiedCommit ? [`Last verified commit: ${parsed.lastVerifiedCommit}`] : []),
      '',
      `Task: ${parsed.task}`,
      '',
      ...renderSection('Completed', parsed.completed),
      ...renderSection('Outstanding', parsed.outstanding),
      ...renderSection('Relevant records', parsed.relevant),
      ...(parsed.warnings.length > 0 ? ['', 'Warnings:', ...parsed.warnings.map((warning) => `- ${warning}`)] : []),
    ];
    return lines.join('\n').trim();
  }
}

function toItem(record: ProjectRecordModel): RestartPackItem {
  return {
    id: record.id,
    content: record.content,
    status: record.status,
    source: record.sources[0]!,
  };
}

function renderSection(name: string, items: RestartPackItem[]): string[] {
  return ['', `${name}:`, ...(items.length > 0 ? items.map((item) => `- ${renderItem(item)}`) : ['- None'])];
}

function renderItem(item: RestartPackItem): string {
  return `[${item.id}] ${item.content} (${sourceLocator(item)})`;
}

function sourceLocator(item: RestartPackItem): string {
  const lines = item.source.lineStart
    ? `:${item.source.lineStart}${item.source.lineEnd ? `-${item.source.lineEnd}` : ''}`
    : '';
  return `${item.source.path}${lines}`;
}

function headerText(project: string, task: string, branch?: string, commit?: string): string {
  return `Continue task. Project: ${project}. Task: ${task}. ${branch ?? ''} ${commit ?? ''}`;
}

function estimateTextTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

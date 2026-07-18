#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrincipalKind, ResourceScopeMode } from 'project-runtime-contracts';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';

const [command = 'status', ...args] = process.argv.slice(2);
// CLI is an explicitly local-only helper. A real host must inject authenticated identity instead.
const projectId = process.env.MNEMOSYNE_PROJECT_ID ?? 'project_local_cli';
const runtime = new MnemosyneRuntime({ projectRoot: process.cwd(), projectId });
const context = runtime.createOperationContext({
  execution: {
    authenticatedPrincipal: { id: 'service_local_cli', kind: PrincipalKind.Service },
    actingPrincipal: { id: 'agent_local_cli', kind: PrincipalKind.Agent },
    runtimeId: 'mnemosyne',
    runtimeInstanceId: runtime.runtimeScope.runtimeInstanceId,
    sessionId: 'session_local_cli',
    projectId,
  },
  scope: { mode: ResourceScopeMode.Bounded, projectId },
  purpose: 'local_cli_memory_operation',
});

try {
  switch (command) {
    case 'init': runtime.init(); console.log('Almanac initialised.'); break;
    case 'status': console.log(JSON.stringify(runtime.inspect(), null, 2)); break;
    case 'vault-init': {
      const [, ...nameParts] = args;
      if (nameParts.length === 0) throw new Error('Usage: mnemosyne vault-init <project-name>');
      const now = new Date().toISOString();
      console.log(JSON.stringify(await runtime.initializeVault(context, { projectId, name: nameParts.join(' '), schemaVersion: '1.0', createdAt: now, updatedAt: now }), null, 2));
      break;
    }
    case 'vault-list': console.log(JSON.stringify(await runtime.listVaultRecords(context), null, 2)); break;
    case 'vault-export': console.log(JSON.stringify(await runtime.exportVault(context), null, 2)); break;
    case 'vault-write': {
      const inputPath = args[0];
      if (!inputPath) throw new Error('Usage: mnemosyne vault-write <record.json>');
      console.log(JSON.stringify(await runtime.writeVaultRecord(context, JSON.parse(await readFile(resolve(inputPath), 'utf8'))), null, 2));
      break;
    }
    case 'vault-import': {
      const inputPath = args[0];
      if (!inputPath) throw new Error('Usage: mnemosyne vault-import <vault-export.json>');
      console.log(JSON.stringify(await runtime.importVault(context, JSON.parse(await readFile(resolve(inputPath), 'utf8'))), null, 2));
      break;
    }
    case 'restart-pack': {
      const taskId = args[0];
      if (!taskId) throw new Error('Usage: mnemosyne restart-pack <task-record-id> [--completed ids] [--outstanding ids] [--relevant ids] [--branch name] [--commit sha] [--budget tokens]');
      const pack = await runtime.createRestartPack(context, taskId, { completedIds: csvOption(args, '--completed'), outstandingIds: csvOption(args, '--outstanding'), relevantIds: csvOption(args, '--relevant'), branch: stringOption(args, '--branch'), lastVerifiedCommit: stringOption(args, '--commit'), tokenBudget: numberOption(args, '--budget') });
      console.log(runtime.renderRestartPack(pack));
      break;
    }
    case 'help': printHelp(); break;
    default: throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed.');
  process.exitCode = 1;
}

function stringOption(values: string[], option: string): string | undefined { const index = values.indexOf(option); return index >= 0 ? values[index + 1] : undefined; }
function csvOption(values: string[], option: string): string[] | undefined { const value = stringOption(values, option); return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined; }
function numberOption(values: string[], option: string): number | undefined { const value = stringOption(values, option); if (value === undefined) return undefined; const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`${option} requires a number.`); return parsed; }
function printHelp(): void {
  console.log(`MNEMOSYNE_PROJECT_ID=<project_id> mnemosyne commands:
  init
  status
  vault-init <project-name>
  vault-list
  vault-write <record.json>
  vault-export
  vault-import <vault-export.json>
  restart-pack <task-record-id> [--completed ids] [--outstanding ids] [--relevant ids] [--branch name] [--commit sha] [--budget tokens]`);
}

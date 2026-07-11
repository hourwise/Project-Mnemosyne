#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';

const [command = 'status', ...args] = process.argv.slice(2);
const runtime = new MnemosyneRuntime({ projectRoot: process.cwd() });

try {
  switch (command) {
    case 'init':
      runtime.init();
      console.log('Almanac initialised.');
      break;
    case 'status':
      console.log(JSON.stringify(runtime.status(), null, 2));
      break;
    case 'vault-init': {
      const [projectId, ...nameParts] = args;
      if (!projectId || nameParts.length === 0) throw new Error('Usage: mnemosyne vault-init <project-id> <project-name>');
      const now = new Date().toISOString();
      const manifest = await runtime.initializeVault({
        projectId,
        name: nameParts.join(' '),
        schemaVersion: '1.0',
        createdAt: now,
        updatedAt: now,
      });
      console.log(JSON.stringify(manifest, null, 2));
      break;
    }
    case 'vault-list': {
      const scope = args[0];
      const records = await runtime.vault.listRecords(
        scope ? { scope: scope as 'project_truth' | 'task_state' | 'agent_performance' } : {},
      );
      console.log(JSON.stringify(records, null, 2));
      break;
    }
    case 'vault-export':
      console.log(JSON.stringify(await runtime.exportVault(), null, 2));
      break;
    case 'vault-write': {
      const inputPath = args[0];
      if (!inputPath) throw new Error('Usage: mnemosyne vault-write <record.json>');
      const record = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
      console.log(JSON.stringify(await runtime.writeVaultRecord(record), null, 2));
      break;
    }
    case 'vault-import': {
      const inputPath = args[0];
      if (!inputPath) throw new Error('Usage: mnemosyne vault-import <vault-export.json>');
      const bundle = JSON.parse(await readFile(resolve(inputPath), 'utf8'));
      console.log(JSON.stringify(await runtime.importVault(bundle), null, 2));
      break;
    }
    case 'restart-pack': {
      const taskId = args[0];
      if (!taskId) throw new Error('Usage: mnemosyne restart-pack <task-record-id> [--completed ids] [--outstanding ids] [--relevant ids] [--branch name] [--commit sha] [--budget tokens]');
      const pack = await runtime.createRestartPack(taskId, {
        completedIds: csvOption(args, '--completed'),
        outstandingIds: csvOption(args, '--outstanding'),
        relevantIds: csvOption(args, '--relevant'),
        branch: stringOption(args, '--branch'),
        lastVerifiedCommit: stringOption(args, '--commit'),
        tokenBudget: numberOption(args, '--budget'),
      });
      console.log(runtime.restartPacks.render(pack));
      break;
    }
    case 'help':
      printHelp();
      break;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Command failed.');
  process.exitCode = 1;
}

function stringOption(values: string[], option: string): string | undefined {
  const index = values.indexOf(option);
  return index >= 0 ? values[index + 1] : undefined;
}

function csvOption(values: string[], option: string): string[] | undefined {
  const value = stringOption(values, option);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
}

function numberOption(values: string[], option: string): number | undefined {
  const value = stringOption(values, option);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${option} requires a number.`);
  return parsed;
}

function printHelp(): void {
  console.log(`Mnemosyne commands:
  init
  status
  vault-init <project-id> <project-name>
  vault-list [project_truth|task_state|agent_performance]
  vault-write <record.json>
  vault-export
  vault-import <vault-export.json>
  restart-pack <task-record-id> [--completed ids] [--outstanding ids] [--relevant ids] [--branch name] [--commit sha] [--budget tokens]`);
}

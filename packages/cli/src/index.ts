#!/usr/bin/env node
import { MnemosyneRuntime } from '@mnemosyne/runtime-core';

const command = process.argv[2] ?? 'status';
const runtime = new MnemosyneRuntime({ projectRoot: process.cwd() });

switch (command) {
  case 'init':
    runtime.init();
    console.log('Almanac initialised.');
    break;
  case 'status':
    console.log(JSON.stringify(runtime.status(), null, 2));
    break;
  default:
    console.error(`Unknown command: ${command}`);
    process.exitCode = 1;
}

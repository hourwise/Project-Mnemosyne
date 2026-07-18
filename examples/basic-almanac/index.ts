import { MnemosyneRuntime } from '@mnemosyne/runtime-core';

const runtime = new MnemosyneRuntime({ projectRoot: process.cwd(), projectId: 'project_basic_demo' });
runtime.init();
console.log(runtime.status());

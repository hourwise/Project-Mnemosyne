import { MnemosyneRuntime } from '@mnemosyne/runtime-core';

const runtime = new MnemosyneRuntime({ projectRoot: process.cwd() });
runtime.init();
console.log(runtime.status());

import { defineConfig } from 'vitest/config';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@mnemosyne/schema': resolve(__dirname, 'packages/schema/src/index.ts'),
      '@mnemosyne/portable-vault': resolve(__dirname, 'packages/portable-vault/src/index.ts'),
      '@mnemosyne/restart-pack-engine': resolve(__dirname, 'packages/restart-pack-engine/src/index.ts'),
      '@mnemosyne/audit-engine': resolve(__dirname, 'packages/audit-engine/src/index.ts'),
      '@mnemosyne/almanac-store': resolve(__dirname, 'packages/almanac-store/src/index.ts'),
      '@mnemosyne/workspace-guard': resolve(__dirname, 'packages/workspace-guard/src/index.ts'),
      '@mnemosyne/scoring-engine': resolve(__dirname, 'packages/scoring-engine/src/index.ts'),
      '@mnemosyne/onboarding-engine': resolve(__dirname, 'packages/onboarding-engine/src/index.ts'),
      '@mnemosyne/memory-ingest-engine': resolve(__dirname, 'packages/memory-ingest-engine/src/index.ts'),
      '@mnemosyne/reliability-engine': resolve(__dirname, 'packages/reliability-engine/src/index.ts'),
      '@mnemosyne/retrieval-engine': resolve(__dirname, 'packages/retrieval-engine/src/index.ts'),
      '@mnemosyne/conflict-engine': resolve(__dirname, 'packages/conflict-engine/src/index.ts'),
      '@mnemosyne/decay-engine': resolve(__dirname, 'packages/decay-engine/src/index.ts'),
      '@mnemosyne/source-map-engine': resolve(__dirname, 'packages/source-map-engine/src/index.ts'),
      '@mnemosyne/project-graph-engine': resolve(__dirname, 'packages/project-graph-engine/src/index.ts'),
      '@mnemosyne/session-engine': resolve(__dirname, 'packages/session-engine/src/index.ts'),
      '@mnemosyne/mcp-adapter': resolve(__dirname, 'packages/mcp-adapter/src/index.ts'),
      '@mnemosyne/ananke-adapter': resolve(__dirname, 'packages/ananke-adapter/src/index.ts'),
      '@mnemosyne/runtime-core': resolve(__dirname, 'packages/runtime-core/src/index.ts'),
      '@mnemosyne/cli': resolve(__dirname, 'packages/cli/src/index.ts'),
      '@mnemosyne/testbench': resolve(__dirname, 'packages/testbench/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/src/**/*.test.ts'],
    server: {
      deps: {
        inline: [
          '@mnemosyne/schema',
          '@mnemosyne/portable-vault',
          '@mnemosyne/restart-pack-engine',
          '@mnemosyne/audit-engine',
          '@mnemosyne/almanac-store',
          '@mnemosyne/workspace-guard',
          '@mnemosyne/scoring-engine',
          '@mnemosyne/onboarding-engine',
          '@mnemosyne/memory-ingest-engine',
          '@mnemosyne/reliability-engine',
          '@mnemosyne/retrieval-engine',
          '@mnemosyne/conflict-engine',
          '@mnemosyne/decay-engine',
          '@mnemosyne/source-map-engine',
          '@mnemosyne/project-graph-engine',
          '@mnemosyne/session-engine',
          '@mnemosyne/mcp-adapter',
          '@mnemosyne/ananke-adapter',
          '@mnemosyne/runtime-core',
          '@mnemosyne/cli',
          '@mnemosyne/testbench',
        ],
      },
    },
  },
});

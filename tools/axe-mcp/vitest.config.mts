import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

/** The bridge's own specs, run in Node against the definitions it shares with the app. */
export default defineConfig({
  resolve: {
    alias: { '@axe': resolve(import.meta.dirname, '../../src/app') },
  },
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 30_000,
  },
});

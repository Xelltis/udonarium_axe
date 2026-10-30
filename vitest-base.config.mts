import { defineConfig } from 'vitest/config';

/**
 * Runner tuning shared by both test paths: `ng test` loads this file through
 * `runnerConfig` in angular.json, and vitest.config.mts spreads the same values.
 *
 * The suite runs in the pre-commit hook alongside `ng lint`, and both compile
 * the whole project. On a busy machine a worker can be descheduled for several
 * seconds, which is long enough for Vitest's 5s default to fail a test whose
 * own work takes about 30ms. A wider budget rides out the stall while still
 * catching a test that genuinely hangs.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // A worker runs file after file in one page, with the modules the files before it loaded,
    // rather than starting each file afresh. Making a happy-dom page and loading Angular for each
    // file took the whole run nearly four times as long; `ng test` runs this way by default. What
    // one file leaves behind for the next, test-setup.ts puts back before each test.
    isolate: false,
    // A spy or a global stood in for by one test is put back before the next, in the same file or
    // the next one, rather than trusting each test to put back what it changed.
    restoreMocks: true,
    unstubGlobals: true,
  },
});

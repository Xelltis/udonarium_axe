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
  },
});

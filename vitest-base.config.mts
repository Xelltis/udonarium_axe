import { existsSync, readFileSync } from 'node:fs';
import { freemem } from 'node:os';

import { defineConfig } from 'vitest/config';

const MEMINFO = '/proc/meminfo';
/** The memory a worker takes, a page and the whole of Angular, with some to spare. */
const WORKER_BYTES = 0.75 * 2 ** 30;
/** The memory left for the editor, a dev server and the rest of the machine while the tests run. */
const RESERVED_BYTES = 6 * 2 ** 30;
const FEWEST_WORKERS = 2;
const MOST_WORKERS = 4;

/** How much memory the machine could give without swapping, as Linux counts it, or what Node reckons free elsewhere. */
function availableBytes(): number {
  const meminfo = existsSync(MEMINFO) ? readFileSync(MEMINFO, 'utf-8') : '';
  const kib = /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo)?.[1];
  return kib ? Number(kib) * 1024 : freemem();
}

/** How many workers the memory free as the run starts makes room for, leaving RESERVED_BYTES over. */
function workersForMemory(): number {
  const room = Math.floor((availableBytes() - RESERVED_BYTES) / WORKER_BYTES);
  return Math.min(MOST_WORKERS, Math.max(FEWEST_WORKERS, room));
}

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
    // Off CI, as many workers as the memory free makes room for, two to four, rather than one for
    // every core but one. Each worker holds a page and the whole of Angular, so fifteen of them take
    // over 9GB; beside a dev server and the editor that ran the machine out of memory and swap, and
    // every worker stalled at once for longer than the timeout, failing whichever test each was in.
    // VITEST_MAX_WORKERS still sets the count when given.
    ...(process.env['CI'] ? {} : { maxWorkers: workersForMemory() }),
  },
});

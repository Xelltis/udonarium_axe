import { appendFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import related from './related.json';

/**
 * Marks what a test left of the parts of the app it asked for as all it asks for, once the test has
 * passed: `keepLoadedParts` in helpers.ts writes the parts as the test goes, and a test that failed
 * or was stopped part of the way may not have reached all of them. `scripts/e2e-related.mjs` trusts
 * a test's record only with this mark. The mark goes only on a record written in the same try of the
 * test, so a test that passed without keeping a record leaves an older one unmarked.
 */
export default class LoadsReporter implements Reporter {
  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed') return;
    const project = test.parent.project()?.name;
    if (!project) return;
    const kept = join(related.loadsDir, project, `${test.id}.txt`);
    if (!existsSync(kept) || statSync(kept).mtimeMs < result.startTime.getTime()) return;
    appendFileSync(kept, `${related.passedMark}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}

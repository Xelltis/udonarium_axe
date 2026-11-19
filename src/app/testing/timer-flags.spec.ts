import { readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { lowerTimerFlags, TIMER_FLAGS, TIMER_FLAGS_MADE_ANEW } from '@axe/testing/timer-flags';
import { callOffWaitingTimers } from '@axe/testing/waiting-timers';

function sourcesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * The fields a source keeps the handle of a timer in and reads as a mark that one is waiting: set
 * from a timer, and looked at to return early.
 */
function timerFlagsOf(text: string): string[] {
  const set = [...text.matchAll(/(?:this\.)?(\w+) = (?:setTimeout|requestAnimationFrame)\(/g)].map((match) => match[1]);
  return [...new Set(set)]
    .filter((name) =>
      new RegExp(
        `if \\((?:[^()]*\\|\\| )?!?\\(?(?:this\\.)?${name}(?: (?:!==?|!=) null)?\\)?(?: \\|\\|[^()]*)?\\) return`
      ).test(text)
    )
    .sort();
}

/**
 * The rule the calling off of a file's timers goes by: a mark of a waiting timer that lives on from
 * one file to the next is taken down with the timer, or the keeper would wait for ever on a timer
 * that was called off.
 */
describe('the marks kept of timers that are called off as a file ends', () => {
  it('names every source that keeps such a mark outside what Angular makes anew for each test', () => {
    const found = new Map<string, string[]>();
    for (const file of sourcesUnder('src/app')) {
      if (file.endsWith('.spec.ts') || file.startsWith('src/app/testing/')) continue;
      const text = readFileSync(file, 'utf-8');
      if (/@(Injectable|Component|Directive|Pipe)\(/.test(text)) continue;
      const flags = timerFlagsOf(text);
      if (flags.length > 0) found.set(file, flags);
    }

    const named = new Map(TIMER_FLAGS.map(({ source, fields }) => [source, [...fields].sort()]));
    for (const source of Object.keys(TIMER_FLAGS_MADE_ANEW)) named.set(source, found.get(source) ?? []);
    expect([...found].sort()).toEqual([...named].sort());
  });

  it('takes each of them down with the timers, on every instance made', () => {
    for (const { source, keepers, fields } of TIMER_FLAGS) {
      for (const keeper of keepers) {
        const instance = (keeper as unknown as { instance: Record<string, unknown> }).instance;
        expect((keeper as { _instance?: unknown })._instance, source).toBe(instance);
        for (const field of fields) {
          expect(field in instance, `${source} ${field}`).toBe(true);
          instance[field] = setTimeout(() => undefined, 60_000);
        }
      }
    }

    callOffWaitingTimers();
    lowerTimerFlags();

    for (const { source, keepers, fields } of TIMER_FLAGS) {
      for (const keeper of keepers) {
        const instance = (keeper as unknown as { instance: Record<string, unknown> }).instance;
        for (const field of fields) expect(instance[field], `${source} ${field}`).toBeNull();
      }
    }
  });
});

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/** Animations left running with motion stopped, since they tell of something going on. */
const KEPT_RUNNING = ['animate-spin', 'animate-pulse', 'animate-writing-dot', 'animate-none'];

/** Every class the rules for stopped motion name. */
function stoppedClasses(): Set<string> {
  const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf-8');
  const stopped = new Set<string>();
  for (const rule of css.matchAll(/:root\.motion-reduced\s*:is\(([^)]*)\)/g)) {
    for (const name of rule[1].matchAll(/\.([a-z0-9-]+)/g)) stopped.add(name[1]);
  }
  return stopped;
}

/** Every `animate-*` class the application's templates and code put on an element. */
function animationsInUse(dir = resolve(process.cwd(), 'src/app'), found = new Set<string>()): Set<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      animationsInUse(path, found);
    } else if (/\.(html|ts)$/.test(name) && !name.endsWith('.spec.ts')) {
      for (const match of readFileSync(path, 'utf-8').matchAll(/(?<![\w-])animate-[a-z0-9-]+/g)) found.add(match[0]);
    }
  }
  return found;
}

describe('stopped motion', () => {
  it('stops or ends at once every animation in use, but those that tell of something going on', () => {
    const stopped = stoppedClasses();

    const unstopped = [...animationsInUse()].filter((name) => !stopped.has(name) && !KEPT_RUNNING.includes(name));

    expect(unstopped).toEqual([]);
  });
});

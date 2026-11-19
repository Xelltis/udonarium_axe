import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Reach = { every: string } | { none: string } | { parts: string[] };

interface How {
  files: Set<string>;
  atStart: Set<string>;
  leadingParts: Map<string, Set<string>>;
  forSpecsAlone: Set<string>;
  standsInFor?: Map<string, string>;
}

interface Through {
  partsChanged: Map<string, { file: string; fresh: boolean }>;
  specs: string[];
  tests: Map<string, string[]> | null;
  kept: Map<string, Map<string, Set<string>>>;
}

/**
 * The rule the picker of e2e specs goes by for the sources of the app (scripts/e2e-reach.mjs): a spec
 * is left out only where it can be told that the change does not reach it.
 */
describe('which e2e specs a changed source reaches', () => {
  let reachOfSource: (source: string, how: How) => Reach;
  let specsReachedThroughParts: (through: Through) => { every?: string; picked: Map<string, string> };
  let reasonsOf: (specs: string[], whyOf: (spec: string) => string, total: number) => string[];
  let recordOf: (
    lines: string[],
    marks: { titleMark: string; passedMark: string; entryPart: string }
  ) => { spec: string; title: string; parts: string[]; trusted: boolean } | null;

  beforeAll(async () => {
    const module = (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts/e2e-reach.mjs')).href)) as {
      reachOfSource: typeof reachOfSource;
      specsReachedThroughParts: typeof specsReachedThroughParts;
      reasonsOf: typeof reasonsOf;
      recordOf: typeof recordOf;
    };
    ({ reachOfSource, specsReachedThroughParts, reasonsOf, recordOf } = module);
  });

  const how = (): How => ({
    files: new Set(['start.ts', 'panel.ts', 'inside.ts', 'fixture.ts', 'adrift.ts', 'setting.ts']),
    atStart: new Set(['start.ts', 'setting.ts']),
    leadingParts: new Map([
      ['panel.ts', new Set(['panel'])],
      ['inside.ts', new Set(['panel', 'other'])],
    ]),
    forSpecsAlone: new Set(['fixture.ts', 'inside.ts']),
    standsInFor: new Map([['setting.prod.ts', 'setting.ts']]),
  });

  describe('by how the app comes to load it', () => {
    it('reaches every spec where the page loads it as it starts', () => {
      expect(reachOfSource('start.ts', how())).toEqual({ every: expect.any(String) });
    });

    it('reaches the specs that ask for the parts that lead to it, where it is loaded only as the app goes', () => {
      expect(reachOfSource('inside.ts', how())).toEqual({ parts: ['panel', 'other'] });
    });

    it('reaches none where specs alone load it', () => {
      expect(reachOfSource('fixture.ts', how())).toEqual({ none: expect.any(String) });
    });

    it('reaches every spec where nothing is seen to load it, as the build may put it in by a setting of its own', () => {
      expect(reachOfSource('adrift.ts', how())).toEqual({ every: expect.any(String) });
      expect(reachOfSource('unheard-of.ts', how())).toEqual({ every: expect.any(String) });
    });

    it('reads a file the build swaps in as the file it stands in for', () => {
      expect(reachOfSource('setting.prod.ts', how())).toEqual(reachOfSource('setting.ts', how()));
      expect(reachOfSource('setting.prod.ts', { ...how(), standsInFor: undefined })).toEqual({
        every: expect.any(String),
      });
    });
  });

  describe('through the parts loaded as the app goes', () => {
    const through = (fields: Partial<Through> = {}): Through => ({
      partsChanged: new Map([['panel', { file: 'inside.ts', fresh: false }]]),
      specs: ['opens.spec.ts', 'passes.spec.ts'],
      tests: new Map([
        ['opens.spec.ts', ['looks', 'opens the panel']],
        ['passes.spec.ts', ['looks']],
      ]),
      kept: new Map([
        [
          'opens.spec.ts',
          new Map([
            ['looks', new Set<string>()],
            ['opens the panel', new Set(['panel'])],
          ]),
        ],
        ['passes.spec.ts', new Map([['looks', new Set(['other'])]])],
      ]),
      ...fields,
    });
    const reached = (fields: Partial<Through> = {}) => {
      const { every, picked } = specsReachedThroughParts(through(fields));
      return every !== undefined ? 'every' : [...picked.keys()];
    };

    it('reaches the specs one of whose tests asked for a part that changed, and no other', () => {
      expect(reached()).toEqual(['opens.spec.ts']);
    });

    it('reaches none where nothing loaded as the app goes changed', () => {
      expect(reached({ partsChanged: new Map() })).toEqual([]);
    });

    it('reaches a spec with a test that has left nothing behind, as one added, renamed or left out of a run cut short', () => {
      const tests = new Map([
        ['opens.spec.ts', ['looks', 'opens the panel']],
        ['passes.spec.ts', ['looks', 'does something new']],
      ]);

      expect(reached({ tests })).toEqual(['opens.spec.ts', 'passes.spec.ts']);
    });

    it('reaches a spec that has left nothing at all, and one Playwright lists no test of', () => {
      expect(reached({ kept: new Map() })).toEqual(['opens.spec.ts', 'passes.spec.ts']);
      expect(reached({ tests: new Map([['opens.spec.ts', ['looks', 'opens the panel']]]) })).toEqual([
        'opens.spec.ts',
        'passes.spec.ts',
      ]);
    });

    it('reaches every spec where the tests cannot be listed, as none can be told to have left everything', () => {
      expect(reached({ tests: null })).toBe('every');
    });

    it('reaches every spec for a part new under its name that no test has asked for', () => {
      const cut = new Map([['cut-out', { file: 'cut-out.ts', fresh: true }]]);

      expect(reached({ partsChanged: cut })).toBe('every');
    });

    it('reaches none for a part that has stood all along and that no test asked for', () => {
      const unopened = new Map([['never-opened', { file: 'never-opened.ts', fresh: false }]]);

      expect(reached({ partsChanged: unopened })).toEqual([]);
    });

    it('reaches only the specs that asked for it for a part new under a name some test asked for already', () => {
      const again = new Map([['panel', { file: 'panel.ts', fresh: true }]]);

      expect(reached({ partsChanged: again })).toEqual(['opens.spec.ts']);
    });
  });

  describe('telling why', () => {
    const why = new Map([
      ['a.spec.ts', 'helper reaches every spec'],
      ['b.spec.ts', 'helper reaches every spec'],
      ['c.spec.ts', 'changed itself'],
    ]);
    const whyOf = (spec: string) => why.get(spec)!;

    it('names each spec with its own reason where not every one is run', () => {
      expect(reasonsOf(['a.spec.ts', 'c.spec.ts'], whyOf, 3)).toEqual([
        'a.spec.ts  (helper reaches every spec)',
        'c.spec.ts  (changed itself)',
      ]);
    });

    it('gives the reasons every spec is run for with how many each stands for, the most first, rather than the first spec’s', () => {
      expect(reasonsOf(['c.spec.ts', 'a.spec.ts', 'b.spec.ts'], whyOf, 3)).toEqual([
        '2: helper reaches every spec',
        '1: changed itself',
      ]);
      expect(reasonsOf(['a.spec.ts', 'b.spec.ts'], whyOf, 2)).toEqual(['every one: helper reaches every spec']);
    });
  });

  describe('what a test left behind', () => {
    const related = JSON.parse(readFileSync('e2e/related.json', 'utf-8')) as { titleMark: string; passedMark: string };
    const marks = { titleMark: related.titleMark, passedMark: related.passedMark, entryPart: 'main' };
    const record = (...lines: string[]) =>
      recordOf(['e2e/a.spec.ts', `${related.titleMark}opens › the panel`, ...lines], marks);

    it('is trusted where the test passed after leaving it and the app’s entry is among its parts', () => {
      expect(record('main', 'panel.component', related.passedMark, '')).toEqual({
        spec: 'e2e/a.spec.ts',
        title: 'opens › the panel',
        parts: ['main', 'panel.component'],
        trusted: true,
      });
    });

    it('is not trusted where the test did not pass, as one that failed or was stopped part of the way', () => {
      expect(record('main', 'panel.component')?.trusted).toBe(false);
    });

    it('is not trusted where the app’s entry is not among its parts, as of a build whose parts cannot be named', () => {
      expect(record(related.passedMark)?.trusted).toBe(false);
      expect(record('panel.component', related.passedMark)?.trusted).toBe(false);
    });

    it('is none where it names no test', () => {
      expect(recordOf(['e2e/a.spec.ts', 'main', related.passedMark], marks)).toBeNull();
      expect(recordOf([], marks)).toBeNull();
    });

    it('is marked passed by the reporter the configuration runs, and the mark taken off as the test starts again', () => {
      const config = readFileSync('playwright.config.ts', 'utf-8');
      const reporter = readFileSync('e2e/loads-reporter.ts', 'utf-8');
      const helper = readFileSync('e2e/helpers.ts', 'utf-8');

      expect(config).toMatch(/reporter: \[[^\n]*\['\.\/e2e\/loads-reporter\.ts'\]/);
      expect(reporter).toContain('`${related.passedMark}\\n`');
      expect(helper).toContain('line !== related.passedMark');
    });
  });
});

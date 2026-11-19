import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * The rules the picker of unit specs goes by beside the imports (scripts/vitest-reach.mjs), and where
 * the hooks hand it the choosing.
 */
describe('which unit specs run beside the ones the imports reach', () => {
  let specsReadingDisk: (
    texts: Map<string, string>,
    importers: Map<string, Set<string>>,
    ofSetup: Set<string>
  ) => string[];
  let fitsCommandLine: (specs: string[], platform: string) => boolean;
  let specsNaming: (files: string[], texts: Map<string, string>) => string[];
  let TEST_BED_PROVIDERS: string;

  beforeAll(async () => {
    const module = (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts/vitest-reach.mjs')).href)) as {
      specsReadingDisk: typeof specsReadingDisk;
      fitsCommandLine: typeof fitsCommandLine;
      specsNaming: typeof specsNaming;
      TEST_BED_PROVIDERS: string;
    };
    ({ specsReadingDisk, fitsCommandLine, specsNaming, TEST_BED_PROVIDERS } = module);
  });

  describe('the specs that read files off the disk', () => {
    const reads = "import { readFileSync } from 'node:fs';";
    const texts = new Map([
      ['own.spec.ts', reads],
      ['through-helper.spec.ts', "import { pageStyles } from './styles-helper';"],
      ['through-two.spec.ts', "import { checked } from './checks';"],
      ['plain.spec.ts', "import { clamp } from './clamp';"],
      ['with-providers.spec.ts', "import { PROVIDERS } from './providers';"],
      ['styles-helper.ts', reads],
      ['checks.ts', "import { pageStyles } from './styles-helper';"],
      ['clamp.ts', ''],
      ['providers.ts', "import { dictionaries } from './dictionaries';"],
      ['dictionaries.ts', reads],
    ]);
    const importers = new Map([
      ['styles-helper.ts', new Set(['through-helper.spec.ts', 'checks.ts'])],
      ['checks.ts', new Set(['through-two.spec.ts'])],
      ['clamp.ts', new Set(['plain.spec.ts'])],
      ['providers.ts', new Set(['with-providers.spec.ts'])],
      ['dictionaries.ts', new Set(['providers.ts'])],
    ]);

    it('are the ones that read by themselves and the ones that read through a helper, at any depth', () => {
      expect(specsReadingDisk(texts, importers, new Set())).toEqual([
        'own.spec.ts',
        'through-helper.spec.ts',
        'through-two.spec.ts',
        'with-providers.spec.ts',
      ]);
    });

    it('start from no helper the test setup loads into every spec, which is the setup’s to answer for', () => {
      const ofSetup = new Set(['providers.ts', 'dictionaries.ts']);

      expect(specsReadingDisk(texts, importers, ofSetup)).toEqual([
        'own.spec.ts',
        'through-helper.spec.ts',
        'through-two.spec.ts',
      ]);
    });

    it('take a file read by glob for one read off the disk', () => {
      const globbed = new Map([['globbed.spec.ts', "const all = import.meta.glob('./*.html');"]]);

      expect(specsReadingDisk(globbed, new Map(), new Set())).toEqual(['globbed.spec.ts']);
    });
  });

  describe('the specs named on a command line', () => {
    const specs = (count: number) =>
      Array.from({ length: count }, (_, at) => `src/app/features/some/where/${at}.spec.ts`);

    it('fit while they are few', () => {
      expect(fitsCommandLine(specs(20), 'win32')).toBe(true);
      expect(fitsCommandLine([], 'win32')).toBe(true);
    });

    it('do not fit the shell Windows runs them through once they pass what it takes, and fit elsewhere', () => {
      const many = specs(400);
      expect(many.join(' ').length).toBeGreaterThan(8191);

      expect(fitsCommandLine(many, 'win32')).toBe(false);
      expect(fitsCommandLine(many, 'linux')).toBe(true);
    });

    it('are held short of what Windows takes', () => {
      for (let count = 1; count < 400; count++) {
        const some = specs(count);
        if (fitsCommandLine(some, 'win32')) expect(`npx vitest run ${some.join(' ')}`.length).toBeLessThan(8191);
      }
    });
  });

  it('leaves which files reach a spec to the picker, before a commit and before a push alike', () => {
    const hooks = readFileSync('lefthook.yml', 'utf-8');
    const jobs = hooks.split(/\n(?= {4}- name: )/).filter((job) => /scripts\/vitest-related\.mjs/.test(job));

    expect(jobs).toHaveLength(2);
    for (const job of jobs) expect(job).not.toMatch(/^\s+glob:/m);
    expect(jobs.map((job) => /--told-only/.test(job))).toEqual([true, false]);
    // Before a push the files are read from what git hands the hook, deleted ones among them, not named.
    expect(jobs[1]).toMatch(/--pushed/);
    expect(jobs[1]).toMatch(/^\s+use_stdin: true$/m);
    expect(jobs[1]).not.toMatch(/\{push_files\}/);
  });

  it('names a spec that names a changed file by its path, whatever quotes it uses, and no other', () => {
    const texts = new Map([
      ['hooks.spec.ts', "readFileSync('lefthook.yml', 'utf-8')"],
      ['related.spec.ts', 'readFileSync("e2e/related.json")'],
      ['picker.spec.ts', 'resolve(`scripts/e2e-reach.mjs`)'],
      ['near.spec.ts', "readFileSync('e2e/related.json.bak')"],
    ]);

    expect(specsNaming(['lefthook.yml', 'e2e/related.json', 'scripts/e2e-reach.mjs'], texts)).toEqual([
      'hooks.spec.ts',
      'picker.spec.ts',
      'related.spec.ts',
    ]);
    expect(specsNaming(['docs/x.md'], texts)).toEqual([]);
  });

  it('has the setup load the providers of a TestBed module from the one module the picker names as such', () => {
    const setup = readFileSync('src/app/testing/test-setup.ts', 'utf-8');

    expect(existsSync(TEST_BED_PROVIDERS)).toBe(true);
    expect(setup).toContain(`await import('${TEST_BED_PROVIDERS.replace('src/app/', '@axe/').replace(/\.ts$/, '')}')`);
    // Anything else the setup loads as it goes, it loads into every spec.
    const loaded = [...setup.matchAll(/\bimport\(\s*'([^']+)'\s*\)/g)].map((match) => match[1]);
    expect(loaded).toContain('@axe/domain/dice/bcdice/bcdice-loader');
  });
});

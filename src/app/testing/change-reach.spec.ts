import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

interface Change {
  kind: 'apart' | 'source' | 'asset' | 'e2e' | 'bridge' | 'unknown';
  source?: string;
}

interface Changed {
  file: string;
  fresh: boolean;
  gone: boolean;
}

/**
 * The rule the pickers of tests go by (scripts/change-reach.mjs): tests are picked only for a change
 * whose reach can be told, and a file nobody has said anything of reaches every test.
 */
describe('what a changed file reaches', () => {
  let kindOfChange: (file: string, exists?: (file: string) => boolean, removed?: Set<string>) => Change;
  let changesOfNameStatus: (lines: string[]) => Changed[];
  let pushRanges: (input: string) => { head: string; base: string | null }[];

  beforeAll(async () => {
    const module = (await import(/* @vite-ignore */ pathToFileURL(resolve('scripts/change-reach.mjs')).href)) as {
      kindOfChange: typeof kindOfChange;
      changesOfNameStatus: typeof changesOfNameStatus;
      pushRanges: typeof pushRanges;
    };
    ({ kindOfChange, changesOfNameStatus, pushRanges } = module);
  });

  /** The kinds of some files, as they lie in this repository or would. */
  const kinds = (files: readonly string[]) => files.map((file) => kindOfChange(file).kind);

  it('takes a file nobody has said anything of to reach every test, wherever it lies', () => {
    expect(
      kinds([
        'some/new/thing.xyz',
        'new-setting.json',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.app.json',
        'angular.json',
        '.postcssrc.json',
        'vitest.config.mts',
        'scripts/zip-dist.mjs',
        'public/robots.txt',
        'src/index.html',
        'src/styles.css',
        'src/styles/theme.css',
        'src/assets/i18n/ja.json',
        'src/assets/copyright.txt',
        'src/app/core/network/server/contract/http.json',
        'src/app/new.kind',
      ])
    ).toEqual(Array.from({ length: 18 }, () => 'unknown'));
  });

  it('tells a source by itself, and a template or a stylesheet by the source it lies beside', () => {
    expect(kindOfChange('src/app/features/chat/chat.service.ts')).toEqual({
      kind: 'source',
      source: 'src/app/features/chat/chat.service.ts',
    });
    expect(kindOfChange('src/app/features/chat/chat.component.html', () => true)).toEqual({
      kind: 'source',
      source: 'src/app/features/chat/chat.component.ts',
    });
    // A stylesheet with no source beside it is compiled into the whole page.
    expect(kindOfChange('src/app/features/chat/chat.component.css', () => false).kind).toBe('unknown');
  });

  it('tells apart what reaches no test, the suite of e2e, the bridge, and a file with no words in it', () => {
    expect(
      kinds(['docs/features/chat.md', 'website/manual/chat.md', 'README.md', 'CLAUDE.md', 'lefthook.yml'])
    ).toEqual(['apart', 'apart', 'apart', 'apart', 'apart']);
    expect(kinds(['e2e/helpers.ts', 'e2e/mobile/sheet-helpers.ts', 'e2e/visual/__screenshots__/webgl2/a.png'])).toEqual(
      ['e2e', 'e2e', 'e2e']
    );
    expect(kinds(['playwright.config.ts', 'tools/axe-mcp/src/main.ts', 'tools/axe-mcp/package.json'])).toEqual([
      'e2e',
      'bridge',
      'bridge',
    ]);
    expect(
      kinds(['src/assets/models/props/prop_pipe.glb', 'src/assets/images/a.webp', 'src/assets/sounds/a.mp3'])
    ).toEqual(['asset', 'asset', 'asset']);
  });

  it('is the one place either picker asks, neither keeping a list of its own of what reaches every test', () => {
    for (const picker of ['scripts/vitest-related.mjs', 'scripts/e2e-related.mjs']) {
      const source = readFileSync(picker, 'utf-8');
      expect(source, picker).toContain("from './change-reach.mjs'");
      expect(source, picker).toContain('kindOfChange(file, existsSync, removed)');
      expect(source, picker).not.toMatch(/package\(\?:-lock\)|angular\\\.json|\\\.postcssrc/);
    }
    // And the hook that runs before a push leaves the choosing to the picker.
    const hooks = readFileSync('lefthook.yml', 'utf-8');
    const prePush = hooks.slice(hooks.indexOf('pre-push:'));
    expect(prePush.slice(0, prePush.indexOf('- name: test-mcp'))).not.toMatch(/^\s+glob:/m);
  });

  it('reads a template or stylesheet the change takes away with its source as that source, and no other one lone', () => {
    const removed = new Set(['src/app/a/removed.component.ts', 'src/app/a/removed.component.html']);

    expect(kindOfChange('src/app/a/removed.component.html', () => false, removed)).toEqual({
      kind: 'source',
      source: 'src/app/a/removed.component.ts',
    });
    // The stylesheet of the whole page taken away has no source beside it to stand for.
    expect(kindOfChange('src/styles.css', () => false, new Set(['src/styles.css'])).kind).toBe('unknown');
    expect(kindOfChange('src/app/a/removed.component.html', () => false).kind).toBe('unknown');
  });

  it('tells each file a diff names, whether it is new under its name, and whether it is gone, a rename both ways', () => {
    expect(
      changesOfNameStatus([
        'M\tsrc/a.ts',
        'A\tsrc/b.ts',
        'D\tsrc/c.glb',
        'R087\tsrc/old.ts\tsrc/new.ts',
        'C100\tx\ty',
        '',
      ])
    ).toEqual([
      { file: 'src/a.ts', fresh: false, gone: false },
      { file: 'src/b.ts', fresh: true, gone: false },
      { file: 'src/c.glb', fresh: false, gone: true },
      { file: 'src/old.ts', fresh: false, gone: true },
      { file: 'src/new.ts', fresh: true, gone: false },
      { file: 'y', fresh: true, gone: false },
    ]);
  });

  it('reads the ranges a push sends from what git hands the hook, a new ref with nothing to start from and a deleted one with nothing', () => {
    const zero = '0'.repeat(40);
    const input = [
      `refs/heads/feat ${'a'.repeat(40)} refs/heads/feat ${'b'.repeat(40)}`,
      `refs/heads/new ${'c'.repeat(40)} refs/heads/new ${zero}`,
      `(delete) ${zero} refs/heads/old ${'d'.repeat(40)}`,
      '',
    ].join('\n');

    expect(pushRanges(input)).toEqual([
      { head: 'a'.repeat(40), base: 'b'.repeat(40) },
      { head: 'c'.repeat(40), base: null },
    ]);
  });
});

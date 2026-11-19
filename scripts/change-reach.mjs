/**
 * What a changed file is to whatever picks the tests to run by it.
 *
 * Tests are picked, rather than all run, only for a change whose reach can be told. So the kinds told
 * apart here are the few whose reach is known, and everything else is `unknown`: a file nobody has
 * said anything of reaches every test. A new kind of file is therefore safe until it is given a kind,
 * and both pickers, of unit specs and of e2e specs, ask here rather than keep lists of their own.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * Paths that reach no test of the app: writing about it, how its commits and releases are kept, how
 * its sources are linted and laid out, and what the editor and the agents working on it are told.
 */
const APART = [
  /^docs\//,
  /^website\//,
  /^\.github\//,
  /^\.vscode\//,
  /^\.claude\//,
  /^[^/]+\.md$/,
  /^LICENSE$/,
  /^\.gitignore$/,
  /^\.editorconfig$/,
  /^\.prettierrc$/,
  /^\.prettierignore$/,
  /^\.releaserc\.json$/,
  /^commitlint\.config\.ts$/,
  /^eslint\.config\.ts$/,
  /^lefthook\.yml$/,
];

/** A file of a source's own that is compiled into it: its template, or its stylesheet. */
const BESIDE_A_SOURCE = /\.(?:html|css)$/;

/** Files that hold no words a spec could read as text: pictures, sounds, models, fonts and archives. */
const NO_WORDS = /\.(?:png|jpe?g|webp|gif|avif|ico|glb|gltf|bin|mp3|ogg|wav|m4a|woff2?|ttf|otf|zip|wasm)$/i;

/**
 * The kind of a changed file, by its path from the root of the repository:
 *
 * - `apart`: reaches no test.
 * - `source`: a source under src, or the template or stylesheet beside one, which stands for it, as
 *   it does where the change takes both away (`removed` names what it takes away); the imports tell
 *   what it reaches. `source` names the `.ts` file.
 * - `asset`: a file under src with no words in it, which the app is served and a spec may check by
 *   reading it off the disk, but none imports.
 * - `e2e`: the e2e suite itself, its specs, helpers, pictures and settings.
 * - `bridge`: the AI bridge, a program of its own with tests of its own, which some e2e specs start.
 * - `unknown`: anything else, which may reach any test.
 */
export function kindOfChange(file, exists = existsSync, removed = new Set()) {
  if (APART.some((pattern) => pattern.test(file))) return { kind: 'apart' };
  if (file.startsWith('e2e/') || file === 'playwright.config.ts') return { kind: 'e2e' };
  if (file.startsWith('tools/axe-mcp/')) return { kind: 'bridge' };
  if (!file.startsWith('src/')) return { kind: 'unknown' };
  if (file.endsWith('.ts')) return { kind: 'source', source: file };
  if (BESIDE_A_SOURCE.test(file)) {
    const source = file.replace(BESIDE_A_SOURCE, '.ts');
    return exists(source) || removed.has(source) ? { kind: 'source', source } : { kind: 'unknown' };
  }
  return NO_WORDS.test(file) ? { kind: 'asset' } : { kind: 'unknown' };
}

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : null;
}

/**
 * The changes `git diff --name-status` tells of: each file, whether it is new under its name (added,
 * renamed to or copied to), and whether it is gone (deleted, or renamed from). A file renamed is two
 * changes, the name it left and the name it took.
 */
export function changesOfNameStatus(lines) {
  return lines.filter(Boolean).flatMap((line) => {
    const [status, ...paths] = line.split('\t');
    const file = paths.at(-1);
    if (status.startsWith('R')) {
      return [
        { file: paths[0], fresh: false, gone: true },
        { file, fresh: true, gone: false },
      ];
    }
    return [{ file, fresh: /^[AC]/.test(status), gone: status.startsWith('D') }];
  });
}

const NO_COMMIT = /^0+$/;

/**
 * The ranges of commits a push sends, from the lines git hands the hook before it: `<local ref>
 * <local commit> <remote ref> <remote commit>`. A ref being deleted sends none; one new to the remote
 * has no commit there to start from.
 */
export function pushRanges(input) {
  return input
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4 && !NO_COMMIT.test(parts[1]))
    .map(([, head, , base]) => ({ head, base: NO_COMMIT.test(base) ? null : base }));
}

/**
 * The files a push sends, deleted and renamed ones among them, from what git hands the hook before
 * it; null where they cannot be told, as from a commit on the remote that is not here. A ref new to
 * the remote is measured from where it leaves the main line.
 */
export function pushedChanges(input) {
  const changes = [];
  for (const { head, base } of pushRanges(input)) {
    const from = base ?? git('merge-base', head, 'origin/main')?.[0];
    const lines = from ? git('diff', '--name-status', `${from}...${head}`) : null;
    if (lines === null) return null;
    changes.push(...changesOfNameStatus(lines));
  }
  return changes;
}

/**
 * The files changed and not yet pushed, for whoever asks outside a hook: in the commits since the one
 * given, or the remote lacks, and in the working tree. Each is told as {@link changesOfNameStatus}
 * tells it, a file changed in both ways once, new or gone where either says so.
 */
export function unpushedChanges(since) {
  const base =
    since ??
    git('rev-parse', '--verify', '--quiet', '@{push}')?.[0] ??
    git('merge-base', 'HEAD', 'origin/main')?.[0] ??
    'HEAD';
  const working = (git('status', '--porcelain', '--untracked-files=all') ?? []).map((line) => {
    const code = line.slice(0, 2);
    const status = code.includes('?') || code.includes('A') ? 'A' : code.includes('D') ? 'D' : 'M';
    return `${status}\t${line.slice(3).split(' -> ').pop()}`;
  });
  const merged = new Map();
  for (const change of changesOfNameStatus([...(git('diff', '--name-status', `${base}...HEAD`) ?? []), ...working])) {
    const had = merged.get(change.file);
    merged.set(change.file, {
      file: change.file,
      fresh: change.fresh || had?.fresh === true,
      gone: change.gone && !existsSync(change.file),
    });
  }
  return [...merged.values()];
}

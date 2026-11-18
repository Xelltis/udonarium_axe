/**
 * What a changed file is to whatever picks the tests to run by it.
 *
 * Tests are picked, rather than all run, only for a change whose reach can be told. So the kinds told
 * apart here are the few whose reach is known, and everything else is `unknown`: a file nobody has
 * said anything of reaches every test. A new kind of file is therefore safe until it is given a kind,
 * and both pickers, of unit specs and of e2e specs, ask here rather than keep lists of their own.
 */
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
 * - `source`: a source under src, or the template or stylesheet beside one, which stands for it; the
 *   imports tell what it reaches. `source` names the `.ts` file.
 * - `asset`: a file under src with no words in it, which the app is served and a spec may check by
 *   reading it off the disk, but none imports.
 * - `e2e`: the e2e suite itself, its specs, helpers, pictures and settings.
 * - `bridge`: the AI bridge, a program of its own with tests of its own, which some e2e specs start.
 * - `unknown`: anything else, which may reach any test.
 */
export function kindOfChange(file, exists = existsSync) {
  if (APART.some((pattern) => pattern.test(file))) return { kind: 'apart' };
  if (file.startsWith('e2e/') || file === 'playwright.config.ts') return { kind: 'e2e' };
  if (file.startsWith('tools/axe-mcp/')) return { kind: 'bridge' };
  if (!file.startsWith('src/')) return { kind: 'unknown' };
  if (file.endsWith('.ts')) return { kind: 'source', source: file };
  if (BESIDE_A_SOURCE.test(file)) {
    const source = file.replace(BESIDE_A_SOURCE, '.ts');
    return exists(source) ? { kind: 'source', source } : { kind: 'unknown' };
  }
  return NO_WORDS.test(file) ? { kind: 'asset' } : { kind: 'unknown' };
}

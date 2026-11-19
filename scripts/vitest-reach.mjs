/**
 * What the picker of unit specs goes by beside the imports, worked out from what is handed in alone,
 * so that `vitest-related.mjs` and the spec that holds the rules to it read the same.
 */
import { importedFrom } from './runtime-imports.mjs';

/**
 * How a file is told to read files off the disk rather than import them: the dictionaries, the models
 * and their hashes, the sources it checks the layout or the wording of. What it reads so, no import
 * tells of.
 */
const READS_DISK = /from 'node:fs'|from 'fs'|\breadFileSync\b|\breaddirSync\b|import\.meta\.glob/;

/**
 * The specs that read files off the disk: by themselves, or through a helper they import at any
 * depth, as one that reads the stylesheet of the page or the sources of a folder for them. What such
 * a spec reaches no import tells of, so before a push they run whatever was changed.
 *
 * `texts` holds every source by its path, `importers` what imports each, and `ofSetup` what the test
 * setup loads into every spec. A helper of the setup's is no start: it reaches every spec alike, and
 * is the setup's to answer for, a change to it or to the setup running every spec.
 */
export function specsReadingDisk(texts, importers, ofSetup) {
  const readers = [...texts]
    .filter(([file, text]) => READS_DISK.test(text) && !ofSetup.has(file))
    .map(([file]) => file);
  return [...importedFrom(readers, importers)].filter((file) => file.endsWith('.spec.ts') && texts.has(file)).sort();
}

/** The longest a command line is let grow on each kind of system, in characters, short of what the system takes. */
const COMMAND_LINE_ROOM = { win32: 7000, other: 100_000 };

/**
 * Whether specs named one by one fit the command line they are run by. Windows runs the command
 * through a shell that takes no more than some eight thousand characters; where they do not fit,
 * every spec is run instead, which names none.
 */
export function fitsCommandLine(specs, platform) {
  const room = platform === 'win32' ? COMMAND_LINE_ROOM.win32 : COMMAND_LINE_ROOM.other;
  return specs.reduce((length, spec) => length + spec.length + 1, 0) <= room;
}

/**
 * The module the test setup loads the providers every TestBed module is given from, which it loads
 * only for a spec that builds a module. Whatever else the setup loads, waited on or not, it loads into
 * every spec.
 */
export const TEST_BED_PROVIDERS = 'src/app/testing/test-bed-providers.ts';

/**
 * The specs that name a changed file by its path, as one that reads it off the disk does: a change to
 * it reaches them, whatever kind of file it is and whatever imports say.
 */
export function specsNaming(files, specTexts) {
  const named = (text, file) => ["'", '"', '`'].some((quote) => text.includes(`${quote}${file}${quote}`));
  return [...specTexts]
    .filter(([, text]) => files.some((file) => named(text, file)))
    .map(([spec]) => spec)
    .sort();
}

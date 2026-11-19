/**
 * Which e2e specs a change to the app's sources reaches, worked out from what is handed in alone, so
 * that `e2e-related.mjs` and the spec that holds the rule to it read the same.
 *
 * The rule: a spec is left out only where it can be told that the change does not reach it. A change
 * whose reach cannot be told reaches every spec, and so does a spec that cannot be told to be out of
 * its reach.
 */

/** The name a part of the app loaded as it goes is asked for by: its file's, without the ending. */
export function partNameOf(file) {
  return file.slice(file.lastIndexOf('/') + 1).replace(/\.ts$/, '');
}

/**
 * How a changed source of the app reaches the specs, as the app comes to load it:
 *
 * - `every` where it is loaded as the page starts, or where nothing the imports tell of loads it: a
 *   file the build puts in by a setting of its own, as one swapped in for another, is such a one;
 * - `none` where only specs and what is written for them load it;
 * - `parts`, the names of the parts loaded as the app goes that lead to it, otherwise.
 *
 * A file the build swaps in for another is read as the one it stands in for.
 */
export function reachOfSource(source, how) {
  const read = how.standsInFor?.get(source) ?? source;
  if (!how.files.has(read)) return { every: 'is no source the imports tell of' };
  if (how.atStart.has(read)) return { every: 'is loaded as the page starts' };
  const parts = how.leadingParts.get(read);
  if (parts && parts.size > 0) return { parts: [...parts] };
  if (how.forSpecsAlone.has(read)) return { none: 'is loaded by specs alone' };
  return { every: 'is loaded by nothing the imports tell of, so the build may put it anywhere' };
}

/**
 * What a test left behind of the parts of the app it asked for, read from the lines of its record:
 * the spec, the test's name and the parts. It is taken as all the test asks for only where the test
 * passed after leaving it, which the record is marked with, and the app's own entry is among the
 * parts: a build whose parts the suite cannot name, as one that names them without a hash, leaves
 * none of them. Anything else is untrusted, and the test counts as having left nothing.
 *
 * `marks` names the lines that are no part: the one the test's name follows, the one that says it
 * passed, and the entry's part.
 */
export function recordOf(lines, { titleMark, passedMark, entryPart }) {
  const [spec, ...rest] = lines.filter(Boolean);
  const named = rest.find((line) => line.startsWith(titleMark));
  if (spec === undefined || named === undefined) return null;
  const parts = rest.filter((line) => !line.startsWith(titleMark) && line !== passedMark);
  const trusted = rest.includes(passedMark) && parts.includes(entryPart);
  return { spec, title: named.slice(titleMark.length), parts, trusted };
}

/**
 * The specs reached through the parts of the app, loaded as it goes, that changed sources belong to.
 *
 * `partsChanged` names each such part with a file that changed in it, and whether the part itself is
 * new: added, renamed, or of a standing nobody told. `tests` names the tests each spec has now, or is
 * null where they could not be listed. `kept` holds, for each spec, the parts each of its tests asked
 * for the last time it ran, by the test's name.
 *
 * - A new part no test on record asked for may be asked for by any spec under its new name: every
 *   spec is reached. A part that has stood all along and that no test asked for is reached by none.
 * - A spec with a test that has left nothing behind, as one never run, run under another name or left
 *   out of a run cut short, cannot be told to be out of reach: it is reached.
 * - Where the tests could not be listed, no spec can be told to have left everything: every spec is
 *   reached.
 * - Otherwise a spec is reached where one of its tests asked for a part that changed.
 *
 * Answers the reason every spec is reached, or else the specs reached, each with its reason.
 */
export function specsReachedThroughParts({ partsChanged, specs, tests, kept }) {
  const picked = new Map();
  if (partsChanged.size === 0) return { picked };
  if (tests === null) return { every: 'the tests of the suite could not be listed', picked };
  const asked = new Set();
  for (const byTest of kept.values()) for (const parts of byTest.values()) for (const part of parts) asked.add(part);
  for (const [part, { file, fresh }] of partsChanged) {
    if (fresh && !asked.has(part))
      return { every: `${file} is in ${part}, a new part no test has asked for yet`, picked };
  }
  for (const spec of specs) {
    const byTest = kept.get(spec) ?? new Map();
    const unrun = (tests.get(spec) ?? []).find((title) => !byTest.has(title));
    if (unrun !== undefined || !tests.has(spec)) {
      picked.set(spec, 'has a test that has left nothing to tell what it reaches');
      continue;
    }
    for (const title of tests.get(spec)) {
      const part = [...byTest.get(title)].find((name) => partsChanged.has(name));
      if (part === undefined) continue;
      picked.set(spec, `asks for ${part}, which ${partsChanged.get(part).file} is loaded with`);
      break;
    }
  }
  return { picked };
}

/**
 * Why the specs of a kind are run, in a few lines: where every one is, the reasons with how many
 * specs each stands for, the most first, and otherwise each spec with its own.
 */
export function reasonsOf(specs, whyOf, total) {
  if (specs.length < total || total === 0) return specs.map((spec) => `${spec}  (${whyOf(spec)})`);
  const counts = new Map();
  for (const spec of specs) counts.set(whyOf(spec), (counts.get(whyOf(spec)) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([why, count]) => (count === total ? `every one: ${why}` : `${count}: ${why}`));
}

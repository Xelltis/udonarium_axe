#!/usr/bin/env node
/**
 * Names the e2e and visual specs a change can reach, and with `--run` runs them.
 *
 * A spec works the app through a browser and imports none of it, so what it reaches is read off what
 * it did: each test leaves the names of the parts of the app its browser asked for as it went (see
 * `keepLoadedParts` in e2e/helpers.ts), a panel's code being loaded when the panel is first opened.
 * The sources are sorted by how the app comes to load them. What the page loads as it starts is
 * reached by every spec. What is loaded only as it goes belongs to the parts that lead to it, and is
 * reached by the specs that asked for one of those. A worker is loaded with the file that starts it.
 * The sources of the AI bridge are reached by the specs that start the bridge.
 *
 * It errs towards running a spec. Specs are picked only for a change whose reach can be told, which
 * `change-reach.mjs` decides for this picker and the unit one alike, and `e2e-reach.mjs` for the
 * sources of the app: every spec runs for a file nobody knows anything of, as the build's settings or
 * a file the app is served, for a helper of the suite itself, for a source nothing is seen to load,
 * and for a part of the app new under its name. A spec with a test that has left nothing behind runs
 * too.
 *
 *   node scripts/e2e-related.mjs               the specs reached by what is not yet pushed
 *   node scripts/e2e-related.mjs --since main  ... by what has changed since a commit
 *   node scripts/e2e-related.mjs src/app/...   ... by the files named
 *   node scripts/e2e-related.mjs --run         runs them, each kind of project in turn
 *   node scripts/e2e-related.mjs --run --build  builds the app first, where there is anything to run
 *   node scripts/e2e-related.mjs --run --visual  runs the pictures too, which are left out otherwise,
 *                                                each way of drawing them by itself
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

import { kindOfChange, unpushedChanges } from './change-reach.mjs';
import { partNameOf, reachOfSource, reasonsOf, recordOf, specsReachedThroughParts } from './e2e-reach.mjs';
import { importedFrom, resolveSpecifier, RuntimeImports, sourcesUnder } from './runtime-imports.mjs';

/**
 * What the picker shares with the suite, kept in e2e/related.json, which the helper that writes what
 * each test loaded and the reporter that marks it as passed read as well: where each test leaves the
 * parts of the app it asked for, what its name is kept after there and what joins the groups it stands
 * in to its title, the line that says it passed, and the projects of playwright.config.ts that run the
 * specs of each kind, which a spec holds against the projects the configuration names.
 */
const {
  loadsDir: LOADS_DIR,
  titleMark: TITLE_MARK,
  titleJoint: TITLE_JOINT,
  passedMark: PASSED_MARK,
  projects: PROJECTS,
} = JSON.parse(readFileSync('e2e/related.json', 'utf-8'));
const ENTRY = 'src/main.ts';
/**
 * The sources of the app the AI bridge is built from as well. The bridge is run as a program of its
 * own beside the app, which no part the browser asks for tells of, so these reach the specs that
 * start it beside what the page loads them with.
 */
const SHARED_WITH_BRIDGE = /^src\/app\/core\/agent\//;
/** How a spec that starts the bridge is told: it takes the bridge's place from the helper that builds it. */
const STARTS_BRIDGE = /from '\.\/ai-bridge'/;
/** A script started as a worker of its own, by the address of its file. */
const WORKER_STARTED = /new\s+(?:Shared)?Worker\(\s*new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g;
/** A picture the comparisons are made against, by its name. */
const BASELINE = /^e2e\/visual\/__screenshots__\/[^/]+\/(.+)\.png$/;

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : null;
}

/** The files the build swaps in for others, by any of its configurations: each with the file it stands in for. */
function swappedIn() {
  const standsInFor = new Map();
  const visit = (value) => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value.fileReplacements)) {
      for (const swap of value.fileReplacements) {
        if (typeof swap?.with === 'string' && typeof swap?.replace === 'string') {
          standsInFor.set(posix.normalize(swap.with), posix.normalize(swap.replace));
        }
      }
    }
    for (const inner of Object.values(value)) visit(inner);
  };
  visit(JSON.parse(readFileSync('angular.json', 'utf-8')));
  return standsInFor;
}

/**
 * The tests each spec has now, by name, as Playwright lists them for every project; null where it
 * cannot list them. A test is named by the groups it stands in and its own title.
 */
function testsListed() {
  const listed = spawnSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  let report;
  try {
    report = JSON.parse(listed.stdout);
  } catch {
    return null;
  }
  const tests = new Map();
  const visit = (suite, groups) => {
    for (const spec of suite.specs ?? []) {
      const file = posix.join('e2e', spec.file.split('\\').join('/'));
      const title = [...groups, spec.title].join(TITLE_JOINT);
      if (!tests.has(file)) tests.set(file, new Set());
      tests.get(file).add(title);
    }
    for (const inner of suite.suites ?? []) visit(inner, [...groups, inner.title]);
  };
  for (const file of report.suites ?? []) visit(file, []);
  return new Map([...tests].map(([file, titles]) => [file, [...titles]]));
}

function specsUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'server' ? [] : specsUnder(path);
    return entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/**
 * The parts of the app each test of each spec asked for as it went, by what it left behind, under the
 * test's name, put together over the projects it ran in. A test with a record that cannot be trusted
 * in any project is left out, as one that has left nothing (`recordOf`).
 */
function loadsKept() {
  const loads = new Map();
  const untrusted = [];
  if (!existsSync(LOADS_DIR)) return loads;
  const marks = { titleMark: TITLE_MARK, passedMark: PASSED_MARK, entryPart: partNameOf(ENTRY) };
  for (const project of readdirSync(LOADS_DIR)) {
    for (const file of readdirSync(posix.join(LOADS_DIR, project))) {
      const record = recordOf(readFileSync(posix.join(LOADS_DIR, project, file), 'utf-8').split('\n'), marks);
      if (record === null) continue;
      if (!record.trusted) untrusted.push(record);
      if (!loads.has(record.spec)) loads.set(record.spec, new Map());
      const byTest = loads.get(record.spec);
      if (!byTest.has(record.title)) byTest.set(record.title, new Set());
      for (const part of record.parts) byTest.get(record.title).add(part);
    }
  }
  for (const { spec, title } of untrusted) loads.get(spec)?.delete(title);
  return loads;
}

/**
 * How the app comes to load each source: the ones the page loads as it starts, and for the others
 * the names of the parts, loaded as it goes, that lead to them.
 */
function howSourcesLoad() {
  const files = new Set(sourcesUnder('src'));
  const runtimeImports = new RuntimeImports();
  const waited = new Map();
  const waitedBySpecs = new Map();
  const lazyParts = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const read = runtimeImports.of(text);
    const resolved = (specifiers) => specifiers.map((specifier) => resolveSpecifier(specifier, file, files));
    if (file.endsWith('.spec.ts') || file.startsWith('src/app/testing/')) {
      waitedBySpecs.set(
        file,
        resolved([...read.waited, ...read.dynamic]).filter((dependency) => dependency !== null)
      );
      continue;
    }
    // A worker is started by its file's address rather than imported, and runs whenever what starts it
    // does: it and what it imports are loaded with the file that starts it.
    const workers = [...text.matchAll(WORKER_STARTED)].map(([, address]) => address);
    waited.set(
      file,
      resolved([...read.waited, ...workers]).filter((dependency) => dependency !== null && dependency !== file)
    );
    for (const part of resolved(read.dynamic)) if (part !== null) lazyParts.add(part);
  }
  runtimeImports.save();
  const atStart = importedFrom([ENTRY], waited);
  const leadingParts = new Map();
  for (const part of lazyParts) {
    const name = partNameOf(part);
    for (const file of importedFrom([part], waited)) {
      if (atStart.has(file)) continue;
      if (!leadingParts.has(file)) leadingParts.set(file, new Set());
      leadingParts.get(file).add(name);
    }
  }
  // What the specs and what is written for them load, through whatever those load in turn.
  const forSpecsAlone = importedFrom([...waitedBySpecs.keys()], new Map([...waited, ...waitedBySpecs]));
  return { files, atStart, leadingParts, forSpecsAlone, standsInFor: swappedIn(), lazyParts };
}

const flags = new Set();
const named = [];
let since;
for (const args = process.argv.slice(2); args.length > 0;) {
  const arg = args.shift();
  if (arg === '--since') since = args.shift();
  else if (arg.startsWith('--')) flags.add(arg);
  else named.push(arg);
}
// A file named by hand is new under its name where it was added or renamed and is not pushed yet, or
// where git does not know it; one that stands as git has it has stood all along.
function standingOf(files) {
  const unpushed = new Map(unpushedChanges(since).map(({ file, fresh }) => [file, fresh]));
  const tracked = new Set(git('ls-files', '--', ...files) ?? []);
  return files.map((file) => ({ file, fresh: unpushed.get(file) ?? !tracked.has(file) }));
}
const changed = (
  named.length > 0 ? standingOf(named.map((file) => posix.normalize(file))) : unpushedChanges(since)
).map(({ file, fresh }) => ({ file: posix.normalize(file), fresh }));

const allSpecs = specsUnder('e2e');
const isPicture = (spec) => spec.startsWith('e2e/visual/');
const picked = new Map();
/** What each spec says, read once however many changed files ask. */
const specTexts = new Map();
const textOf = (spec) => {
  if (!specTexts.has(spec)) specTexts.set(spec, readFileSync(spec, 'utf-8'));
  return specTexts.get(spec);
};
const pick = (spec, why) => {
  if (!picked.has(spec)) picked.set(spec, why);
};
const pickEvery = (wanted, why) => {
  for (const spec of allSpecs) if (wanted(spec)) pick(spec, why);
};

/**
 * Picks for a changed file of the suite itself: a spec is itself, a picture is the spec that takes it,
 * what the pictures are taken through is every picture, and any other helper or setting is every spec.
 */
function pickForSuiteFile(file) {
  if (file.endsWith('.spec.ts')) {
    if (allSpecs.includes(file)) pick(file, 'changed itself');
    return;
  }
  const picture = BASELINE.exec(file)?.[1];
  if (picture !== undefined) {
    // Told by the picture's name in the spec; a name put together as the spec runs is found in none,
    // and every picture is taken then.
    const takers = allSpecs.filter((spec) => isPicture(spec) && textOf(spec).includes(`'${picture}'`));
    if (takers.length > 0) for (const spec of takers) pick(spec, `takes ${file}`);
    else pickEvery(isPicture, `${file} is a picture no spec names outright`);
    return;
  }
  if (file.startsWith('e2e/visual/')) pickEvery(isPicture, `${file} reaches every picture`);
  else if (file.startsWith('e2e/server/'))
    pickEvery((spec) => spec.startsWith('e2e/server/'), `${file} reaches the server's specs`);
  else pickEvery(() => true, `${file} reaches every spec`);
}

const how = howSourcesLoad();
const lazyPartNames = new Map([...how.lazyParts].map((part) => [part, partNameOf(part)]));
const partsChanged = new Map();
const removed = new Set(changed.filter((change) => !existsSync(change.file)).map((change) => change.file));
for (const { file, fresh } of changed) {
  const change = kindOfChange(file, existsSync, removed);
  if (change.kind === 'apart') continue;
  if (change.kind === 'bridge' || SHARED_WITH_BRIDGE.test(file)) {
    pickEvery((spec) => STARTS_BRIDGE.test(textOf(spec)), `${file} is built into the bridge it starts`);
    if (change.kind === 'bridge') continue;
  }
  if (change.kind === 'e2e') {
    pickForSuiteFile(file);
    continue;
  }
  // The app is served its assets, and a file nobody has said anything of may be built into all of it.
  if (change.kind !== 'source') {
    pickEvery(() => true, `${file} may reach any spec`);
    continue;
  }
  const { source } = change;
  if (source.endsWith('.spec.ts') || source.startsWith('src/app/testing/')) continue;
  // A source taken away is loaded by nothing any more; what loaded it has changed with it.
  if (!existsSync(file)) continue;
  const reach = reachOfSource(source, how);
  if (reach.none !== undefined) continue;
  if (reach.every !== undefined) {
    pickEvery(() => true, `${file} ${reach.every}`);
    continue;
  }
  // A part is new where its own file is: under a new name, no test on record has asked for it by that.
  const own = lazyPartNames.get(source);
  for (const part of reach.parts) {
    const known = partsChanged.get(part);
    if (!known) partsChanged.set(part, { file, fresh: fresh && part === own });
    else if (fresh && part === own) partsChanged.set(part, { file, fresh: true });
  }
}
if (partsChanged.size > 0) {
  // The tests are listed only where a pick is narrowed by what they left: it takes Playwright a while.
  const listed = testsListed();
  const through = specsReachedThroughParts({
    partsChanged,
    specs: allSpecs,
    tests: listed,
    kept: loadsKept(),
  });
  if (through.every !== undefined) pickEvery(() => true, through.every);
  for (const [spec, why] of through.picked) pick(spec, why);
}

const kinds = { e2e: [], visual: [] };
for (const spec of [...picked.keys()].sort()) kinds[isPicture(spec) ? 'visual' : 'e2e'].push(spec);
const total = { e2e: allSpecs.filter((spec) => !isPicture(spec)).length, visual: allSpecs.filter(isPicture).length };
for (const kind of ['e2e', 'visual']) {
  console.log(`[e2e-related] ${kind}: ${kinds[kind].length} of ${total[kind]} spec(s)`);
  for (const line of reasonsOf(kinds[kind], (spec) => picked.get(spec), total[kind])) console.log(`  ${line}`);
}

if (flags.has('--run')) {
  const kindsRun = (flags.has('--visual') ? ['e2e', 'visual'] : ['e2e']).filter((kind) => kinds[kind].length > 0);
  // The specs work what was last built: built here, and only where there is a spec to run on it.
  if (flags.has('--build') && kindsRun.length > 0) {
    const built = spawnSync('npx', ['ng', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
  for (const kind of kindsRun) {
    // The pictures are drawn without a graphics card, and the two ways of drawing them at once are more
    // pages than a machine draws in time: each is run by itself, one after the other.
    const runs = kind === 'visual' ? PROJECTS[kind].map((project) => [project]) : [PROJECTS[kind]];
    for (const projects of runs) {
      const result = spawnSync(
        'npx',
        [
          'playwright',
          'test',
          ...projects.map((project) => `--project=${project}`),
          // One way of drawing leaves out the pictures of the page alone: a pick of only those is none of its.
          ...(kind === 'visual' ? ['--pass-with-no-tests'] : []),
          ...kinds[kind],
        ],
        { stdio: 'inherit', shell: process.platform === 'win32' }
      );
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}

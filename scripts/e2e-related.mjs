#!/usr/bin/env node
/**
 * Names the e2e and visual specs a change can reach, and with `--run` runs them.
 *
 * A spec works the app through a browser and imports none of it, so what it reaches is read off what
 * it did: each test leaves the names of the parts of the app its browser asked for as it went (see
 * `keepLoadedParts` in e2e/helpers.ts), a panel's code being loaded when the panel is first opened.
 * The sources are sorted by how the app comes to load them. What the page loads as it starts is
 * reached by every spec. What is loaded only as it goes belongs to the parts that lead to it, and is
 * reached by the specs that asked for one of those. What nothing loads is reached by none. A worker
 * is loaded with the file that starts it. The sources of the AI bridge are reached by the specs that
 * start the bridge.
 *
 * It errs towards running a spec. A spec that has left nothing behind yet runs, as does every spec
 * when the change touches what the suite itself is made of, the build's settings, or a file the app
 * is served rather than compiled from.
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

import { importedFrom, resolveSpecifier, RuntimeImports, sourcesUnder } from './runtime-imports.mjs';

const LOADS_DIR = 'node_modules/.cache/axe-e2e/loads';
const ENTRY = 'src/main.ts';
/** The projects of playwright.config.ts that run the specs of each kind. */
const PROJECTS = {
  e2e: ['chromium', 'chromium-webgl', 'chromium-webgpu', 'mobile', 'mobile-webgl'],
  visual: ['visual-webgl2', 'visual-webgpu'],
};
/** What every spec is run through or served from, whichever part of the app it tries. */
const REACHES_EVERY_SPEC = [
  /^package(?:-lock)?\.json$/,
  /^angular\.json$/,
  /^tsconfig(?:\.app)?\.json$/,
  /^\.postcssrc\.json$/,
  /^\.browserslistrc$/,
  /^playwright\.config\.ts$/,
  /^e2e\/(?!visual\/|server\/).+(?<!\.spec)\.(?:ts|mjs)$/,
  /^src\/(?:index\.html|styles\.css|main\.ts)$/,
  /^src\/assets\//,
  /^public\//,
];
/**
 * What the specs that start the AI bridge run beside the app: the bridge is built from these and run
 * as a program of its own, which no part the browser asks for tells of.
 */
const BRIDGE_SOURCES = /^tools\/axe-mcp\//;
/** The sources of the app the bridge is built from as well, which reach its specs beside what the page loads them with. */
const SHARED_WITH_BRIDGE = /^src\/app\/core\/agent\//;
/** How a spec that starts the bridge is told: it takes the bridge's place from the helper that builds it. */
const STARTS_BRIDGE = /from '\.\/ai-bridge'/;
/** A script started as a worker of its own, by the address of its file. */
const WORKER_STARTED = /new\s+(?:Shared)?Worker\(\s*new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g;
/** A picture the comparisons are made against, by its name. */
const BASELINE = /^e2e\/visual\/__screenshots__\/[^/]+\/(.+)\.png$/;
/** What every picture is taken through, beside the above. */
const REACHES_EVERY_PICTURE = [/^e2e\/visual\/(?!.*\.spec\.ts$)/];

function git(...args) {
  const result = spawnSync('git', args, { encoding: 'utf-8' });
  return result.status === 0 ? result.stdout.split('\n').filter(Boolean) : null;
}

/** The files changed and not yet pushed: in the commits the remote lacks, and in the working tree. */
function changedFiles(since) {
  const base =
    since ??
    git('rev-parse', '--verify', '--quiet', '@{push}')?.[0] ??
    git('merge-base', 'HEAD', 'origin/main')?.[0] ??
    'HEAD';
  const committed = git('diff', '--name-only', `${base}...HEAD`) ?? [];
  const working = git('status', '--porcelain', '--untracked-files=all') ?? [];
  return [...new Set([...committed, ...working.map((line) => line.slice(3).split(' -> ').pop())])];
}

function specsUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'server' ? [] : specsUnder(path);
    return entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The parts of the app each spec's tests asked for as they went, by what they left behind. */
function loadsKept() {
  const loads = new Map();
  if (!existsSync(LOADS_DIR)) return loads;
  for (const project of readdirSync(LOADS_DIR)) {
    for (const file of readdirSync(posix.join(LOADS_DIR, project))) {
      const [spec, ...parts] = readFileSync(posix.join(LOADS_DIR, project, file), 'utf-8')
        .split('\n')
        .filter(Boolean);
      if (spec === undefined) continue;
      if (!loads.has(spec)) loads.set(spec, new Set());
      for (const part of parts) loads.get(spec).add(part);
    }
  }
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
  const lazyParts = new Set();
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const read = runtimeImports.of(text);
    if (file.endsWith('.spec.ts') || file.startsWith('src/app/testing/')) continue;
    const resolved = (specifiers) => specifiers.map((specifier) => resolveSpecifier(specifier, file, files));
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
    const name = posix.basename(part, '.ts');
    for (const file of importedFrom([part], waited)) {
      if (atStart.has(file)) continue;
      if (!leadingParts.has(file)) leadingParts.set(file, new Set());
      leadingParts.get(file).add(name);
    }
  }
  return { files, atStart, leadingParts };
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
const changed = (named.length > 0 ? named : changedFiles(since)).map((file) => posix.normalize(file));

const allSpecs = specsUnder('e2e');
const isPicture = (spec) => spec.startsWith('e2e/visual/');
const loads = loadsKept();
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

const { files, atStart, leadingParts } = howSourcesLoad();
const partsChanged = new Map();
for (const file of changed) {
  if (REACHES_EVERY_SPEC.some((pattern) => pattern.test(file))) {
    pickEvery(() => true, `${file} reaches every spec`);
    continue;
  }
  const picture = BASELINE.exec(file)?.[1];
  if (picture !== undefined) {
    // A picture taken again is checked by the spec that takes it, told by the picture's name in it; a
    // name put together as the spec runs is found in none, and every picture is taken then.
    const takers = allSpecs.filter((spec) => isPicture(spec) && textOf(spec).includes(`'${picture}'`));
    if (takers.length > 0) for (const spec of takers) pick(spec, `takes ${file}`);
    else pickEvery(isPicture, `${file} is a picture no spec names outright`);
    continue;
  }
  if (REACHES_EVERY_PICTURE.some((pattern) => pattern.test(file))) {
    pickEvery(isPicture, `${file} reaches every picture`);
    continue;
  }
  if (file.startsWith('e2e/') && file.endsWith('.spec.ts')) {
    if (allSpecs.includes(file)) pick(file, 'changed itself');
    continue;
  }
  if (BRIDGE_SOURCES.test(file) || SHARED_WITH_BRIDGE.test(file)) {
    pickEvery((spec) => STARTS_BRIDGE.test(textOf(spec)), `${file} is built into the bridge it starts`);
    if (BRIDGE_SOURCES.test(file)) continue;
  }
  if (!file.startsWith('src/') || file.endsWith('.spec.ts') || file.startsWith('src/app/testing/')) continue;
  const source = file.replace(/\.(?:html|css)$/, '.ts');
  if (!files.has(source)) {
    if (existsSync(file)) pickEvery(() => true, `${file} is no source the imports tell of`);
    continue;
  }
  if (atStart.has(source)) {
    pickEvery(() => true, `${file} is loaded as the page starts`);
    continue;
  }
  for (const part of leadingParts.get(source) ?? []) {
    if (!partsChanged.has(part)) partsChanged.set(part, file);
  }
}
for (const spec of allSpecs) {
  const asked = loads.get(spec);
  if (asked === undefined) {
    if (partsChanged.size > 0) pick(spec, 'has left nothing to tell what it reaches');
    continue;
  }
  const part = [...partsChanged.keys()].find((name) => asked.has(name));
  if (part !== undefined) pick(spec, `asks for ${part}, which ${partsChanged.get(part)} is loaded with`);
}

const kinds = { e2e: [], visual: [] };
for (const spec of [...picked.keys()].sort()) kinds[isPicture(spec) ? 'visual' : 'e2e'].push(spec);
const total = { e2e: allSpecs.filter((spec) => !isPicture(spec)).length, visual: allSpecs.filter(isPicture).length };
for (const kind of ['e2e', 'visual']) {
  console.log(`[e2e-related] ${kind}: ${kinds[kind].length} of ${total[kind]} spec(s)`);
  if (kinds[kind].length === total[kind]) {
    if (total[kind] > 0) console.log(`  every one: ${picked.get(kinds[kind][0])}`);
    continue;
  }
  for (const spec of kinds[kind]) console.log(`  ${spec}  (${picked.get(spec)})`);
}

if (flags.has('--run')) {
  const kindsRun = (flags.has('--visual') ? ['e2e', 'visual'] : ['e2e']).filter((kind) => kinds[kind].length > 0);
  // The specs work what was last built: built here, and only where there is a spec to run on it.
  if (flags.has('--build') && kindsRun.length > 0) {
    const built = spawnSync('npx', ['ng', 'build'], { stdio: 'inherit', shell: process.platform === 'win32' });
    if (built.status !== 0) process.exit(built.status ?? 1);
  }
  for (const kind of flags.has('--visual') ? ['e2e', 'visual'] : ['e2e']) {
    if (kinds[kind].length === 0) continue;
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

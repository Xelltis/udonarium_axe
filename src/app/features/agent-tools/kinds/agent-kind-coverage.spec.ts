import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { TestBed } from '@angular/core/testing';
import { agentToolOf } from '@axe/core/agent/agent-tools';
import { AGENT_KIND_COVERAGE } from '@axe/features/agent-tools/kinds/agent-kind-coverage';
import { AgentKinds } from '@axe/features/agent-tools/kinds/agent-kinds.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** Every source file of the app, specs left out. */
function sourcesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourcesIn(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The name every `@SyncObject` of the app is synced under, a constant's resolved through the file it is written in. */
function syncedKinds(): string[] {
  const constants = new Map<string, string>();
  const named: string[] = [];
  const sources = sourcesIn('src/app').map((path) => readFileSync(path, 'utf8'));
  for (const source of sources) {
    for (const [, name, value] of source.matchAll(/export const ([A-Z_]+) = '([^']+)'/g)) constants.set(name, value);
  }
  for (const source of sources) {
    for (const [, quoted, constant] of source.matchAll(/@SyncObject\((?:'([^']+)'|([A-Z_]+))\)/g)) {
      named.push(quoted ?? constants.get(constant) ?? `unresolved ${constant}`);
    }
  }
  return [...new Set(named)].sort();
}

/** The kinds the AI link does not reach yet, which the coming stages of its work take one by one. */
const NOT_YET = [
  'Alarm',
  'Vote',
  'asset-owner',
  'asset-removal',
  'audio-tag',
  'background-sound',
  'board-scene',
  'board-stash',
  'board-switch',
  'buff-palette',
  'card',
  'card-stack',
  'character',
  'chat-palette',
  'chat-reaction',
  'chat-tab',
  'chat-tab-list',
  'coin',
  'config',
  'cut-in',
  'cut-in-launcher',
  'cut-in-layer',
  'cut-in-scene',
  'data',
  'dice-symbol',
  'effect-field',
  'effect-preset',
  'engagement-zone',
  'fog-memory',
  'game-table',
  'ground-chunk',
  'ground-field',
  'image-tag',
  'image-tag-lock',
  'jukebox',
  'light-source',
  'model-tag',
  'move-block-map',
  'party',
  'playlist',
  'range',
  'scenario-text',
  'sound-effect',
  'stamp-pack',
  'status-ailment-catalog',
  'summary-setting',
  'table-ambience',
  'table-background-layer',
  'table-mask',
  'table-move-cost',
  'table-ruler',
  'table-trigger',
  'terrain',
  'vn-stage',
  'white-board',
];

describe('AGENT_KIND_COVERAGE', () => {
  it('says how the AI link reaches every kind of synced thing, or why it does not', () => {
    const covered = Object.keys(AGENT_KIND_COVERAGE);

    expect([...covered, ...NOT_YET].sort()).toEqual(syncedKinds());
    expect(covered.filter((kind) => NOT_YET.includes(kind))).toEqual([]);
  });

  it('offers every kind it says the generic tools reach, and names only tools there are', () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const kinds = TestBed.inject(AgentKinds);

    for (const [kind, coverage] of Object.entries(AGENT_KIND_COVERAGE)) {
      if (coverage.by === 'kind') expect(kinds.of(kind), kind).not.toBeNull();
      if (coverage.by === 'within') {
        expect(
          kinds.of(coverage.kind)?.fields.map((field) => field.name),
          kind
        ).toContain(coverage.field);
      }
      if (coverage.by === 'tools') for (const tool of coverage.tools) expect(agentToolOf(tool), tool).not.toBeNull();
    }
    expect(
      kinds
        .all()
        .map((kind) => kind.kind)
        .filter((kind) => AGENT_KIND_COVERAGE[kind]?.by !== 'kind')
    ).toEqual([]);
  });
});

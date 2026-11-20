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

describe('AGENT_KIND_COVERAGE', () => {
  it('says how the AI link reaches every kind of synced thing, or why it does not', () => {
    expect(Object.keys(AGENT_KIND_COVERAGE).sort()).toEqual(syncedKinds());
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

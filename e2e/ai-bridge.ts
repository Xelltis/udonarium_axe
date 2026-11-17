import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** The bridge as a release carries it. */
export const BRIDGE = 'tools/axe-mcp/dist/axe-mcp.mjs';

/** What the bridge is built from: its own sources and the definitions it shares with the tab. */
const SOURCES = ['tools/axe-mcp/src', 'src/app/core/agent'];
/** Held by the worker building the bridge, so that the others wait for it rather than write it too. */
const LOCK = 'tools/axe-mcp/dist/.e2e-build';

function newestIn(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestIn(path));
    else if (!entry.name.endsWith('.spec.ts')) newest = Math.max(newest, statSync(path).mtimeMs);
  }
  return newest;
}

function stale(): boolean {
  const built = existsSync(BRIDGE) ? statSync(BRIDGE).mtimeMs : 0;
  return SOURCES.some((dir) => newestIn(dir) > built);
}

function pause(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Builds the bridge where it is missing or older than what it is built from, as a bridge of another
 * release would turn the tab away. One worker builds; any other waits until it is done.
 */
export function buildBridgeIfStale(): void {
  if (!stale()) return;
  mkdirSync('tools/axe-mcp/dist', { recursive: true });
  try {
    mkdirSync(LOCK);
  } catch {
    for (let waited = 0; existsSync(LOCK) && waited < 120_000; waited += 200) pause(200);
    return;
  }
  try {
    execFileSync('node', ['tools/axe-mcp/build.mjs'], { stdio: 'inherit' });
  } finally {
    rmdirSync(LOCK);
  }
}

import { readFileSync } from 'node:fs';

/**
 * Every import or re-export in a source file, read as text: whether it brings in types alone, the
 * clause between the keyword and `from`, and the module it names.
 */
export const IMPORT_STATEMENTS = /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s*'([^']+)'/gms;

/** The modules a file loads when it runs: every import not marked as bringing in types alone. */
export function loadedBy(file: string): string[] {
  const loaded: string[] = [];
  for (const [, typeOnly, clause, path] of readFileSync(file, 'utf8').matchAll(IMPORT_STATEMENTS)) {
    if (typeOnly) continue;
    const named = clause.match(/\{([^}]*)\}/)?.[1];
    const bare = clause.replace(/\{[^}]*\}/, '').replace(/[,\s]/g, '');
    const values = (named ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0 && !name.startsWith('type '));
    if (named !== undefined && !bare && values.length === 0) continue;
    loaded.push(path);
  }
  return loaded;
}

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ENTRY = resolve(process.cwd(), 'src/styles.css');

/**
 * The app's global stylesheet as one text, as the build puts it together: `src/styles.css` with each
 * of its own partials read in where it imports them.
 */
export function readGlobalStyles(): string {
  return readFileSync(ENTRY, 'utf8').replace(/^@import '(\.\/[^']+)';$/gm, (_, path: string) =>
    readFileSync(resolve(dirname(ENTRY), path), 'utf8')
  );
}

import { readdirSync, readFileSync } from 'fs';
import { basename, join } from 'path';

/**
 * The templates and stylesheets a component compiled at run time may name.
 *
 * Both test runners compile the app's components ahead of time with their templates inside, so
 * this is asked only for a component a spec compiles itself. Angular hands over the address as the
 * component wrote it, without the folder it was written in, so the file is looked up by its name
 * alone: a name no file carries, or one carried by files in several folders, is refused rather
 * than answered with an empty template or with whichever file was walked last.
 */
export class ComponentResources {
  private pathsByName: Map<string, string[]> | null = null;

  /** Looks for the files under `root`, which is walked the first time one is asked for. */
  constructor(private readonly root: string) {}

  /** The text of the one file whose name `url` ends in. */
  read(url: string): string {
    this.pathsByName ??= resourcePathsByName(this.root, new Map());
    const paths = this.pathsByName.get(basename(url)) ?? [];
    if (paths.length === 0) {
      throw new Error(`No file under ${this.root} is the component resource ${url}.`);
    }
    if (paths.length > 1) {
      throw new Error(
        `The component resource ${url} could be any of ${paths.join(', ')}. Give the files different names.`
      );
    }
    return readFileSync(paths[0], 'utf-8');
  }
}

function resourcePathsByName(dir: string, found: Map<string, string[]>): Map<string, string[]> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      resourcePathsByName(fullPath, found);
    } else if (entry.name.endsWith('.html') || entry.name.endsWith('.css')) {
      found.set(entry.name, [...(found.get(entry.name) ?? []), fullPath]);
    }
  }
  return found;
}

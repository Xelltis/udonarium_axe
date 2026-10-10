import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

function templatesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return templatesIn(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

/**
 * A class that shows something only while a mouse is over it.
 *
 * A plain hover that only brightens what is already there is left alone; what is looked for is a
 * group hover that fades a thing in, or a hover that gives a thing room or puts it on screen.
 */
const REVEAL =
  /(?<![\w:/-])(group-hover(?:\/[\w-]+)?:(?:\[[^\]\s]+\]:)?(?:opacity-\d+|block|flex|inline-flex|inline-block|inline|visible|h-[\d.]+)|hover:(?:\[[^\]\s]+\]:)?(?:block|flex|inline-flex|inline-block|inline|visible|h-[\d.]+))(!?)(?=\s|$)/g;

/**
 * What a touch screen reaches another way, by template and class, with the way it is reached.
 *
 * A new entry needs a reason as good as these: somewhere a finger can get to the same thing.
 */
const REACHED_ANOTHER_WAY: Record<string, Record<string, string>> = {
  'chat-message.component.html': {
    'group-hover/body:opacity-100': 'a press held on the line opens the same actions',
  },
  'visual-novel-backlog.component.html': {
    'group-hover/log:opacity-100': 'a press held on the line opens its edit',
  },
  'card-stack-card-list.component.html': {
    'group-hover/thumb:opacity-100': 'the thumbnail itself is the button; the pencil over it is only a hint',
  },
  'dice-symbol.component.html': {
    'hover:[&_.material-icons]:inline': 'the icons show while the die is pressed',
  },
};

function escapeClass(name: string): string {
  return name.replace(/[:/[\]&.!()%#]/g, (character) => `\\${character}`);
}

describe('what only shows under a mouse', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('shows on a touch screen too, or is reached there another way', () => {
    const unreached = new Set<string>();
    for (const template of templatesIn('src/app')) {
      const source = readFileSync(template, 'utf8');
      for (const [, classes] of source.matchAll(/\sclass="([^"]*)"/g)) {
        const tokens = new Set(classes.split(/\s+/));
        for (const [, reveal, bang] of classes.matchAll(REVEAL)) {
          const shown = reveal.slice(reveal.indexOf(':') + 1);
          if (tokens.has(`pointer-coarse:${shown}`) || tokens.has(`pointer-coarse:${shown}!`)) continue;
          if (css.includes(`body.touch-input .${escapeClass(reveal + bang)}`)) continue;
          if (REACHED_ANOTHER_WAY[basename(template)]?.[reveal]) continue;
          unreached.add(`${template}: ${reveal}${bang}`);
        }
      }
    }

    expect([...unreached]).toEqual([]);
  });
});

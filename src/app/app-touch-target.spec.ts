import { readFileSync } from 'node:fs';

/** The templates whose small buttons stay on screen on a phone. */
const SMALL_BUTTON_TEMPLATES = [
  'src/app/features/hotbar/hotbar-bar/hotbar-bar.component.html',
  'src/app/features/chat/chat-tab-strip/chat-tab-strip.component.html',
  'src/app/features/chat/chat-input/chat-input.component.html',
];

/** One step of Tailwind's spacing scale, in pixels at the default root size. */
const SPACING_STEP_PX = 4;

const VOID_ELEMENTS = new Set(['input', 'img', 'br', 'hr', 'source', 'wbr']);

/** An element of a template, with the classes it is written with and the elements written inside it. */
interface TemplateElement {
  readonly classes: ReadonlySet<string>;
  readonly children: TemplateElement[];
  /** Whether a `@for` block is written directly inside it, so a child may stand beside copies of itself. */
  repeats: boolean;
}

/** The elements of a template, nested as they are written. */
function elementTreeOf(source: string): TemplateElement {
  const root: TemplateElement = { classes: new Set(), children: [], repeats: false };
  const open = [root];
  const tag = /<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s"'=<>/]+(?:="[^"]*")?)*)\s*(\/?)>/g;
  let textFrom = 0;
  for (const match of source.matchAll(tag)) {
    const parent = open[open.length - 1];
    if (source.slice(textFrom, match.index).includes('@for')) parent.repeats = true;
    textFrom = match.index + match[0].length;

    const [, closing, name, attributes, selfClosing] = match;
    if (closing) {
      open.pop();
      continue;
    }
    const classes = /\sclass="([^"]*)"/.exec(attributes)?.[1] ?? '';
    const element: TemplateElement = {
      classes: new Set(classes.split(/\s+/).filter(Boolean)),
      children: [],
      repeats: false,
    };
    parent.children.push(element);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) open.push(element);
  }
  return root;
}

/** The pixels a spacing class with one of these prefixes adds, or nothing when none is written. */
function spacingOf(classes: ReadonlySet<string>, prefixes: readonly string[]): number {
  for (const token of classes) {
    for (const prefix of prefixes) {
      if (!token.startsWith(`${prefix}-`)) continue;
      const value = token.slice(prefix.length + 1);
      if (value === 'px') return 1;
      const arbitrary = /^\[(\d+(?:\.\d+)?)px\]$/.exec(value);
      if (arbitrary) return Number(arbitrary[1]);
      if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * SPACING_STEP_PX;
    }
  }
  return 0;
}

/** The room between each pair of touch targets written side by side, in pixels. */
function gapsBetweenNeighbours(element: TemplateElement, gaps: number[] = []): number[] {
  const isTarget = (child: TemplateElement | undefined) => child?.classes.has('touch-target') ?? false;
  const gap = spacingOf(element.classes, ['gap', 'gap-x']);
  element.children.forEach((child, index) => {
    const next = element.children[index + 1];
    if (isTarget(child) && element.repeats) {
      gaps.push(gap + spacingOf(child.classes, ['mr', 'mx']) + spacingOf(child.classes, ['ml', 'mx']));
    }
    if (isTarget(child) && isTarget(next)) {
      gaps.push(gap + spacingOf(child.classes, ['mr', 'mx']) + spacingOf(next.classes, ['ml', 'mx']));
    }
    gapsBetweenNeighbours(child, gaps);
  });
  return gaps;
}

/** The declarations of the global stylesheet's rule written for exactly this selector. */
function declarationsOf(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? null;
}

/** How far past its own edge a declared offset reaches, in pixels, or null when it is not declared. */
function reachOf(declarations: string | null, property: string): number | null {
  const value = new RegExp(`(?:^|[;\\s])${property}:\\s*(-?\\d+(?:\\.\\d+)?)(?:px)?\\s*;`).exec(
    declarations ?? ''
  )?.[1];
  return value === undefined ? null : -Number(value);
}

describe('small buttons that stay on screen on a phone', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('are given a larger place to be pressed on a touch screen', () => {
    const bare: string[] = [];
    for (const template of SMALL_BUTTON_TEMPLATES) {
      const source = readFileSync(template, 'utf8');
      for (const [, classes] of source.matchAll(/<button[^>]*?\sclass="([^"]*)"/g)) {
        const tokens = new Set(classes.split(/\s+/));
        const small = tokens.has('size-6') || (tokens.has('h-6') && tokens.has('w-5'));
        if (small && !tokens.has('touch-target')) bare.push(`${template}: ${classes.slice(0, 80)}`);
      }
    }

    expect(bare).toEqual([]);
  });

  it('reach further than they are drawn', () => {
    expect(css).toMatch(/body\.touch-input \.touch-target::after\s*\{[^}]*inset:\s*-/);
  });

  it('take no part of the neighbour they are written beside', () => {
    const inset = /inset:\s*(-?\d+(?:\.\d+)?)px(?:\s+(-?\d+(?:\.\d+)?)px)?/.exec(
      declarationsOf(css, 'body.touch-input .touch-target::after') ?? ''
    );
    const sideways = -Number(inset?.[2] ?? inset?.[1] ?? 0);
    const towardsNext =
      reachOf(declarationsOf(css, 'body.touch-input .touch-target:has(+ .touch-target)::after'), 'right') ?? sideways;
    const towardsPrevious =
      reachOf(declarationsOf(css, 'body.touch-input .touch-target + .touch-target::after'), 'left') ?? sideways;

    const crowded: string[] = [];
    let pairs = 0;
    for (const template of SMALL_BUTTON_TEMPLATES) {
      for (const gap of gapsBetweenNeighbours(elementTreeOf(readFileSync(template, 'utf8')))) {
        pairs++;
        if (towardsNext + towardsPrevious > gap) {
          crowded.push(`${template}: ${towardsNext}px + ${towardsPrevious}px across a ${gap}px gap`);
        }
      }
    }

    expect(pairs).toBeGreaterThan(0);
    expect(crowded).toEqual([]);
  });
});

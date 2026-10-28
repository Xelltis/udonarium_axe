export type PaletteLineKind = 'command' | 'heading' | 'variable' | 'empty' | 'tab';

export interface PaletteRow {
  text: string;
  kind: PaletteLineKind;
  lineIndex: number;
  headingName?: string;
  tabName?: string;
}

const DASH_HEADING = /^\/\/--[-]+(.*)$/;
const MARK_HEADING = /^◆(.*)$/;
/**
 * A line opening a tab: two diamonds and its name. A version before tabs reads it as a heading, as it
 * does anything starting with a diamond; three or more stay a heading here too, as written to set
 * one off.
 */
const TAB_MARK = /^◆◆(?!◆)(.*)$/;

/** Whether a palette line opens a tab rather than saying anything. */
export function isPaletteTabLine(line: string): boolean {
  return TAB_MARK.test(line);
}
const VARIABLE = /^\s*[/／]{2}([^=＝{}｛｝\s]+)\s*[=＝]\s*(.+)/;

/** What each line of a palette is: something to say, a heading over the rest, a variable, or nothing. */
export function paletteRowsOf(lines: readonly string[]): PaletteRow[] {
  return lines.map((text, lineIndex): PaletteRow => {
    if (/^\s*$/.test(text)) return { text, kind: 'empty', lineIndex };

    const tab = text.match(TAB_MARK);
    if (tab) return { text, kind: 'tab', lineIndex, tabName: tab[1].trim() };

    const dashed = text.match(DASH_HEADING);
    if (dashed) return { text, kind: 'heading', lineIndex, headingName: dashed[1].replace(/-+$/, '') };

    const marked = text.match(MARK_HEADING);
    if (marked) return { text, kind: 'heading', lineIndex, headingName: marked[1] };

    if (VARIABLE.test(text)) return { text, kind: 'variable', lineIndex };
    return { text, kind: 'command', lineIndex };
  });
}

export interface PaletteCommandGroup {
  /** The tab these lines sit in, empty for a palette with no tabs or the lines before the first. */
  tab: string;
  /** The heading these lines sit under, empty for the ones written before any heading. */
  heading: string;
  lines: string[];
}

/** The lines worth sending, kept under the headings they were written beneath. */
export function paletteCommandGroups(lines: readonly string[]): PaletteCommandGroup[] {
  const groups: PaletteCommandGroup[] = [];
  let current: PaletteCommandGroup | null = null;
  let tab = '';

  for (const row of paletteRowsOf(lines)) {
    if (row.kind === 'tab') {
      tab = row.tabName ?? '';
      current = null;
      continue;
    }
    if (row.kind === 'heading') {
      current = { tab, heading: (row.headingName ?? '').trim(), lines: [] };
      groups.push(current);
      continue;
    }
    if (row.kind !== 'command') continue;

    if (!current) {
      current = { tab, heading: '', lines: [] };
      groups.push(current);
    }
    current.lines.push(row.text.trim());
  }

  return groups.filter((group) => group.lines.length > 0);
}

/** One tab of a palette: its name, empty for the lines before the first tab, and the rows in it. */
export interface PaletteTab {
  name: string;
  rows: PaletteRow[];
}

/**
 * The tabs a palette is parted into by its `◆◆name` lines, the lines before the first making a tab
 * of their own where they hold anything. None for a palette with no such line, which shows as it
 * always did.
 */
export function paletteTabsOf(rows: readonly PaletteRow[]): PaletteTab[] {
  if (!rows.some((row) => row.kind === 'tab')) return [];
  const tabs: PaletteTab[] = [];
  let current: PaletteTab = { name: '', rows: [] };
  const close = () => {
    if (tabs.length > 0 || current.rows.some((row) => row.kind !== 'empty')) tabs.push(current);
  };
  for (const row of rows) {
    if (row.kind !== 'tab') {
      current.rows.push(row);
      continue;
    }
    close();
    current = { name: row.tabName ?? '', rows: [] };
  }
  close();
  return tabs;
}

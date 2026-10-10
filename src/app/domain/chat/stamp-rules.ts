/**
 * What a room lets its stamps be used for: sent as a line, and put on a line as a reaction. Each
 * use can be turned off as a whole, or have stamps of its own denied, by identifier.
 *
 * The rules decide what can be used from now on. A stamp sent before it was denied stays as it was
 * sent, where it was sent.
 */

/** The ways a stamp is used, each with rules of its own. */
export const STAMP_USES = ['line', 'reaction'] as const;
export type StampUse = (typeof STAMP_USES)[number];

/** The rules for one use: whether it is turned off, and the stamps it may not use. */
export interface StampUseRules {
  readonly off: boolean;
  readonly denied: readonly string[];
}

export type StampRules = Readonly<Record<StampUse, StampUseRules>>;

/** The rules of a room that has set none: every stamp, for every use. */
export const OPEN_STAMP_RULES: StampRules = {
  line: { off: false, denied: [] },
  reaction: { off: false, denied: [] },
};

let lastRead: { readonly held: string; readonly rules: StampRules } | null = null;

/**
 * Reads the rules a room holds.
 *
 * Empty text is a room that set none, as a room saved before there were any reads. Anything that
 * is not rules, such as a damaged save, reads the same way, so the stamps stay usable rather than
 * vanishing. A denied stamp this version does not know is kept, for the version that does.
 */
export function readStampRules(held: unknown): StampRules {
  const text = `${held ?? ''}`;
  if (lastRead?.held === text) return lastRead.rules;
  const rules = parseStampRules(text);
  lastRead = { held: text, rules };
  return rules;
}

/** Writes rules the way {@link readStampRules} reads them, with empty for a room that sets none. */
export function writeStampRules(rules: StampRules): string {
  const written: Record<string, { off?: true; deny?: string[] }> = {};
  for (const use of STAMP_USES) {
    const { off, denied } = rules[use];
    const entry: { off?: true; deny?: string[] } = {};
    if (off) entry.off = true;
    if (denied.length > 0) entry.deny = uniqueIds(denied);
    if (Object.keys(entry).length > 0) written[use] = entry;
  }
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

/** Whether a use is on at all. */
export function stampUseOn(rules: StampRules, use: StampUse): boolean {
  return !rules[use].off;
}

/** Whether a stamp may be used this way: the use is on, and the stamp is not denied it. */
export function stampAllowed(rules: StampRules, use: StampUse, stampId: string): boolean {
  return !rules[use].off && !rules[use].denied.includes(stampId);
}

/** The rules with a use turned on or off, its denied stamps kept for when it comes back on. */
export function withStampUseOn(rules: StampRules, use: StampUse, on: boolean): StampRules {
  return { ...rules, [use]: { ...rules[use], off: !on } };
}

/** The rules with some stamps allowed or denied for a use, the others left as they were. */
export function withStampsAllowed(
  rules: StampRules,
  use: StampUse,
  stampIds: readonly string[],
  allowed: boolean
): StampRules {
  const rest = rules[use].denied.filter((id) => !stampIds.includes(id));
  return { ...rules, [use]: { ...rules[use], denied: allowed ? rest : uniqueIds([...rest, ...stampIds]) } };
}

function parseStampRules(text: string): StampRules {
  if (text.length < 1) return OPEN_STAMP_RULES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return OPEN_STAMP_RULES;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return OPEN_STAMP_RULES;
  const held = parsed as Record<string, unknown>;
  return { line: parseUseRules(held['line']), reaction: parseUseRules(held['reaction']) };
}

function parseUseRules(held: unknown): StampUseRules {
  if (typeof held !== 'object' || held === null) return OPEN_STAMP_RULES.line;
  const entry = held as { off?: unknown; deny?: unknown };
  const denied = Array.isArray(entry.deny)
    ? uniqueIds(entry.deny.filter((id): id is string => typeof id === 'string'))
    : [];
  return { off: entry.off === true, denied };
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))];
}

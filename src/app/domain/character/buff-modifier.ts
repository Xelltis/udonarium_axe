import { toHalfWidth } from '@axe/core/util/string-util';
import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';
import { evalCalcFormula } from '@axe/domain/data/data-element-calc';
import {
  asResourceSlot,
  readNamedResourceSlot,
  type ResourceSlot,
  resourceSlotBadgePrefix,
} from '@axe/domain/data/resource-slot';

export type BuffModifierOperator = 'add' | 'set';

export interface BuffModifier {
  /** The status the buff moves, by the name it has on the sheet. */
  target: string;
  slot: ResourceSlot;
  operator: BuffModifierOperator;
  /** How far it moved the status, so taking the buff away can move it back. */
  applied: number;
  /** How far it moves the status again each time it is counted down; none where it does not. */
  step?: number;
}

const OPERATOR_TOKENS: Record<string, { operator: BuffModifierOperator; sign: number; repeats?: boolean }> = {
  '++': { operator: 'add', sign: 1, repeats: true },
  '＋＋': { operator: 'add', sign: 1, repeats: true },
  '--': { operator: 'add', sign: -1, repeats: true },
  '−−': { operator: 'add', sign: -1, repeats: true },
  '－－': { operator: 'add', sign: -1, repeats: true },
  '+': { operator: 'add', sign: 1 },
  '＋': { operator: 'add', sign: 1 },
  加算: { operator: 'add', sign: 1 },
  '-': { operator: 'add', sign: -1 },
  '−': { operator: 'add', sign: -1 },
  '－': { operator: 'add', sign: -1 },
  減算: { operator: 'add', sign: -1 },
  '=': { operator: 'set', sign: 1 },
  '＝': { operator: 'set', sign: 1 },
  固定: { operator: 'set', sign: 1 },
};

export interface ParsedBuffModifierRequest {
  target: string;
  slot: ResourceSlot;
  operator: BuffModifierOperator;
  /** What was asked for: an amount to move by, or the value to hold the status at. */
  amount: number;
  /** How far to move it again each time the buff is counted down; none where it is not to be. */
  step?: number;
}

/** Whether a word is one of the operators a `&!` command is written with. */
export function isBuffModifierOperator(word: string): boolean {
  return OPERATOR_TOKENS[(word ?? '').trim()] !== undefined;
}

/**
 * The amount a buff moves a status by, from the words it was written in.
 *
 * A number is read as it always was. Anything else is worked out as a sum: `+ - * /`, `×` and `÷`,
 * parentheses, and floor, ceil, round, abs, min and max, full-width characters included. A
 * division is rounded down where it falls, as the dice bot rounds `:HP-(10+2)/2`, except inside
 * floor, ceil and round, which do their own rounding. NaN when the words are not a sum or divide by
 * nothing.
 */
export function readBuffAmount(words: string): number {
  const written = toHalfWidth(words ?? '')
    .trim()
    .replace(/[−‐]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/');
  const plain = Number(written);
  if (Number.isFinite(plain)) return plain;
  const worked = evalCalcFormula(written.replace(/^\+/, ''), () => NaN, { division: 'floor' });
  return Number.isFinite(worked) ? worked : NaN;
}

/**
 * Reads the status, the operator and the amount out of a `&!` command.
 *
 * The amount may carry how far the status moves again each time the buff is counted down, after a
 * `~`: `5~-1` moves it 5 and then back 1 at every count. `++` and `--` move it the amount at every
 * count as well as at first, so a buff builds up turn by turn. Holding a status at a value never
 * moves it again.
 */
export function parseBuffModifierRequest(
  target: string,
  operator: string,
  amount: string
): ParsedBuffModifierRequest | null {
  const name = (target ?? '').trim();
  if (name.length < 1) return null;

  const resolved = OPERATOR_TOKENS[(operator ?? '').trim()];
  if (!resolved) return null;

  const [amountText, stepText] = (amount ?? '').split(/[~～〜]/, 2);
  const value = readBuffAmount(amountText);
  if (!Number.isFinite(value)) return null;
  const moved = resolved.operator === 'add' ? value * resolved.sign : value;
  const step = resolved.repeats ? moved : stepText === undefined ? 0 : readBuffAmount(stepText);
  if (!Number.isFinite(step)) return null;

  const named = readNamedResourceSlot(name);
  return {
    target: named.name,
    slot: named.slot,
    operator: resolved.operator,
    amount: moved,
    ...(resolved.operator === 'add' && step !== 0 ? { step } : {}),
  };
}

/**
 * Reads the statuses a `&!` buff moves where they are written together in its second field, each
 * with its operator and amount, parted by commas: `追D+4,回避-2`, `器用度+5~-1,HP^-20`. A comma
 * inside brackets belongs to the amount, as in `max(1,{Lv})`. Null where any of them cannot be
 * read, or none is written.
 */
export function parseBuffModifierItems(text: string): ParsedBuffModifierRequest[] | null {
  const items = splitOutsideBrackets(text ?? '')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length < 1) return null;
  const requests: ParsedBuffModifierRequest[] = [];
  for (const item of items) {
    const parts = /^(.+?)(＋＋|−−|－－|\+\+|--|[+\-=＋−－＝])(.*)$/.exec(item);
    const request = parts ? parseBuffModifierRequest(parts[1], parts[2], parts[3]) : null;
    if (!request) return null;
    requests.push(request);
  }
  return requests;
}

/**
 * Whether a buff holds at a value the very status a request moves, the same side of it included.
 * A helping stacked on such a buff leaves the status held, as holding it there twice is still
 * holding it there.
 */
export function holdsRequestedStatus(
  modifier: BuffModifier | null,
  request: Pick<ParsedBuffModifierRequest, 'target' | 'slot'>
): boolean {
  return modifier?.operator === 'set' && modifier.target === request.target && modifier.slot === request.slot;
}

/**
 * Whether a note piled on a buff speaks of nothing but the status the buff holds at a value, as
 * `HP+2` does on a buff holding HP. Such a note would only hide the value the status is held at.
 */
export function speaksOnlyOfHeldStatus(modifier: BuffModifier | null, note: string): boolean {
  if (modifier?.operator !== 'set') return false;
  const items = parseBuffModifierItems(note);
  return items !== null && items.every((item) => holdsRequestedStatus(modifier, item));
}

/** Parts the text at its commas of either width, leaving those inside brackets in place. */
function splitOutsideBrackets(text: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '(' || character === '（') depth++;
    else if ((character === ')' || character === '）') && depth > 0) depth--;
    else if (depth === 0 && (character === ',' || character === '，' || character === '、')) {
      items.push(text.slice(start, index));
      start = index + 1;
    }
  }
  items.push(text.slice(start));
  return items;
}

/** The status a request moves, as a badge names it: `最大HP` for the far side of HP. */
export function describeBuffModifierTarget(request: Pick<ParsedBuffModifierRequest, 'target' | 'slot'>): string {
  return `${resourceSlotBadgePrefix(request.slot)}${request.target}`;
}

/** How the buff reads on the badge and in the chat line that granted it. */
export function describeBuffModifier(request: ParsedBuffModifierRequest): string {
  const slot = resourceSlotBadgePrefix(request.slot);
  if (request.operator === 'set') return `${slot}${request.target}=${request.amount}`;
  return `${slot}${request.target}${signed(request.amount)}${describeStep(request.step)}`;
}

/** How a buff that moves its status at every count reads once it has: by how far it stands moved now. */
export function describeStandingModifier(modifier: BuffModifier): string {
  return `${resourceSlotBadgePrefix(modifier.slot)}${modifier.target}${signed(modifier.applied)}${describeStep(modifier.step)}`;
}

function describeStep(step: number | undefined): string {
  return step ? `~${signed(step)}` : '';
}

function signed(amount: number): string {
  return `${amount >= 0 ? '+' : ''}${amount}`;
}

/**
 * What a buff has moved on the sheet, as `writeBuffModifier` recorded it. Null for a plain buff
 * that moves nothing, or one whose record cannot be read.
 */
export function readBuffModifier(element: DataElement): BuffModifier | null {
  const target = (element.getAttribute(DataElementAttribute.BUFF_MOD_TARGET) ?? '').trim();
  if (target.length < 1) return null;

  const applied = Number(element.getAttribute(DataElementAttribute.BUFF_MOD_APPLIED) ?? '');
  if (!Number.isFinite(applied)) return null;

  const operator = element.getAttribute(DataElementAttribute.BUFF_MOD_OPERATOR) === 'set' ? 'set' : 'add';
  // Nothing written, as by a version before a buff could move at every count, moves nothing more.
  const stepText = (element.getAttribute(DataElementAttribute.BUFF_MOD_STEP) ?? '').trim();
  const step = stepText.length > 0 ? Number(stepText) : 0;
  return {
    target,
    // A slot this version does not know of is read as the value, which is what a buff written
    // by an older one means by writing nothing.
    slot: asResourceSlot(element.getAttribute(DataElementAttribute.BUFF_MOD_SLOT)) ?? 'now',
    operator,
    applied,
    ...(operator === 'add' && Number.isFinite(step) && step !== 0 ? { step } : {}),
  };
}

/**
 * Records on the buff what it moved on the sheet, so taking it away can move the status back by the
 * same amount.
 */
export function writeBuffModifier(element: DataElement, modifier: BuffModifier): void {
  element.setAttribute(DataElementAttribute.BUFF_MOD_TARGET, modifier.target);
  element.setAttribute(DataElementAttribute.BUFF_MOD_SLOT, modifier.slot);
  element.setAttribute(DataElementAttribute.BUFF_MOD_OPERATOR, modifier.operator);
  element.setAttribute(DataElementAttribute.BUFF_MOD_APPLIED, String(modifier.applied));
  if (modifier.step) element.setAttribute(DataElementAttribute.BUFF_MOD_STEP, String(modifier.step));
  else element.removeAttribute(DataElementAttribute.BUFF_MOD_STEP);
}

/**
 * Wipes the record of what a buff moved, leaving it a plain note. The sheet itself is not touched.
 */
export function clearBuffModifier(element: DataElement): void {
  element.removeAttribute(DataElementAttribute.BUFF_MOD_TARGET);
  element.removeAttribute(DataElementAttribute.BUFF_MOD_SLOT);
  element.removeAttribute(DataElementAttribute.BUFF_MOD_OPERATOR);
  element.removeAttribute(DataElementAttribute.BUFF_MOD_APPLIED);
  element.removeAttribute(DataElementAttribute.BUFF_MOD_STEP);
}

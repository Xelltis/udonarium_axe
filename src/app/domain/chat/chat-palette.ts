import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { toHalfWidth } from '@axe/core/util/string-util';
import { parseBuffStrength } from '@axe/domain/character/buff-badge';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CHARACTER_REFERENCE, readReferenceName } from '@axe/domain/chat/chat-reference';
import { withInlineStampsAsSpaces } from '@axe/domain/chat/inline-stamp';
import { isPaletteTabLine } from '@axe/domain/chat/palette-rows';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';
import { resourceCommandSites } from '@axe/domain/data/resource-command-words';
import { looksLikeRollWord, rollableText, rollWordSite } from '@axe/domain/dice/dice-roll-line';

export interface PaletteLine {
  palette: string;
}

export interface PaletteIndex {
  name: string;
  line: number;
}

export interface PaletteVariable {
  name: string;
  value: string;
}

export interface PaletteEvaluationResult {
  text: string;
  attachmentImageIdentifiers: string[];
}

@SyncObject('chat-palette')
export class ChatPalette extends ObjectNode {
  @SyncVar() dicebot: string = 'DiceBot';

  /**
   * The palette's lines other than its variable definitions, parsed from its text on first use and
   * again after it changes.
   */
  get paletteLines(): PaletteLine[] {
    if (!this.isAnalized) this.parse(this.value as string);
    return this._paletteLines;
  }

  /**
   * The `//name=value` variables the palette defines, with their names made half-width. Parsed on
   * first use and again after a change.
   */
  get paletteVariables(): PaletteVariable[] {
    if (!this.isAnalized) this.parse(this.value as string);
    return this._paletteVariables;
  }

  /**
   * Reads a palette line as a heading, `//---name---` or `◆name`, giving its name and line number,
   * or null when it is not one.
   */
  isPaletteIndex(line: string, no: number): PaletteIndex | null {
    const index: PaletteIndex = {
      name: '',
      line: 0,
    };

    if (isPaletteTabLine(line)) return null;

    // takes the heading out of the form the piece-building sites write
    const matchRes1 = line.match(/^\/\/--[-]+(.*)$/);
    const matchRes2 = line.match(/^◆(.*)$/);
    if (matchRes1) {
      index.name = matchRes1[1].replace(/-+$/, '');
      index.line = no;
      return index;
    }

    if (matchRes2) {
      index.name = matchRes2[1];
      index.line = no;
      return index;
    }

    return null;
  }

  /** Every heading in the palette with its line number, for jumping to a part of a long palette. */
  get paletteIndex(): PaletteIndex[] {
    let count = 0;
    let ret;
    const indexList: PaletteIndex[] = [];
    const palettString = this.value as string;
    const palettes = palettString.split('\n');

    for (const line of palettes) {
      ret = this.isPaletteIndex(line, count);
      if (ret) {
        indexList.push(ret);
      }
      count++;
    }
    return indexList;
  }

  /** Every palette line containing the text, variable definitions included, in order. */
  paletteMatch(text: string): string[] {
    const matchList: string[] = [];

    const palettString = this.value as string;
    const palettes = palettString.split('\n');

    for (const line of palettes) {
      if (line.includes(text)) {
        matchList.push(line);
      }
    }
    return matchList;
  }

  /**
   * The line number of the `nth` palette line containing the text, counting from 0, or -1 when
   * there are not that many.
   */
  paletteMatchLine(text: string, nth: number): number {
    let matchCount = 0;
    let lineNo = 0;
    const palettString = this.value as string;
    const palettes = palettString.split('\n');

    for (const line of palettes) {
      if (line.includes(text)) {
        if (matchCount === nth) {
          return lineNo;
        }
        matchCount++;
      }
      lineNo++;
    }
    return -1;
  }

  private _palettes: string[] = [];
  private _paletteLines: PaletteLine[] = [];
  private _paletteVariables: PaletteVariable[] = [];
  private isAnalized: boolean = false;

  /** Every line of the palette text as written, variable definitions included. */
  getPalette(): string[] {
    if (!this.isAnalized) this.parse(this.value as string);
    return this._palettes;
  }

  /**
   * Replaces the palette text. Its lines and variables are parsed again the next time they are
   * read.
   */
  setPalette(paletteSource: string) {
    this.value = paletteSource;
    this.isAnalized = false;
  }

  /** Whether a line is aimed at the targeted pieces; see `textTargetsCharacter`. */
  checkTargetCharacter(text: string): boolean {
    return textTargetsCharacter(text);
  }

  /**
   * Fills in the references in a palette line and returns the text.
   *
   * References are answered from this palette's variables and the sheet in `extendVariables`, or
   * from the target's for a `t{name}` reference. One nothing answers is emptied out.
   */
  evaluate(line: PaletteLine | string, extendVariables?: DataElement, target?: GameCharacter): string {
    return this.evaluateInternal(line, extendVariables, target, false).text;
  }

  /**
   * Fills in a palette line as `evaluate` does, but takes references to image fields out of the
   * text and returns those pictures as attachments to send with it.
   */
  evaluateWithAttachments(
    line: PaletteLine | string,
    extendVariables?: DataElement,
    target?: GameCharacter
  ): PaletteEvaluationResult {
    return this.evaluateInternal(line, extendVariables, target, true);
  }

  private evaluateInternal(
    line: PaletteLine | string,
    extendVariables: DataElement | undefined,
    target: GameCharacter | undefined,
    collectImageAttachments: boolean
  ): PaletteEvaluationResult {
    return evaluateReferences(
      typeof line === 'string' ? line : line.palette,
      this.paletteVariables,
      extendVariables,
      target,
      collectImageAttachments
    );
  }

  private parse(paletteSource: string) {
    this._palettes = paletteSource.split('\n');

    this._paletteLines = [];
    this._paletteVariables = [];

    for (const palette of this._palettes) {
      const variable = this.parseVariable(palette);
      if (variable) {
        this._paletteVariables.push(variable);
        continue;
      }
      const line: PaletteLine = { palette: palette };
      this._paletteLines.push(line);
    }
    this.isAnalized = true;
  }

  private parseVariable(palette: string): PaletteVariable | null {
    const site = paletteVariableSite(palette);
    return site ? { name: site.name, value: site.value } : null;
  }

  /** Takes a synced update and marks the palette to be parsed again. */
  override apply(context: ObjectContext) {
    super.apply(context);
    this.isAnalized = false;
  }
}

@SyncObject('buff-palette')
export class BuffPalette extends ChatPalette {}

@SyncObject('dice-table-palette')
export class DiceTablePalette extends ChatPalette {}

/**
 * The palettes another fork keeps beside a character's own, a tab apiece, each named by its first
 * line. Read only so that a room saved there can be loaded: the character folds them into its own
 * palette as tabs, and none is kept.
 */
@SyncObject('sub-palette')
export class SubPalette extends ObjectNode {}

/** A `//name=value` line of a palette, read as the variable it sets, and where its name and value stand. */
export interface PaletteVariableSite extends PaletteVariable {
  nameFrom: number;
  nameTo: number;
  valueFrom: number;
}

/** Reads a palette line as a `//name=value` variable, or answers null when it is not one. */
export function paletteVariableSite(line: string): PaletteVariableSite | null {
  const matched = /^(\s*[/／]{2})([^=＝{}｛｝\s]+)(\s*[=＝]\s*)(.+)\s*/.exec(line);
  if (!matched) return null;
  const nameFrom = matched[1].length;
  const nameTo = nameFrom + matched[2].length;
  return { name: toHalfWidth(matched[2]), value: matched[4], nameFrom, nameTo, valueFrom: nameTo + matched[3].length };
}

/**
 * Fills in the references in a line of text.
 *
 * `{name}` reads from the speaker, `t{name}` from the target it is aimed at, and a reference
 * standing for an image is taken out of the line and sent alongside it instead.
 */
export function evaluateReferences(
  source: string,
  paletteVariables: readonly PaletteVariable[],
  extendVariables: DataElement | undefined,
  target: GameCharacter | undefined,
  collectImageAttachments: boolean,
  /**
   * What to do with a reference nothing answers. A palette line is written to be filled in, so an
   * empty one is emptied out; a line typed into chat is not, and its braces are left as they were
   * rather than eating the words around them, except where one is added to a roll as a term of its
   * own (see {@link dropsUnanswered}).
   */
  keepUnfilled = false
): PaletteEvaluationResult {
  let evaluate = source;
  const attachmentImageIdentifiers: string[] = [];

  // One line can name the same sheet several times over, so it is read once for all of them.
  const calcPass = createCalcPass();

  const evaluateElementText = (element: DataElement, useMax: boolean, formula: FormulaPlace): string | null => {
    if (collectImageAttachments && element.fieldType === DataElementFieldType.IMAGE) {
      const imageIdentifier = String(element.value ?? '').trim();
      if (imageIdentifier.length > 0 && !attachmentImageIdentifiers.includes(imageIdentifier)) {
        attachmentImageIdentifiers.push(imageIdentifier);
      }
      return '';
    }

    // A calculating field keeps its formula rather than its result, so the result is worked out
    // here. One that cannot be worked out has no value to lend: '?' would only break the command.
    if (element.fieldType === DataElementFieldType.CALC) {
      const result = evaluateCalcElement(element, calcPass);
      return result.length > 0 && result !== '?' ? result : null;
    }

    if (useMax && element.isNumberResource) {
      return `${element.value}`;
    }
    if (formula !== 'none' && isWornBuff(element)) {
      return strengthAsTerm(parseBuffStrength(`${element.currentValue ?? ''}`), formula);
    }
    return element.isNumberResource ? `${element.currentValue}` : `${element.value}`;
  };

  const fillReference = (match: string, name: string, useMax: boolean, formula: FormulaPlace): string | null => {
    if (match.match(/^[tTｔＴ].*/)) {
      for (const variable of target?.chatPalette?.paletteVariables ?? []) {
        if (variable.name == name) return variable.value.replace(/[{｛]/g, 't{');
      }
      const element = target?.rootDataElement ? DataElement.findElementByReference(target.rootDataElement, name) : null;
      if (!element) return null;
      const targetElementText = evaluateElementText(element, useMax, formula);
      if (targetElementText == null) return null;
      return targetElementText.match(/[{｛]\s*([^{}｛｝]+)\s*[}｝]/g)
        ? targetElementText.replace(/[{｛]/g, 't{')
        : targetElementText;
    }

    for (const variable of paletteVariables) {
      if (variable.name == name) return variable.value;
    }
    const element = extendVariables ? DataElement.findElementByReference(extendVariables, name) : null;
    return element ? evaluateElementText(element, useMax, formula) : null;
  };

  const limit = 128;
  let loop = 0;
  let isContinue = true;
  while (isContinue) {
    loop++;
    isContinue = false;
    const line = withInlineStampsAsSpaces(evaluate);
    evaluate = evaluate.replace(CHARACTER_REFERENCE, (match, raw: string, offset: number) => {
      const { name, useMax } = readReferenceName(raw);
      const filled = fillReference(match, name, useMax, formulaPlace(line, offset));
      if (filled == null) return keepUnfilled && !dropsUnanswered(line, offset) ? match : '';
      // Only a reference that was answered can bring more of them in, so only that keeps the pass going.
      isContinue = true;
      return filled;
    });
    if (limit < loop) isContinue = false;
  }
  return { text: evaluate, attachmentImageIdentifiers };
}

/**
 * Whether a reference nobody answers is emptied out of a line typed into chat rather than left as it
 * was: one added to the roll the line starts with as a term of its own, right after a number or a
 * closing bracket, like `2d+10{加護}` where 加護 carries its own sign. Left out, it adds nothing, as
 * the buff it names is not there. One an operator waits on (`2d6+{攻撃力}`), one a letter runs into
 * (`2D{面数}`, which would read as another roll), and one in words (`やった{歓喜}`) are left, for the
 * reader to see what went unanswered.
 */
function dropsUnanswered(line: string, offset: number): boolean {
  if (!inRollWord(line, offset) || !/[0-9)\]}｝）］]/.test(line[offset - 1] ?? '')) return false;
  return leadsWithRoll(line);
}

/** Whether a point of a line stands in the word it rolls. */
function inRollWord(line: string, offset: number): boolean {
  const site = rollWordSite(line);
  return offset >= site.from && offset < site.to;
}

/** Whether a line starts with a roll, read from the word it rolls with the references in it taken out. */
function leadsWithRoll(line: string): boolean {
  const site = rollWordSite(line);
  return looksLikeRollWord(rollableText(line.slice(site.from, site.to)).replace(/[tTｔＴ]?[{｛][^{}｛｝]*[}｝]/g, ''));
}

/**
 * Where a reference stands in a number that is worked out: in the roll the line starts with or in
 * the amount of a resource command (`:HP-{攻撃力}`, `t:HP-{攻撃力}`), after an operator, joined
 * straight onto a number before it, as `2d+10{加護}` is, or within a number of its own after a
 * letter or a mark, as `2d{加護}` and `K20@{加護}` are; or in no such number at all. A buff named in
 * one lends the number its note carries, as its badge shows it, rather than the words of the note.
 */
type FormulaPlace = 'operand' | 'joined' | 'within' | 'none';

function formulaPlace(line: string, offset: number): FormulaPlace {
  const inRoll = inRollWord(line, offset) && leadsWithRoll(line);
  if (!inRoll && !RESOURCE_COMMAND_WORD.test(line.slice(wordStart(line, offset), offset))) return 'none';
  const before = line.slice(0, offset);
  if (/[-+=＋－＝*/×÷(（]$/.test(before)) return 'operand';
  return /[0-9０-９)）\]］}｝]$/.test(before) ? 'joined' : 'within';
}

/**
 * A buff's strength as a term of the number it stands in: after an operator without a sign of its
 * own, a negative one in brackets, and nought for a note that carries no number, so the operator
 * is not left waiting; joined on, with its sign, which is what joins it, a plus for one written
 * without, or nothing; within a number of its own, as it is.
 */
function strengthAsTerm(strength: string, place: FormulaPlace): string {
  if (place === 'joined') return strength && !/^[-+]/.test(strength) ? `+${strength}` : strength;
  if (place !== 'operand') return strength;
  if (strength.length < 1) return '0';
  if (strength.startsWith('+')) return strength.slice(1);
  return strength.startsWith('-') ? `(${strength})` : strength;
}

/** A word that is a resource command, read up to a point in it: the mark, a name and an operator before it. */
const RESOURCE_COMMAND_WORD = /^[sSｓＳ]?[tTｔＴ]?[:：][^\s]*?[-+=＋－＝*/×÷]/;
function wordStart(line: string, offset: number): number {
  let depth = 0;
  let start = 0;
  for (let index = 0; index < offset; index++) {
    const character = line[index];
    if (character === '{' || character === '｛') depth++;
    else if ((character === '}' || character === '｝') && depth > 0) depth--;
    else if (depth === 0 && /\s/.test(character)) start = index + 1;
  }
  return start;
}

/** Whether an element is a buff a character wears, kept under the character's buffs rather than on its sheet. */
function isWornBuff(element: DataElement): boolean {
  if (!element.isNumberResource || element.children.length > 0) return false;
  for (let node = element.parent; node instanceof DataElement; node = node.parent) {
    if (node.name === 'buff' && node.parent instanceof DataElement && node.parent.name === 'character') return true;
  }
  return false;
}

/** The references a piece can fill in, whether or not it keeps a palette of its own to draw variables from. */
export function evaluateCharacterReferences(
  text: string,
  speaker: GameCharacter | null,
  target?: GameCharacter
): PaletteEvaluationResult {
  return evaluateReferences(
    text,
    speaker?.chatPalette?.paletteVariables ?? [],
    speaker?.rootDataElement ?? undefined,
    target,
    true,
    true
  );
}

/**
 * Whether the line is aimed at the pieces marked on the table: it names a status of theirs with a
 * `t{}` reference, or holds a command aimed at them, read as the commands are carried out, a
 * secret one and one a stamp put right before it starts among them.
 */
export function textTargetsCharacter(line: string): boolean {
  if (/[tTｔＴ][{｛]\s*([^{}｛｝]+)\s*[}｝]/.test(withInlineStampsAsSpaces(line))) return true;
  const words = resourceCommandSites(line);
  return [...words.resources, ...words.buffs].some((site) => site.command.startsWith('t'));
}

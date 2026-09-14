import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { toHalfWidth } from '@axe/core/util/string-util';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementFieldType } from '@axe/domain/data/data-element';
import { createCalcPass, evaluateCalcElement } from '@axe/domain/data/data-element-calc-env';

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
    const array = /^\s*[/／]{2}([^=＝{}｛｝\s]+)\s*[=＝]\s*(.+)\s*/gi.exec(palette);
    if (!array) return null;
    const variable: PaletteVariable = {
      name: toHalfWidth(array[1]),
      value: array[2],
    };
    return variable;
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
   * rather than eating the words around them.
   */
  keepUnfilled = false
): PaletteEvaluationResult {
  let evaluate = source;
  const attachmentImageIdentifiers: string[] = [];

  // One line can name the same sheet several times over, so it is read once for all of them.
  const calcPass = createCalcPass();

  const evaluateElementText = (element: DataElement, useMax: boolean): string | null => {
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
    return element.isNumberResource ? `${element.currentValue}` : `${element.value}`;
  };

  const fillReference = (match: string, name: string, useMax: boolean): string | null => {
    if (match.match(/^[tTｔＴ].*/)) {
      for (const variable of target?.chatPalette?.paletteVariables ?? []) {
        if (variable.name == name) return variable.value.replace(/[{｛]/g, 't{');
      }
      const element = target?.rootDataElement ? DataElement.findElementByReference(target.rootDataElement, name) : null;
      if (!element) return null;
      const targetElementText = evaluateElementText(element, useMax);
      if (targetElementText == null) return null;
      return targetElementText.match(/[{｛]\s*([^{}｛｝]+)\s*[}｝]/g)
        ? targetElementText.replace(/[{｛]/g, 't{')
        : targetElementText;
    }

    for (const variable of paletteVariables) {
      if (variable.name == name) return variable.value;
    }
    const element = extendVariables ? DataElement.findElementByReference(extendVariables, name) : null;
    return element ? evaluateElementText(element, useMax) : null;
  };

  const limit = 128;
  let loop = 0;
  let isContinue = true;
  while (isContinue) {
    loop++;
    isContinue = false;
    evaluate = evaluate.replace(/[tTｔＴ]?[{｛]\s*([^{}｛｝]+)\s*[}｝]/g, (match, name) => {
      name = toHalfWidth(name);
      let useMax = false;
      const namematch = name.match(/(.+)([\^＾]$)/);
      if (namematch) {
        name = namematch[1];
        useMax = true;
      }
      const filled = fillReference(match, name, useMax);
      if (filled == null) return keepUnfilled ? match : '';
      // Only a reference that was answered can bring more of them in, so only that keeps the pass going.
      isContinue = true;
      return filled;
    });
    if (limit < loop) isContinue = false;
  }
  return { text: evaluate, attachmentImageIdentifiers };
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

/** Whether the line is aimed at the pieces marked on the table. */
export function textTargetsCharacter(text: string): boolean {
  let istarget = !!text.match(/[tTｔＴ][{｛]\s*([^{}｛｝]+)\s*[}｝]/g);

  if (text.match(/^[sSｓＳ]?[tTｔＴ][:：]([^:：]+)/g)) istarget = true;
  if (text.match(/\s[sSｓＳ]?[tTｔＴ][:：]([^:：]+)/g)) istarget = true;
  if (text.match(/^[tTｔＴ][&＆]([^&＆]+)/g)) istarget = true;
  if (text.match(/\s[tTｔＴ][&＆]([^&＆]+)/g)) istarget = true;
  return istarget;
}

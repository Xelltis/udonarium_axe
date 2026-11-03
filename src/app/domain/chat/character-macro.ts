import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import {
  evaluateCharacterReferences,
  PaletteEvaluationResult,
  textTargetsCharacter,
  withoutAimMarks,
} from '@axe/domain/chat/chat-palette';
import { DiceBot } from '@axe/domain/dice/dice-bot';

export interface MacroMessage {
  text: string;
  targetContexts: ChatMessageTargetContext[];
  attachmentImageIdentifiers: string[];
}

/**
 * How a line is aimed, read with the speaker's own references in it filled in and every other one
 * left as typed: a `{name}` of the speaker's can stand for words aimed at the targets, as `{項目C}`
 * does for a field reading `{項目A}+t{項目B}`.
 */
export interface AimedLine {
  /** Whether it goes to the pieces marked on the table. */
  targeted: boolean;
  /**
   * The line filled in from the speaker, for each target to fill in the rest of, so that every one
   * of them reads it alike.
   */
  filled: string;
  /**
   * The filled line for every target after the first, with the commands acting on the speaker
   * taken out, those a reference brought in among them, or the speaker would be acted on once per
   * target.
   */
  repeated: string;
  /** The pictures the speaker's references stand for, taken out of the filled line to go alongside it. */
  attachmentImageIdentifiers: string[];
}

/** Reads how a line is aimed; see {@link AimedLine}. */
export function aimLine(line: string, speaker: GameCharacter | null): AimedLine {
  const filled = /[{｛]/.test(line)
    ? evaluateCharacterReferences(line, speaker, undefined, 'always')
    : { text: line, attachmentImageIdentifiers: [] };
  const targeted = textTargetsCharacter(line) || textTargetsCharacter(filled.text);
  const said = targeted ? withoutAimMarks(filled.text) : filled.text;
  return {
    targeted,
    filled: said,
    repeated: targeted ? DiceBot.deleteMyselfResourceBuff(said) : said,
    attachmentImageIdentifiers: filled.attachmentImageIdentifiers,
  };
}

/**
 * What one macro line becomes once the references in it are filled in.
 *
 * A line aimed at the pieces marked on the table, as typed or through a reference of the
 * speaker's (see {@link aimLine}), is filled in from the speaker and then worked out once for each
 * of them, and from the second onwards the commands that would act on the speaker are taken out,
 * or the speaker would take the same damage once per target.
 */
export function buildMacroMessage(
  character: GameCharacter,
  line: string,
  targets: readonly GameCharacter[],
  noTargetText: string
): MacroMessage {
  const palette = character.chatPalette;
  const attachmentImageIdentifiers: string[] = [];
  const targetContexts: ChatMessageTargetContext[] = [];

  const collect = (identifiers: readonly string[]) => {
    for (const identifier of identifiers) {
      if (!attachmentImageIdentifiers.includes(identifier)) attachmentImageIdentifiers.push(identifier);
    }
  };
  const evaluate = (text: string, target?: GameCharacter): PaletteEvaluationResult =>
    palette
      ? palette.evaluateWithAttachments(text, character.rootDataElement ?? undefined, target)
      : evaluateCharacterReferences(text, character, target);

  const aimed = aimLine(line, character);
  if (!aimed.targeted) {
    const evaluated = evaluate(line);
    collect(evaluated.attachmentImageIdentifiers);
    targetContexts.push({ text: evaluated.text, object: null });
    return { text: evaluated.text, targetContexts, attachmentImageIdentifiers };
  }

  if (targets.length < 1) return { text: noTargetText, targetContexts, attachmentImageIdentifiers };

  collect(aimed.attachmentImageIdentifiers);
  let text = '';
  let first = true;
  for (const target of targets) {
    const source = first ? aimed.filled : aimed.repeated;
    const evaluated = evaluate(source, target);
    collect(evaluated.attachmentImageIdentifiers);
    text += first ? '' : '\n';
    text += evaluated.text + ' [' + target.name + ']';
    targetContexts.push({ text: evaluated.text, object: target });
    first = false;
  }
  return { text, targetContexts, attachmentImageIdentifiers };
}

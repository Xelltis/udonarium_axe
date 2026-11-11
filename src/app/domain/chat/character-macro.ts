import { aimedAtBonusesOf } from '@axe/domain/character/aimed-at-buff';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessageTargetContext } from '@axe/domain/chat/chat-message';
import {
  aimsAtOnce,
  evaluateCharacterReferences,
  PaletteEvaluationResult,
  textTargetsCharacter,
  withoutAimMarks,
} from '@axe/domain/chat/chat-palette';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { TOGETHER_SEPARATOR } from '@axe/domain/dice/roll-target-suffix';

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
  /** Whether it goes to them all at once, rolled once for them all, as `t:範囲` sends it. */
  atOnce: boolean;
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

/**
 * Reads how a line is aimed; see {@link AimedLine}. The speaker's references named in
 * `leftForTargets` are left for each target to fill in, with what its buffs give whoever aims at it
 * (see {@link aimedAtNamesOf}).
 */
export function aimLine(
  line: string,
  speaker: GameCharacter | null,
  leftForTargets: ReadonlySet<string> = new Set()
): AimedLine {
  const holdsReference = /[{｛]/.test(line);
  const whole = holdsReference
    ? evaluateCharacterReferences(line, speaker, undefined, 'always')
    : { text: line, attachmentImageIdentifiers: [] };
  const filled =
    holdsReference && leftForTargets.size > 0
      ? evaluateCharacterReferences(line, speaker, undefined, 'always', leftForTargets)
      : whole;
  const targeted = textTargetsCharacter(line) || textTargetsCharacter(whole.text);
  const said = targeted ? withoutAimMarks(filled.text) : filled.text;
  return {
    targeted,
    atOnce: targeted && (aimsAtOnce(line) || aimsAtOnce(filled.text)),
    filled: said,
    repeated: targeted ? DiceBot.deleteMyselfResourceBuff(said) : said,
    attachmentImageIdentifiers: filled.attachmentImageIdentifiers,
  };
}

/**
 * The names of the speaker's references that the buffs of any of the pieces marked give whoever aims
 * at them something for, `相手の物理特攻+2` naming 物理特攻: left for each of them to fill in.
 */
export function aimedAtNamesOf(targets: readonly GameCharacter[]): Set<string> {
  const names = new Set<string>();
  for (const target of targets) {
    for (const name of aimedAtBonusesOf(target.buffs.list()).keys()) names.add(name);
  }
  return names;
}

/**
 * What a line aimed at the pieces marked says, and what goes to each of them: the line filled in
 * once for each, its name after it, and from the second onwards with the commands acting on the
 * speaker taken out, or the speaker would be acted on once per target. A line aimed at them all at
 * once is said once, filled in against the first of them, with all their names after it, and goes
 * to each of them as the one line, to be rolled once for them all.
 */
export function aimedAt(
  aimed: AimedLine,
  targets: readonly GameCharacter[],
  fill: (text: string, target: GameCharacter) => string
): { text: string; contexts: ChatMessageTargetContext[] } {
  if (aimed.atOnce && targets.length > 0) {
    const said = fill(aimed.filled, targets[0]);
    const together = targets.map((target) => target.name);
    const contexts = targets.map((target, index) => ({
      text: index === 0 ? said : fill(aimed.repeated, target),
      object: target,
      together,
    }));
    return { text: `${said} [${together.join(TOGETHER_SEPARATOR)}]`, contexts };
  }
  const lines: string[] = [];
  const contexts: ChatMessageTargetContext[] = [];
  targets.forEach((target, index) => {
    const filled = fill(index === 0 ? aimed.filled : aimed.repeated, target);
    lines.push(`${filled} [${target.name}]`);
    contexts.push({ text: filled, object: target });
  });
  return { text: lines.join('\n'), contexts };
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

  const aimed = aimLine(line, character, aimedAtNamesOf(targets));
  if (!aimed.targeted) {
    const evaluated = evaluate(line);
    collect(evaluated.attachmentImageIdentifiers);
    targetContexts.push({ text: evaluated.text, object: null });
    return { text: evaluated.text, targetContexts, attachmentImageIdentifiers };
  }

  if (targets.length < 1) return { text: noTargetText, targetContexts, attachmentImageIdentifiers };

  collect(aimed.attachmentImageIdentifiers);
  const sent = aimedAt(aimed, targets, (text, target) => {
    const evaluated = evaluate(text, target);
    collect(evaluated.attachmentImageIdentifiers);
    return evaluated.text;
  });
  return { text: sent.text, targetContexts: sent.contexts, attachmentImageIdentifiers };
}

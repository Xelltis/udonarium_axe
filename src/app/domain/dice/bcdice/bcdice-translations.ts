import { I18n } from 'bcdice/lib/internal';

/**
 * Hands BCDice the translations a chunk of game systems carries.
 *
 * A game system reads its messages while its class is being defined, and a chunk defines several
 * systems at once, so every one of their translations has to be in place before any of them is.
 * Each chunk's translations module calls this as it is evaluated, ahead of the systems.
 */
export function loadBCDiceTranslations(translations: Readonly<Record<string, unknown>>): void {
  for (const json of Object.values(translations)) I18n.$load_translation(JSON.stringify(json));
}

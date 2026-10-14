import {
  BCDICE_GAME_SYSTEM_IMPORTERS,
  BCDICE_I18N_IMPORTERS,
} from '@axe/domain/dice/bcdice/bcdice-importers.generated';
import Loader, { I18nJsonObject } from 'bcdice/lib/loader/loader';

/**
 * Loads game systems on demand, a few to a chunk.
 *
 * bcdice's own DynamicLoader builds the path of a module while it runs and hands it to require,
 * which no bundler can follow. The paths are written out ahead of time instead, in
 * bcdice-importers.generated.ts, so a room pays only for the chunks of the systems it rolls with.
 * Each chunk holds the systems of one language that sit near each other by name, with their
 * translations, so that a build stays under the thousand files a host's upload form may accept.
 */
export default class BCDiceLoader extends Loader {
  /**
   * The translation of one game system's messages into one language, fetched from the chunk that
   * carries it.
   *
   * A pair the table was not written out for throws, which the dice bot takes as the system being
   * out of reach and falls back on the plain one.
   */
  override async dynamicImportI18n(baseClassName: string, locale: string): Promise<I18nJsonObject> {
    const importer = BCDICE_I18N_IMPORTERS[`${baseClassName}.${locale}`];
    if (!importer) throw new Error(`BCDice has no translation ${baseClassName}.${locale}`);
    return (await importer()) as I18nJsonObject;
  }

  /**
   * Fetches the chunk that holds one game system, which registers it and its neighbours with
   * bcdice as it is evaluated.
   *
   * A name the table was not written out for throws, the same as a chunk that cannot be fetched.
   */
  override async dynamicImport(className: string): Promise<void> {
    const importer = BCDICE_GAME_SYSTEM_IMPORTERS[className];
    if (!importer) throw new Error(`BCDice has no game system ${className}`);
    await importer();
  }
}

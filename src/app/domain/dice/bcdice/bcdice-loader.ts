import {
  BCDICE_GAME_SYSTEM_IMPORTERS,
  BCDICE_I18N_IMPORTERS,
} from '@axe/domain/dice/bcdice/bcdice-importers.generated';
import Loader, { I18nJsonObject } from 'bcdice/lib/loader/loader';

/**
 * Loads one game system at a time, each from a chunk of its own.
 *
 * bcdice's own DynamicLoader builds the path of a module while it runs and hands it to require,
 * which no bundler can follow. The paths are written out ahead of time instead, in
 * bcdice-importers.generated.ts, so a room pays only for the systems it rolls with.
 */
export default class BCDiceLoader extends Loader {
  override async dynamicImportI18n(baseClassName: string, locale: string): Promise<I18nJsonObject> {
    const importer = BCDICE_I18N_IMPORTERS[`${baseClassName}.${locale}`];
    if (!importer) throw new Error(`BCDice has no translation ${baseClassName}.${locale}`);
    const module = (await importer()) as { default?: I18nJsonObject } & I18nJsonObject;
    return module.default ?? module;
  }

  override async dynamicImport(className: string): Promise<void> {
    const importer = BCDICE_GAME_SYSTEM_IMPORTERS[className];
    if (!importer) throw new Error(`BCDice has no game system ${className}`);
    await importer();
  }
}

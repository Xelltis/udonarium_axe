import { parseAppspotCharacter } from '@axe/domain/character/import/appspot-character-parser';
import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { buildBbtAppspotCharacter } from '@axe/domain/character/import/system-profiles/bbt-appspot-profile';
import { resolveAppspotDicebot } from '@axe/domain/character/import/system-profiles/dicebot-map';
import { buildDx3AppspotCharacter } from '@axe/domain/character/import/system-profiles/dx3-appspot-profile';
import { appspotLabelMap } from '@axe/domain/character/import/system-profiles/label-maps';
import { addGeneralStatuses, fillFromGeneral } from '@axe/domain/character/import/system-profiles/profile-fill';
import {
  buildPsychoFictionCharacter,
  nameResources,
} from '@axe/domain/character/import/system-profiles/psychofiction-appspot';
import { PF_APPSPOT_SYSTEMS } from '@axe/domain/character/import/system-profiles/psychofiction-systems';
import { buildStellarAppspotCharacter } from '@axe/domain/character/import/system-profiles/stellar-appspot-profile';

/**
 * Reads a warehouse character with the profile for its system, falling back to the general parser.
 *
 * `systemHint` is the system slug the sheet was fetched under. A system with a dedicated profile is
 * tried with it first; any other, or data that profile does not recognise, is read generally with
 * that system's headings and given the system's dice bot where the data names none.
 */
export function parseAppspotCharacterForSystem(parsed: unknown, systemHint?: string): ImportedCharacter | null {
  const slug = (systemHint ?? '').trim().toLowerCase();
  // Read generally first, so that whatever the profile does not speak for is still there to fill
  // in with: a sheet fetched by its address used to come in without what the same sheet pasted as
  // json brought, since the profile stood in place of the general reading rather than on top of it.
  const general = parseAppspotCharacter(parsed, appspotLabelMap(slug));

  if (slug === 'dx3') {
    const profile = buildDx3AppspotCharacter(parsed);
    if (profile) return fillFromGeneral(profile, general);
  }
  if (slug === 'stellar') {
    const profile = buildStellarAppspotCharacter(parsed);
    if (profile) return fillFromGeneral(profile, general);
  }
  if (slug === 'bbt') {
    const profile = buildBbtAppspotCharacter(parsed);
    if (profile) return fillFromGeneral(profile, general);
  }
  const pfConfig = PF_APPSPOT_SYSTEMS[slug];
  if (pfConfig) {
    const profile = buildPsychoFictionCharacter(parsed, pfConfig);
    if (profile) {
      return nameResources(fillFromGeneral(addGeneralStatuses(profile, general), general), pfConfig.resourceLabels);
    }
  }

  const character = general;
  if (character && character.dicebot.trim() === '') {
    character.dicebot = resolveAppspotDicebot(slug);
  }
  return character;
}

import { parseAppspotCharacter } from '@axe/domain/character/import/appspot-character-parser';
import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { buildBbtAppspotCharacter } from '@axe/domain/character/import/system-profiles/bbt-appspot-profile';
import { resolveAppspotDicebot } from '@axe/domain/character/import/system-profiles/dicebot-map';
import { buildDx3AppspotCharacter } from '@axe/domain/character/import/system-profiles/dx3-appspot-profile';
import { appspotLabelMap } from '@axe/domain/character/import/system-profiles/label-maps';
import { buildPsychoFictionCharacter } from '@axe/domain/character/import/system-profiles/psychofiction-appspot';
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

  if (slug === 'dx3') {
    const profile = buildDx3AppspotCharacter(parsed);
    if (profile) return profile;
  }
  if (slug === 'stellar') {
    const profile = buildStellarAppspotCharacter(parsed);
    if (profile) return profile;
  }
  if (slug === 'bbt') {
    const profile = buildBbtAppspotCharacter(parsed);
    if (profile) return profile;
  }
  const pfConfig = PF_APPSPOT_SYSTEMS[slug];
  if (pfConfig) {
    const profile = buildPsychoFictionCharacter(parsed, pfConfig);
    if (profile) return profile;
  }

  const character = parseAppspotCharacter(parsed, appspotLabelMap(slug));
  if (character && character.dicebot.trim() === '') {
    character.dicebot = resolveAppspotDicebot(slug);
  }
  return character;
}

import { ImportedCharacter } from '@axe/domain/character/import/imported-character';

/**
 * Fills in what a profile left unsaid from the general reading of the same sheet.
 *
 * A profile knows one system and says the things only somebody who knows it could say: which
 * array is the powers, how the skill table is laid out, what to put in the palette. It is not a
 * whole reading, though, and it used to be taken for one: whatever it did not mention was simply
 * lost, so a sheet fetched by its address came in without the resources that the same sheet
 * pasted as json brought with it.
 *
 * Only what the profile left empty is filled, so a profile that has its own answer keeps it.
 */
export function fillFromGeneral(profile: ImportedCharacter, general: ImportedCharacter | null): ImportedCharacter {
  if (!general) return profile;
  if (profile.statuses.length < 1) profile.statuses = general.statuses;
  if (profile.params.length < 1) profile.params = general.params;
  if (profile.dicebot.trim() === '') profile.dicebot = general.dicebot;
  return profile;
}

/**
 * Puts the resources the general reading found after the ones a profile counted itself.
 *
 * For a profile that counts one resource its own way, such as life kept as boxes to cross off,
 * and has nothing to say about the rest: filling only an empty list would lose every other
 * resource the sheet keeps. A resource both name is the profile's.
 */
export function addGeneralStatuses(profile: ImportedCharacter, general: ImportedCharacter | null): ImportedCharacter {
  if (!general) return profile;
  const named = new Set(profile.statuses.map((status) => status.label));
  profile.statuses = [...profile.statuses, ...general.statuses.filter((status) => !named.has(status.label))];
  return profile;
}

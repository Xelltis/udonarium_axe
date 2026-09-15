import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import {
  buildPsychoFictionCharacter,
  isPsychoFictionAppspotCharacter,
} from '@axe/domain/character/import/system-profiles/psychofiction-appspot';
import { PF_APPSPOT_SYSTEMS } from '@axe/domain/character/import/system-profiles/psychofiction-systems';

/**
 * Whether the pasted json looks like a warehouse character whose abilities are kept under
 * `ability`.
 */
export function isInsaneAppspotCharacter(parsed: unknown): boolean {
  return isPsychoFictionAppspotCharacter(parsed, 'ability');
}

/**
 * Builds the imported model from an `insane` warehouse character with that system's entry in
 * `PF_APPSPOT_SYSTEMS`, or null for data of another shape.
 */
export function buildInsaneAppspotCharacter(parsed: unknown): ImportedCharacter | null {
  return buildPsychoFictionCharacter(parsed, PF_APPSPOT_SYSTEMS['insane']);
}

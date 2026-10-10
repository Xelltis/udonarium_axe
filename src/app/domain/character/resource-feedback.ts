import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/**
 * What a resource does to the table when it moves.
 *
 * Neither an effect nor a sound is played unless the field asks for one: a table that sees a
 * blow struck and hears it for every point of every counter soon notices none of them.
 */
export function playsEffectOnChange(element: DataElement): boolean {
  return element.getAttribute(DataElementAttribute.CHANGE_EFFECT) === 'true';
}

/** Whether the resource asks for a sound when it moves. */
export function playsSoundOnChange(element: DataElement): boolean {
  return element.getAttribute(DataElementAttribute.CHANGE_SOUND) === 'true';
}

/** Whose hurt the sound is: a body that bleeds, or a frame that dents. */
export type ResourceSoundSet = 'flesh' | 'mech';

export interface ResourceSoundSetOption {
  value: ResourceSoundSet;
  labelKey: string;
}

export const RESOURCE_SOUND_SET_OPTIONS: readonly ResourceSoundSetOption[] = [
  { value: 'flesh', labelKey: 'feature.dataElement.soundSet.flesh' },
  { value: 'mech', labelKey: 'feature.dataElement.soundSet.mech' },
];

/**
 * Which set of sounds the resource plays when it moves: `mech` where asked for, otherwise `flesh`.
 */
export function soundSetOnChange(element: DataElement): ResourceSoundSet {
  return element.getAttribute(DataElementAttribute.CHANGE_SOUND_SET) === 'mech' ? 'mech' : 'flesh';
}

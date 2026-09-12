import { GameCharacter } from '@axe/domain/character/game-character';
import { gaugeRatio } from '@axe/domain/character/piece-gauge';
import { resourceElementsOf as resourcesOf } from '@axe/domain/character/resource-catalog';
import { DataElement } from '@axe/domain/data/data-element';

/** The resources of this piece the sheet shows as resource fields, which is what a row edits. */
export function resourceElementsOf(character: GameCharacter): DataElement[] {
  return resourcesOf(character, { fieldsOnly: true });
}

export function resourceMax(element: DataElement): number {
  const max = Number(element.value);
  return Number.isFinite(max) && max > 0 ? max : 0;
}

export function resourceRatio(element: DataElement): number {
  return gaugeRatio(Number(element.currentValue), resourceMax(element));
}

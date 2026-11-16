import { GameCharacter } from '@axe/domain/character/game-character';
import { owningCharacterOf } from '@axe/domain/character/owning-character';
import { DataElement } from '@axe/domain/data/data-element';
import { afterEach, describe, expect, it } from 'vitest';

describe('owningCharacterOf', () => {
  const made: { destroy(): void }[] = [];

  afterEach(() => {
    for (const each of made.splice(0)) each.destroy();
  });

  it('finds the character above an element however deep it sits', () => {
    const character = GameCharacter.create('勇者', 1, '');
    const section = DataElement.create('能力値', '', {});
    const field = DataElement.create('筋力', 12, {});
    section.appendChild(field);
    character.detailDataElement!.appendChild(section);
    made.push(character);

    expect(owningCharacterOf(field)).toBe(character);
    expect(owningCharacterOf(section)).toBe(character);
  });

  it('is null for an element no character holds', () => {
    const section = DataElement.create('能力値', '', {});
    const field = DataElement.create('筋力', 12, {});
    section.appendChild(field);
    made.push(section);

    expect(owningCharacterOf(field)).toBeNull();
    expect(owningCharacterOf(section)).toBeNull();
  });
});

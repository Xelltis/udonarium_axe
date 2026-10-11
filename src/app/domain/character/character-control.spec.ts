import { isControllableByUser } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';
import { describe, expect, it } from 'vitest';

function makeCharacter(owner: string, locationName: string): GameCharacter {
  const character = GameCharacter.create('テストキャラ', 1, '');
  character.owner = owner;
  character.location.name = locationName;
  return character;
}

describe('isControllableByUser', () => {
  it('takes your own piece and one nobody has claimed', () => {
    expect(isControllableByUser(makeCharacter('me', 'table'), 'me')).toBe(true);
    expect(isControllableByUser(makeCharacter('', 'table'), 'me')).toBe(true);
  });

  it('leaves the piece of another, and anything buried, alone', () => {
    expect(isControllableByUser(makeCharacter('other', 'table'), 'me')).toBe(false);
    expect(isControllableByUser(makeCharacter('', 'graveyard'), 'me')).toBe(false);
    expect(isControllableByUser(makeCharacter('me', 'graveyard'), 'me')).toBe(false);
  });

  it('still offers an unclaimed piece to someone the room does not know yet', () => {
    expect(isControllableByUser(makeCharacter('', 'table'), '')).toBe(true);
    expect(isControllableByUser(makeCharacter('me', 'table'), '')).toBe(false);
  });
});

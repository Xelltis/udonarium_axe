import { GRAVEYARD_LOCATION } from '@axe/domain/character/character-control';
import { GameCharacter } from '@axe/domain/character/game-character';
import { firstPersonSeats } from '@axe/domain/tabletop/first-person/first-person-seats';

describe('firstPersonSeats', () => {
  function pieceNamed(name: string, owner = ''): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.location = { name: 'table', x: 0, y: 0 };
    character.owner = owner;
    return character;
  }

  const anyPiece = () => true;

  it('offers the pieces this seat may work', () => {
    const mine = pieceNamed('わたし', 'me');
    const theirs = pieceNamed('よそ', 'someone-else');

    expect(firstPersonSeats([mine, theirs], 'me', anyPiece)).toEqual([{ identifier: mine.identifier, name: 'わたし' }]);
  });

  it('counts a piece nobody has claimed as one this seat may work', () => {
    const loose = pieceNamed('野良');

    expect(firstPersonSeats([loose], 'me', anyPiece)).toHaveLength(1);
  });

  it('leaves out a piece that cannot be looked out of', () => {
    const mine = pieceNamed('わたし', 'me');

    expect(firstPersonSeats([mine], 'me', () => false)).toEqual([]);
  });

  it('leaves out a piece that has gone to the graveyard', () => {
    const buried = pieceNamed('とむらい', 'me');
    buried.location.name = GRAVEYARD_LOCATION;

    expect(firstPersonSeats([buried], 'me', anyPiece)).toEqual([]);
  });
});

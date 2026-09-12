import { GameCharacter } from '@axe/domain/character/game-character';
import { firstPersonShareChoices } from '@axe/features/gm-tools/gm-toolbar/first-person-share-choices';

describe('firstPersonShareChoices', () => {
  function pieceNamed(name: string, owner = ''): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.location = { name: 'table', x: 0, y: 0 };
    character.owner = owner;
    return character;
  }

  const anyPiece = () => true;

  it('says which of the pieces a player holds', () => {
    const player = pieceNamed('冒険者', 'player-1');
    const loose = pieceNamed('門番');

    expect(firstPersonShareChoices([player, loose], '', anyPiece)).toEqual([
      { identifier: player.identifier, name: '冒険者', playerOwned: true, shared: false },
      { identifier: loose.identifier, name: '門番', playerOwned: false, shared: false },
    ]);
  });

  it('marks the piece everyone is already looking out of', () => {
    const piece = pieceNamed('斥候', 'player-1');

    expect(firstPersonShareChoices([piece], piece.identifier, anyPiece)[0].shared).toBe(true);
  });

  it('offers only the pieces that can be looked out of', () => {
    const near = pieceNamed('近く');
    const away = pieceNamed('遠く');

    const choices = firstPersonShareChoices([near, away], '', (character) => character === near);

    expect(choices.map((choice) => choice.name)).toEqual(['近く']);
  });

  it('takes a blank owner with spaces in it for no owner at all', () => {
    const piece = pieceNamed('空白', '   ');

    expect(firstPersonShareChoices([piece], '', anyPiece)[0].playerOwned).toBe(false);
  });
});

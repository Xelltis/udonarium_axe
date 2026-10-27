import { ObjectStore } from '@axe/core/sync/object-store';
import { chatLineBout, lineChangesResources, lineIsSecret } from '@axe/domain/battle/battle-chat-line';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementType } from '@axe/domain/data/data-element';

function pieceWith(name: string, ...resources: string[]): GameCharacter {
  const piece = GameCharacter.create(name, 1, '');
  for (const resource of resources) {
    piece.detailDataElement?.appendChild(
      DataElement.create(resource, 20, { type: DataElementType.NUMBER_RESOURCE, currentValue: 20 })
    );
  }
  piece.detailDataElement?.appendChild(DataElement.create('メモ', '', {}));
  return piece;
}

afterEach(() => {
  for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
  ObjectStore.instance.clearDeleteHistory();
});

describe('chatLineBout()', () => {
  it('has the piece that spoke strike those the line aims at, else those picked out, never itself', () => {
    const hero = pieceWith('勇者');
    const goblin = pieceWith('ゴブリン');
    const slime = pieceWith('スライム');

    expect(chatLineBout('《vs》', hero, [goblin, 'not a piece'], () => [slime])).toEqual({
      attacker: hero,
      defenders: [goblin],
    });
    expect(chatLineBout('《vs》', hero, [], () => [hero, slime])).toEqual({ attacker: hero, defenders: [slime] });
  });

  it('plays no bout without the token, from a speaker who is no piece, or with nobody else to strike', () => {
    const hero = pieceWith('勇者');
    const goblin = pieceWith('ゴブリン');

    expect(chatLineBout('斬る', hero, [goblin], () => [])).toBeNull();
    expect(chatLineBout('《vs》', 'a cursor', [goblin], () => [])).toBeNull();
    expect(chatLineBout('《vs》', hero, [hero], () => [])).toBeNull();
    expect(chatLineBout('《vs》', hero, [], () => [hero])).toBeNull();
  });
});

describe('lineChangesResources()', () => {
  it('finds a resource command that names a resource of the piece it aims at, in either width and secret', () => {
    const bout = { attacker: pieceWith('勇者', '気力'), defenders: [pieceWith('ゴブリン', '生命')] };

    expect(lineChangesResources('2d6 t:生命-10 《vs》', bout)).toBe(true);
    expect(lineChangesResources(':気力-2 《vs》', bout)).toBe(true);
    expect(lineChangesResources('st:生命-3 《vs》', bout)).toBe(true);
    expect(lineChangesResources('ｔ：生命－3 《vs》', bout)).toBe(true);
  });

  it('finds none in a colon in passing, a smiley, a time or a command the pieces cannot take', () => {
    const bout = { attacker: pieceWith('勇者', '気力'), defenders: [pieceWith('ゴブリン', '生命')] };

    expect(lineChangesResources('斬りかかる《vs》', bout)).toBe(false);
    expect(lineChangesResources('《vs》 いくぞ :)', bout)).toBe(false);
    expect(lineChangesResources('《vs》 開始 :30', bout)).toBe(false);
    expect(lineChangesResources('時刻は 12:30 《vs》', bout)).toBe(false);
    expect(lineChangesResources(':生命-3 《vs》', bout)).toBe(false);
    expect(lineChangesResources('t:気力-3 《vs》', bout)).toBe(false);
    expect(lineChangesResources('t:メモ>倒れた 《vs》', bout)).toBe(false);
  });
});

describe('lineIsSecret()', () => {
  it('finds a resource command kept secret', () => {
    expect(lineIsSecret('st:HP-3 《vs》')).toBe(true);
    expect(lineIsSecret('2d6 s:MP-1')).toBe(true);
    expect(lineIsSecret('ｓｔ：HP-3')).toBe(true);
  });

  it('finds none in an open line', () => {
    expect(lineIsSecret('t:HP-3 《vs》')).toBe(false);
    expect(lineIsSecret('statues:3')).toBe(false);
  });
});

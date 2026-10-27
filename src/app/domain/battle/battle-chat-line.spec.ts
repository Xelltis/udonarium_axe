import { ObjectStore } from '@axe/core/sync/object-store';
import { chatLineBout, lineChangesResources, lineIsSecret } from '@axe/domain/battle/battle-chat-line';
import { GameCharacter } from '@axe/domain/character/game-character';

function pieceWith(name: string): GameCharacter {
  return GameCharacter.create(name, 1, '');
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
  it('finds the resource commands in either width and secret', () => {
    expect(lineChangesResources('2d6 t:HP-10 《vs》')).toBe(true);
    expect(lineChangesResources(':MP-2 《vs》')).toBe(true);
    expect(lineChangesResources('st:HP-3 《vs》')).toBe(true);
    expect(lineChangesResources('ｔ：HP-3 《vs》')).toBe(true);
  });

  it('finds none in a line without one', () => {
    expect(lineChangesResources('斬りかかる《vs》')).toBe(false);
    expect(lineChangesResources('時刻は 12:30')).toBe(false);
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

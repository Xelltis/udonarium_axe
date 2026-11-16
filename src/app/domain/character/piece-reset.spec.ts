import { GameCharacter } from '@axe/domain/character/game-character';
import {
  countReset,
  resetAcross,
  type ResetRecord,
  ResetRecorder,
  type ResetRequest,
  undoReset,
} from '@axe/domain/character/piece-reset';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementType,
} from '@axe/domain/data/data-element';
import { applyBuffEdit } from '@axe/domain/data/resource-edit-helpers';

const EVERYTHING: ResetRequest = { rule: { kind: 'all' }, values: true };

describe('resetting pieces and taking the reset back', () => {
  let made: GameCharacter[] = [];

  /** A piece whose sheet holds HP 20/20 and 命中 3, both keeping what they hold as their default. */
  function piece(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.addExtendData();
    for (const child of [...character.detailDataElement!.children]) child.destroy();
    const section = DataElement.create('能力', '');
    character.detailDataElement!.appendChild(section);
    section.appendChild(
      DataElement.create('HP', 20, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: 20,
        [DataElementAttribute.DEFAULT]: '20',
        [DataElementAttribute.DEFAULT_MAX]: '20',
      })
    );
    section.appendChild(
      DataElement.create('命中', 3, {
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
        [DataElementAttribute.DEFAULT]: '3',
      })
    );
    section.appendChild(DataElement.create('メモ', '控え'));
    made.push(character);
    return character;
  }

  function partOf(body: GameCharacter, name: string): GameCharacter {
    const part = piece(name);
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    return part;
  }

  const item = (character: GameCharacter, name: string) => character.detailDataElement!.getFirstElementByName(name)!;
  const buff = (character: GameCharacter, command: string) =>
    applyBuffEdit({ command, object: character, targeted: false }, character);
  const buffNames = (character: GameCharacter) => character.buffs.list().map((data) => data.name);
  const held = (character: GameCharacter) => [
    `${item(character, 'HP').currentValue}/${item(character, 'HP').value}`,
    `${item(character, '命中').value}`,
  ];

  /** Resets the pieces and answers what the reset did, as a recorder watching them tells it. */
  function reset(pieces: GameCharacter[], request: ResetRequest = EVERYTHING): ResetRecord {
    const recorder = new ResetRecorder();
    recorder.watch(pieces);
    resetAcross(pieces, request);
    return recorder.finish();
  }

  afterEach(() => {
    for (const character of made) character.destroy();
    made = [];
  });

  describe('resetting', () => {
    it('takes the buffs off first and then puts the values back, so a status a buff moved stands at its default', () => {
      const knight = piece('騎士');
      buff(knight, '&!猛攻撃/命中/+/2/3');
      item(knight, 'HP').currentValue = 7;
      expect(held(knight)).toEqual(['7/20', '5']);

      const count = resetAcross([knight], EVERYTHING);

      expect(buffNames(knight)).toEqual([]);
      expect(held(knight)).toEqual(['20/20', '3']);
      expect(count).toEqual({ characters: 1, buffs: 1, items: 1 });
    });

    it('leaves the values alone where only the buffs are asked for, and the buffs where only the values are', () => {
      const knight = piece('騎士');
      buff(knight, '&盾/防御+1/3');
      item(knight, 'HP').currentValue = 7;

      expect(resetAcross([knight], { rule: { kind: 'all' }, values: false })).toEqual({
        characters: 1,
        buffs: 1,
        items: 0,
      });
      expect(held(knight)).toEqual(['7/20', '3']);

      buff(knight, '&盾/防御+1/3');
      expect(resetAcross([knight], { rule: null, values: true })).toEqual({ characters: 1, buffs: 0, items: 1 });
      expect(buffNames(knight)).toEqual(['盾']);
      expect(held(knight)).toEqual(['20/20', '3']);
    });

    it('takes the debuffs alone by the states the room keeps', () => {
      const knight = piece('騎士');
      buff(knight, '&盾/防御+1/3');
      buff(knight, '&毒/HP-1/3');

      resetAcross([knight], { rule: { kind: 'debuffs' }, values: false }, [newStatusAilment('毒')]);

      expect(buffNames(knight)).toEqual(['盾']);
    });

    it('reaches a part only where it is among the pieces given', () => {
      const dragon = piece('竜');
      const head = partOf(dragon, '竜の頭');
      item(head, '命中').value = 9;

      expect(resetAcross([dragon], EVERYTHING).items).toBe(0);
      expect(held(head)[1]).toBe('9');
      expect(resetAcross([dragon, ...dragon.partsAlong()], EVERYTHING)).toEqual({ characters: 1, buffs: 0, items: 1 });
      expect(held(head)[1]).toBe('3');
    });

    it('counts a part once where it is given beside its body', () => {
      const dragon = piece('竜');
      const head = partOf(dragon, '竜の頭');
      item(dragon, '命中').value = 9;
      item(head, '命中').value = 9;

      expect(countReset([dragon, head], EVERYTHING)).toEqual({ characters: 2, buffs: 0, items: 2 });
      expect(countReset([dragon], EVERYTHING)).toEqual({ characters: 1, buffs: 0, items: 1 });
    });

    it('counts what a reset would reach without changing anything', () => {
      const knight = piece('騎士');
      const squire = piece('従者');
      buff(knight, '&盾/防御+1/3');
      buff(knight, '&毒/HP-1/3');
      item(squire, '命中').value = 9;
      item(squire, 'HP').currentValue = 1;

      expect(countReset([knight, squire], EVERYTHING)).toEqual({ characters: 2, buffs: 2, items: 2 });
      expect(countReset([knight, squire], { rule: { kind: 'all' }, values: false })).toEqual({
        characters: 1,
        buffs: 2,
        items: 0,
      });
      expect(countReset([knight, squire], { rule: null, values: true })).toEqual({ characters: 1, buffs: 0, items: 2 });
      expect(buffNames(knight)).toEqual(['盾', '毒']);
      expect(held(squire)).toEqual(['1/20', '9']);
    });
  });

  describe('what a reset is remembered as', () => {
    it('keeps the pieces it changed anything on, and none it left as they were', () => {
      const knight = piece('騎士');
      const squire = piece('従者');
      buff(knight, '&盾/防御+1/3');

      const record = reset([knight, squire]);

      expect(record.pieces.map((entry) => entry.piece)).toEqual([knight.identifier]);
      expect(record.pieces[0].buffsBefore.map((entry) => entry.name)).toEqual(['盾']);
      expect(record.pieces[0].buffsAfter).toEqual([]);
    });

    it('tells every place left changed, what a buff going moved among them', () => {
      const knight = piece('騎士');
      buff(knight, '&!猛攻撃/命中/+/2/3');
      item(knight, 'HP').currentValue = 7;

      const record = reset([knight]);

      expect(record.pieces[0].changes.map((change) => [change.field, `${change.before}`, `${change.after}`])).toEqual([
        ['currentValue', '7', '20'],
        ['value', '5', '3'],
      ]);
    });

    it('remembers a piece as it stood when first watched, however often it is watched', () => {
      const knight = piece('騎士');
      const recorder = new ResetRecorder();
      recorder.watch([knight]);
      item(knight, '命中').value = 9;
      recorder.watch([knight]);

      expect(recorder.finish().pieces[0].changes).toMatchObject([{ field: 'value', before: 3, after: 9 }]);
    });
  });

  describe('taking a reset back (acceptance 17)', () => {
    it('puts the buffs, the values and what a buff moved back as they were', () => {
      const knight = piece('騎士');
      buff(knight, '&!猛攻撃/命中/+/2/3');
      buff(knight, '&毒/HP-1/2/デバフ');
      item(knight, 'HP').currentValue = 7;
      const before = knight.buffs.snapshot();
      const record = reset([knight]);
      expect(held(knight)).toEqual(['20/20', '3']);

      expect(undoReset(record)).toEqual({ restored: 1, skipped: 0 });

      expect(knight.buffs.snapshot()).toEqual(before);
      expect(held(knight)).toEqual(['7/20', '5']);
    });

    it('moves a status a buff stands on once, not twice, where the reset left the status where it was', () => {
      const knight = piece('騎士');
      item(knight, '命中').setAttribute(DataElementAttribute.DEFAULT, '5');
      buff(knight, '&!猛攻撃/命中/+/2/3');
      expect(held(knight)[1]).toBe('5');
      const record = reset([knight]);
      expect(held(knight)[1]).toBe('5');
      expect(record.pieces[0].changes).toEqual([]);

      undoReset(record);

      expect(held(knight)[1]).toBe('5');
      expect(buffNames(knight)).toEqual(['猛攻撃']);
      knight.buffs.delete('猛攻撃');
      expect(held(knight)[1]).toBe('3');
    });

    it('puts a buff that leaves its status moved back without moving the status again', () => {
      const knight = piece('騎士');
      buff(knight, '&!毒/:HP/-/3/3');
      expect(held(knight)[0]).toBe('17/20');
      const record = reset([knight]);
      expect(held(knight)[0]).toBe('20/20');

      undoReset(record);

      expect(held(knight)[0]).toBe('17/20');
      expect(buffNames(knight)).toEqual(['毒']);
    });

    it('puts back a maximum and the corrections on it with what was left', () => {
      const knight = piece('騎士');
      const hp = item(knight, 'HP');
      hp.setAttribute(DataElementAttribute.MAX_BASE, '20');
      hp.setAttribute(DataElementAttribute.DEFAULT_MAX_CORRECTION, '0');
      hp.setAttribute(DataElementAttribute.MAX_CORRECTION, '5');
      hp.value = 25;
      hp.currentValue = 24;
      const record = reset([knight], { rule: null, values: true });
      expect([hp.maxCorrection, `${hp.currentValue}/${hp.value}`]).toEqual([0, '20/20']);

      undoReset(record);

      expect([hp.maxCorrection, `${hp.currentValue}/${hp.value}`]).toEqual([5, '24/25']);
    });

    it('leaves a piece whose buffs changed since, and puts the others back', () => {
      const knight = piece('騎士');
      const squire = piece('従者');
      item(knight, '命中').value = 9;
      item(squire, '命中').value = 9;
      const record = reset([knight, squire]);
      buff(squire, '&盾/防御+1/3');

      expect(undoReset(record)).toEqual({ restored: 1, skipped: 1 });

      expect(held(knight)[1]).toBe('9');
      expect(held(squire)[1]).toBe('3');
      expect(buffNames(squire)).toEqual(['盾']);
    });

    it('leaves a piece holding another value where the reset wrote one', () => {
      const knight = piece('騎士');
      item(knight, '命中').value = 9;
      item(knight, 'HP').currentValue = 7;
      const record = reset([knight]);
      item(knight, 'HP').currentValue = 15;

      expect(undoReset(record)).toEqual({ restored: 0, skipped: 1 });

      expect(held(knight)).toEqual(['15/20', '3']);
    });

    it('leaves a piece whose buffs were counted down since', () => {
      const knight = piece('騎士');
      buff(knight, '&盾/防御+1/3');
      buff(knight, '&毒/HP-1/3');
      const record = reset([knight], { rule: { kind: 'debuffs' }, values: false });
      // The room keeps no state by that name, so nothing went and nothing is remembered.
      expect(record.pieces).toEqual([]);

      const cleared = reset([knight], { rule: { kind: 'name', name: '毒' }, values: false });
      knight.buffs.decreaseRound();

      expect(undoReset(cleared)).toEqual({ restored: 0, skipped: 1 });
      expect(buffNames(knight)).toEqual(['盾']);
    });

    it('skips a piece that is gone', () => {
      const knight = piece('騎士');
      item(knight, '命中').value = 9;
      const record = reset([knight]);
      knight.destroy();
      made = [];

      expect(undoReset(record)).toEqual({ restored: 0, skipped: 1 });
    });

    it('leaves alone what was changed since on an item the reset never touched', () => {
      const knight = piece('騎士');
      item(knight, '命中').value = 9;
      const record = reset([knight]);
      item(knight, 'メモ').value = '書き足した';

      expect(undoReset(record)).toEqual({ restored: 1, skipped: 0 });

      expect(item(knight, 'メモ').value).toBe('書き足した');
      expect(held(knight)[1]).toBe('9');
    });

    it('takes a body and its parts back each as a piece of its own', () => {
      const dragon = piece('竜');
      const head = partOf(dragon, '竜の頭');
      buff(head, '&盾/防御+1/3');
      item(dragon, '命中').value = 9;
      const record = reset([dragon, ...dragon.partsAlong()]);
      expect(record.pieces).toHaveLength(2);

      expect(undoReset(record)).toEqual({ restored: 2, skipped: 0 });

      expect(buffNames(head)).toEqual(['盾']);
      expect(held(dragon)[1]).toBe('9');
    });
  });
});

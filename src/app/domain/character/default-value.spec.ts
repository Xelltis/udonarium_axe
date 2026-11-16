import {
  captureDefaults,
  clearDefault,
  clearDefaults,
  countDefaults,
  countItemsOffDefault,
  countItemsToCapture,
  countItemsWithDefault,
  defaultSlotsOf,
  hasDefault,
  holdsItemNamed,
  isOffDefault,
  plainNumberIn,
  readDefault,
  resetElementToDefaults,
  resetPieceToDefaults,
  resetToDefaults,
  writeDefault,
} from '@axe/domain/character/default-value';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementType,
} from '@axe/domain/data/data-element';
import type { ElementAliasTable } from '@axe/domain/data/element-alias';

function resource(name: string, max: number | string, current: number | string, attributes = {}): DataElement {
  return DataElement.create(name, max, {
    type: DataElementType.NUMBER_RESOURCE,
    currentValue: current,
    ...attributes,
  });
}

function number(name: string, value: number | string, attributes = {}): DataElement {
  return DataElement.create(name, value, {
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
    ...attributes,
  });
}

function check(name: string, value: number | string, attributes = {}): DataElement {
  return DataElement.create(name, value, {
    type: DataElementType.CHECK,
    [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK,
    ...attributes,
  });
}

describe('the default a sheet item goes back to', () => {
  let made: GameCharacter[] = [];

  /** A piece with an empty sheet, the items given put under one section of it. */
  function pieceWith(name: string, ...items: DataElement[]): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    for (const child of [...piece.detailDataElement!.children]) child.destroy();
    const section = DataElement.create('能力', '');
    piece.detailDataElement!.appendChild(section);
    for (const item of items) section.appendChild(item);
    made.push(piece);
    return piece;
  }

  function partOf(body: GameCharacter, name: string, ...items: DataElement[]): GameCharacter {
    const part = pieceWith(name, ...items);
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    return part;
  }

  afterEach(() => {
    for (const piece of made) piece.destroy();
    made = [];
  });

  describe('reading (acceptance 9)', () => {
    it.each<[string, Record<string, unknown>]>([
      ['a missing attribute', {}],
      ['an empty attribute', { 'cs-default': '' }],
      ['a blank attribute', { 'cs-default': '  ' }],
      ['an attribute that is no number', { 'cs-default': 'abc' }],
      ['an attribute that only starts with a number', { 'cs-default': '3点' }],
    ])('reads %s as no default, never as 0', (_, attributes) => {
      expect(readDefault(number('命中', 5, attributes), 'now')).toBeNull();
      expect(readDefault(resource('HP', 20, 4, attributes), 'now')).toBeNull();
      expect(hasDefault(number('命中', 5, attributes))).toBe(false);
    });

    it('reads 0 written as text and 0 written as a number as a default of 0', () => {
      expect(readDefault(number('命中', 5, { 'cs-default': '0' }), 'now')).toBe(0);
      expect(readDefault(number('命中', 5, { 'cs-default': 0 }), 'now')).toBe(0);
      expect(readDefault(resource('HP', 20, 4, { 'cs-default-max': '0' }), 'max')).toBe(0);
    });

    it('reads a negative and a fractional default as written', () => {
      expect(readDefault(number('修正', 0, { 'cs-default': '-2' }), 'now')).toBe(-2);
      expect(readDefault(number('倍率', 1, { 'cs-default': ' 1.5 ' }), 'now')).toBe(1.5);
    });

    it('reads 0 and 1 for a checkbox and nothing else, an empty one among it', () => {
      expect(readDefault(check('転倒', 1, { 'cs-default': '0' }), 'now')).toBe(0);
      expect(readDefault(check('転倒', 0, { 'cs-default': '1' }), 'now')).toBe(1);
      expect(readDefault(check('転倒', 0, { 'cs-default': '' }), 'now')).toBeNull();
      expect(readDefault(check('転倒', 0, { 'cs-default': '2' }), 'now')).toBeNull();
    });

    it('reads each slot of a resource from an attribute of its own', () => {
      const hp = resource('HP', 20, 4, {
        'cs-default': '18',
        'cs-default-max': '20',
        'cs-default-max-correction': '0',
        'cs-default-min-correction': '-1',
      });

      expect(readDefault(hp, 'now')).toBe(18);
      expect(readDefault(hp, 'max')).toBe(20);
      expect(readDefault(hp, 'maxCorrection')).toBe(0);
      expect(readDefault(hp, 'minCorrection')).toBe(-1);
    });
  });

  describe('which items may keep one', () => {
    it('lets a resource keep all four, one that may go over its maximum among them', () => {
      expect(defaultSlotsOf(resource('HP', 20, 4))).toEqual(['now', 'max', 'maxCorrection', 'minCorrection']);
      expect(defaultSlotsOf(resource('命中V', 1, 3, { 'cs-over-resource': 'true' }))).toHaveLength(4);
    });

    it('lets a number, a checkbox and a line of text keep what they hold alone', () => {
      expect(defaultSlotsOf(number('命中', 5))).toEqual(['now']);
      expect(defaultSlotsOf(check('転倒', 0))).toEqual(['now']);
      expect(defaultSlotsOf(DataElement.create('命中', 5))).toEqual(['now']);
      expect(defaultSlotsOf(DataElement.create('種族', '人間'))).toEqual(['now']);
    });

    it('lets a section and a group of fields keep none, lines of text as they are stored', () => {
      const piece = pieceWith('騎士', DataElement.create('命中', 5));
      const section = piece.detailDataElement!.children[0];
      const group = DataElement.create('武器', '', { role: 'group', 'cs-default': '3' });
      section.appendChild(group);
      section.setAttribute('cs-default', '3');

      expect(defaultSlotsOf(section)).toEqual([]);
      expect(defaultSlotsOf(group)).toEqual([]);
      expect(readDefault(section, 'now')).toBeNull();
      expect(captureDefaults(piece)).toBe(1);
    });

    it.each<[string, DataElement]>([
      ['a note', DataElement.create('メモ', '', { type: DataElementType.NOTE })],
      ['a choice', DataElement.create('姿勢', '立ち', { fieldType: DataElementFieldType.SELECT })],
      ['a calculation', DataElement.create('合計', '', { fieldType: DataElementFieldType.CALC })],
      ['a picture', DataElement.create('絵', '', { type: DataElementType.IMAGE })],
      ['a table', DataElement.create('技能', '', { type: DataElementType.CHECK_TABLE })],
    ])('lets %s keep none, and does not read one left on it', (_, element) => {
      element.setAttribute('cs-default', '3');

      expect(defaultSlotsOf(element)).toEqual([]);
      expect(readDefault(element, 'now')).toBeNull();
      expect(writeDefault(element, 'now', 3)).toBe(false);
    });

    it('lets the settings a sheet keeps of the piece itself keep none: where its portrait stands, which picture it shows', () => {
      const piece = GameCharacter.create('騎士', 1, '');
      made.push(piece);
      piece.addExtendData();
      const position = piece.detailDataElement!.getFirstElementByName('POS')!;
      const picture = piece.detailDataElement!.getFirstElementByName('ICON')!;
      const before = captureDefaults(piece);
      position.setAttribute('cs-default', '3');
      position.currentValue = 5;

      expect(defaultSlotsOf(position)).toEqual([]);
      expect(defaultSlotsOf(picture)).toEqual([]);
      expect(position.toAttributes()).toMatchObject({ 'cs-default': '3' });
      expect(picture.toAttributes()).not.toHaveProperty('cs-default');
      expect(before).toBe(countItemsWithDefault(piece) - 1);
      expect(resetToDefaults(piece).flatMap((reset) => reset.changes)).toEqual([]);
      expect(position.currentValue).toBe(5);
      expect(isOffDefault(position)).toBe(false);
    });

    it('lets the cells of a table keep none', () => {
      const table = DataElement.create('技能', '', { type: DataElementType.CHECK_TABLE });
      const row = DataElement.create('行', '');
      const cell = check('剣', 1, { 'cs-default': '0' });
      table.appendChild(row);
      row.appendChild(cell);

      expect(defaultSlotsOf(cell)).toEqual([]);
      expect(readDefault(cell, 'now')).toBeNull();
    });
  });

  describe('a line of text (decision 3-1)', () => {
    it.each<[unknown, number]>([
      ['12', 12],
      [12, 12],
      [' 12 ', 12],
      ['-3', -3],
      ['+2', 2],
      ['1.5', 1.5],
      ['.5', 0.5],
      ['0', 0],
      ['007', 7],
    ])('reads %j as the number %d', (raw, number) => {
      expect(plainNumberIn(raw)).toBe(number);
    });

    it.each<[unknown]>([
      [''],
      ['  '],
      [null],
      [undefined],
      ['人間'],
      ['3点'],
      ['12 15'],
      ['１２'],
      ['1e3'],
      ['0x10'],
      ['Infinity'],
      ['-'],
      ['1,000'],
      ['2d6'],
    ])('reads %j as no number, never as 0', (raw) => {
      expect(plainNumberIn(raw)).toBeNull();
    });

    it('marks a line holding a number when the defaults are made, and never a line of prose', () => {
      const hit = DataElement.create('命中', '5');
      const race = DataElement.create('種族', '人間');
      const blank = DataElement.create('備考', '');
      const dice = DataElement.create('ダメージ', '2d6+3');
      const body = pieceWith('騎士', hit, race, blank, dice);

      expect(captureDefaults(body)).toBe(1);
      expect(hit.getAttribute('cs-default')).toBe('5');
      for (const element of [race, blank, dice]) expect(element.toAttributes()).not.toHaveProperty('cs-default');
    });

    it('takes the default off a line that has come to hold prose when the defaults are made again', () => {
      const hit = DataElement.create('命中', '高い', { 'cs-default': '5' });
      const body = pieceWith('騎士', hit);

      expect(captureDefaults(body)).toBe(0);
      expect(hit.toAttributes()).not.toHaveProperty('cs-default');
    });

    it('puts a line moved by hand back to its default', () => {
      const hit = DataElement.create('命中', '7', { 'cs-default': '5' });
      const body = pieceWith('騎士', hit);

      const reset = resetPieceToDefaults(body);

      expect(`${hit.value}`).toBe('5');
      expect(reset.changes).toMatchObject([{ name: '命中', slot: 'now', field: 'value', before: '7', after: 5 }]);
    });

    it('writes the default back over a line that no longer holds a number: it is still its default', () => {
      const hit = DataElement.create('命中', '封印中', { 'cs-default': '5' });
      const body = pieceWith('騎士', hit);

      expect(readDefault(hit, 'now')).toBe(5);
      expect(countDefaults(body)).toBe(1);
      resetPieceToDefaults(body);

      expect(`${hit.value}`).toBe('5');
    });

    it.each<[string, Record<string, string>]>([
      ['a missing attribute', {}],
      ['an empty attribute', { 'cs-default': '' }],
      ['a blank attribute', { 'cs-default': ' ' }],
      ['an attribute that is no number', { 'cs-default': '人間' }],
    ])('leaves a line with %s alone, an empty line among them', (_, attributes) => {
      const hit = DataElement.create('命中', '7', attributes);
      const blank = DataElement.create('備考', '', attributes);
      const body = pieceWith('騎士', hit, blank);

      expect(readDefault(hit, 'now')).toBeNull();
      expect(resetPieceToDefaults(body)).toMatchObject({ defaults: 0, changes: [] });
      expect(hit.value).toBe('7');
      expect(blank.value).toBe('');
    });

    it('puts a line back to a default of 0, and does not write one already holding it', () => {
      const moved = DataElement.create('修正', '2', { 'cs-default': '0' });
      const still = DataElement.create('補正', '0', { 'cs-default': '0' });
      const body = pieceWith('騎士', moved, still);

      const reset = resetPieceToDefaults(body);

      expect(`${moved.value}`).toBe('0');
      expect(still.value).toBe('0');
      expect(reset.changes).toHaveLength(1);
    });
  });

  describe('writing and clearing', () => {
    it('writes a default as text and takes it away again', () => {
      const hit = number('命中', 5);

      expect(writeDefault(hit, 'now', 0)).toBe(true);
      expect(hit.getAttribute('cs-default')).toBe('0');
      clearDefault(hit, 'now');

      expect('cs-default' in hit.toAttributes()).toBe(false);
      expect(readDefault(hit, 'now')).toBeNull();
    });

    it('writes no default that is no number, and none for a slot the item has not', () => {
      const hit = number('命中', 5);

      expect(writeDefault(hit, 'now', Number.NaN)).toBe(false);
      expect(writeDefault(hit, 'max', 3)).toBe(false);
      expect(hit.toAttributes()).not.toHaveProperty('cs-default');
      expect(hit.toAttributes()).not.toHaveProperty('cs-default-max');
    });

    it('keeps 1 for a checkbox given any value but 0', () => {
      const prone = check('転倒', 0);
      writeDefault(prone, 'now', 7);

      expect(prone.getAttribute('cs-default')).toBe('1');
    });
  });

  describe('making what a piece holds now its defaults', () => {
    it('writes every number, checkbox and resource of the piece and its parts, and nothing else', () => {
      const hp = resource('HP', 20, 4, { 'max-base': '20', 'max-correction': '3' });
      const hit = number('命中', 5);
      const prone = check('転倒', 1);
      const race = DataElement.create('種族', '人間');
      const body = pieceWith('竜', hp, hit, prone, race);
      const headHp = resource('HP', 10, 10);
      partOf(body, '竜の頭', headHp);

      expect(captureDefaults(body)).toBe(4);

      expect(hp.toAttributes()).toMatchObject({
        'cs-default': '4',
        'cs-default-max': '20',
        'cs-default-max-correction': '3',
        'cs-default-min-correction': '0',
      });
      expect(hit.getAttribute('cs-default')).toBe('5');
      expect(prone.getAttribute('cs-default')).toBe('1');
      expect(race.toAttributes()).not.toHaveProperty('cs-default');
      expect(headHp.getAttribute('cs-default')).toBe('10');
    });

    it('leaves a value that is empty or no number without a default, taking away one it had', () => {
      const hit = number('命中', '', { 'cs-default': '5' });
      const dodge = number('回避', 'なし');
      const body = pieceWith('騎士', hit, dodge);

      expect(captureDefaults(body)).toBe(0);
      expect(hit.toAttributes()).not.toHaveProperty('cs-default');
      expect(dodge.toAttributes()).not.toHaveProperty('cs-default');
    });

    it('takes every default off the piece and its parts, off an item that may keep none as well', () => {
      const hp = resource('HP', 20, 4);
      const race = DataElement.create('メモ', '人間', { type: DataElementType.NOTE, 'cs-default': '3' });
      const body = pieceWith('竜', hp, race, number('命中', 5));
      const headHp = resource('HP', 10, 10);
      partOf(body, '竜の頭', headHp);
      captureDefaults(body);

      expect(clearDefaults(body)).toBe(4);

      for (const element of [hp, race, headHp]) {
        expect(Object.keys(element.toAttributes()).filter((key) => key.startsWith('cs-default'))).toEqual([]);
      }
      expect(countDefaults(body)).toBe(0);
    });
  });

  describe('putting a piece back (acceptance 9 and 10)', () => {
    it('writes only the items that keep a default, and tells what each held before and after', () => {
      const hit = number('命中', 5, { 'cs-default': '3' });
      const dodge = number('回避', 2, { 'cs-default': '0' });
      const armor = number('防護', 7);
      const blank = number('魔力', 9, { 'cs-default': '' });
      const hp = resource('HP', 20, 4);
      const body = pieceWith('騎士', hit, dodge, armor, blank, hp);

      const [reset] = resetToDefaults(body);

      expect([hit.value, dodge.value, armor.value, blank.value, hp.currentValue]).toEqual([3, 0, 7, 9, 4]);
      expect(reset.defaults).toBe(2);
      expect(reset.changes).toEqual([
        { identifier: hit.identifier, name: '命中', slot: 'now', field: 'value', before: 5, after: 3, followed: false },
        {
          identifier: dodge.identifier,
          name: '回避',
          slot: 'now',
          field: 'value',
          before: 2,
          after: 0,
          followed: false,
        },
      ]);
    });

    it('changes nothing where every item already stands at its default', () => {
      const body = pieceWith('騎士', number('命中', 3, { 'cs-default': '3' }), check('転倒', 0, { 'cs-default': '0' }));

      const [reset] = resetToDefaults(body);

      expect(reset.defaults).toBe(2);
      expect(reset.changes).toEqual([]);
    });

    it('finds no default on a sheet that keeps none', () => {
      const body = pieceWith('騎士', number('命中', 5), resource('HP', 20, 4));

      const [reset] = resetToDefaults(body);

      expect(reset).toMatchObject({ found: true, defaults: 0, changes: [] });
    });

    it('ticks and clears a checkbox', () => {
      const prone = check('転倒', 1, { 'cs-default': '0' });
      const guard = check('防御', '0', { 'cs-default': '1' });
      const body = pieceWith('騎士', prone, guard);

      resetToDefaults(body);

      expect(prone.isChecked).toBe(false);
      expect(guard.isChecked).toBe(true);
    });

    it('writes the maximum before what is left, so a raised maximum makes room for it', () => {
      const hp = resource('HP', 10, 4, { 'cs-default': '18', 'cs-default-max': '20' });
      const body = pieceWith('騎士', hp);

      const [reset] = resetToDefaults(body);

      expect([hp.value, hp.currentValue]).toEqual([20, 18]);
      expect(reset.changes.map((change) => [change.field, change.before, change.after])).toEqual([
        ['value', 10, 20],
        ['currentValue', 4, 18],
      ]);
    });

    it('holds what is left within a maximum that keeps no default', () => {
      const hp = resource('HP', 10, 4, { 'cs-default': '18' });
      const body = pieceWith('騎士', hp);

      const [reset] = resetToDefaults(body);

      expect([hp.value, hp.currentValue]).toEqual([10, 10]);
      expect(reset.changes[0]).toMatchObject({ before: 4, after: 10 });
    });

    it('holds a value within the bounds the item is given', () => {
      const hit = number('命中', 5, { 'cs-default': '30', 'max-base': '9', 'min-base': '0' });
      const hp = resource('HP', 20, 4, { 'cs-default-max': '50', 'max-base': '30' });
      const body = pieceWith('騎士', hit, hp);

      resetToDefaults(body);

      expect(hit.value).toBe(9);
      expect(hp.value).toBe(30);
    });

    it('lets a resource that may go over its maximum go back above it', () => {
      const bonus = resource('命中V', 1, 0, { 'cs-over-resource': 'true', 'cs-default': '3' });
      const body = pieceWith('騎士', bonus);

      resetToDefaults(body);

      expect(bonus.currentValue).toBe(3);
    });

    it('leaves a resource that may go over its maximum alone where it keeps no default (decision 2-3)', () => {
      const bonus = resource('命中V', 1, 3, { 'cs-over-resource': 'true' });
      const body = pieceWith('騎士', bonus);

      const [reset] = resetToDefaults(body);

      expect(bonus.currentValue).toBe(3);
      expect(reset.changes).toEqual([]);
    });

    it('puts the corrections back first, the maximum following them as it does when one is edited', () => {
      const hp = resource('HP', 25, 25, {
        'max-base': '20',
        'max-correction': '5',
        'cs-default-max-correction': '0',
        'cs-default-min-correction': '0',
      });
      const body = pieceWith('騎士', hp);

      const [reset] = resetToDefaults(body);

      expect(hp.maxCorrection).toBe(0);
      expect(hp.toAttributes()).not.toHaveProperty('max-correction');
      expect([hp.value, hp.currentValue]).toEqual([20, 20]);
      expect(reset.changes.map((change) => [change.field, change.slot, change.before, change.after])).toEqual([
        ['maxCorrection', 'maxCorrection', 5, 0],
        ['value', 'max', 25, 20],
        ['currentValue', 'now', 25, 20],
      ]);
    });

    it('leaves a correction that keeps no default where a hand put it', () => {
      const hp = resource('HP', 25, 25, { 'max-base': '20', 'max-correction': '5', 'cs-default': '10' });
      const body = pieceWith('騎士', hp);

      resetToDefaults(body);

      expect(hp.maxCorrection).toBe(5);
      expect([hp.value, hp.currentValue]).toEqual([25, 10]);
    });

    it('puts the parts that go with a piece back with it, and a part on its own', () => {
      const body = pieceWith('竜', number('命中', 5, { 'cs-default': '3' }));
      const headHit = number('命中', 9, { 'cs-default': '4' });
      const head = partOf(body, '竜の頭', headHit);

      const resets = resetToDefaults(body);

      expect(resets.map((reset) => [reset.piece.name, reset.changes.length])).toEqual([
        ['竜', 1],
        ['竜の頭', 1],
      ]);
      headHit.value = 9;
      expect(resetToDefaults(head).map((reset) => reset.piece)).toEqual([head]);
      expect(resetPieceToDefaults(body).piece).toBe(body);
      expect(headHit.value).toBe(4);
    });

    it('tells whether the piece or a part of it has an item by a name, of whatever kind', () => {
      const body = pieceWith('竜', DataElement.create('種族', '竜'));
      partOf(body, '竜の頭', check('転倒', 0));

      expect(holdsItemNamed(body, '種族')).toBe(true);
      expect(holdsItemNamed(body, '転倒')).toBe(true);
      expect(holdsItemNamed(body, '魔力')).toBe(false);
    });

    it('counts the defaults it would find without writing any', () => {
      const hit = number('命中', 5, { 'cs-default': '3' });
      const body = pieceWith('竜', hit, resource('HP', 20, 4, { 'cs-default-max': '20' }));
      partOf(body, '竜の頭', number('命中', 9, { 'cs-default': '4' }));

      expect(countDefaults(body)).toBe(3);
      expect(countDefaults(body, { kind: 'item', name: '命中', slot: 'now' })).toBe(2);
      expect(countDefaults(body, { kind: 'item', name: 'HP', slot: 'now' })).toBe(0);
      expect(hit.value).toBe(5);
    });
  });

  describe('putting one item back (acceptance 12)', () => {
    let hp: DataElement;
    let hit: DataElement;
    let body: GameCharacter;

    beforeEach(() => {
      hp = resource('HP', 10, 4, { 'cs-default': '18', 'cs-default-max': '20' });
      hit = number('命中', 5, { 'cs-default': '3' });
      body = pieceWith('騎士', hp, hit);
    });

    it('puts back what the item holds alone, or its maximum alone', () => {
      const [now] = resetToDefaults(body, { kind: 'item', name: 'HP', slot: 'now' });
      expect([hp.value, hp.currentValue, hit.value]).toEqual([10, 10, 5]);
      expect(now.defaults).toBe(1);

      resetToDefaults(body, { kind: 'item', name: 'HP', slot: 'max' });
      expect([hp.value, hp.currentValue, hit.value]).toEqual([20, 10, 5]);
    });

    it('finds the item under a name written full width', () => {
      const [reset] = resetToDefaults(body, { kind: 'item', name: 'ＨＰ', slot: 'max' });

      expect(reset.found).toBe(true);
      expect(hp.value).toBe(20);
    });

    it('says the item keeps none where it has no default for the slot, and changes nothing', () => {
      const [base] = resetToDefaults(body, { kind: 'item', name: 'HP', slot: 'maxBase' });
      const [correction] = resetToDefaults(body, { kind: 'item', name: 'HP', slot: 'maxCorrection' });
      const [max] = resetToDefaults(body, { kind: 'item', name: '命中', slot: 'max' });

      for (const reset of [base, correction, max]) expect(reset).toMatchObject({ found: true, defaults: 0 });
      expect([hp.value, hp.currentValue, hit.value]).toEqual([10, 4, 5]);
    });

    it('says the sheet has no such item', () => {
      const [reset] = resetToDefaults(body, { kind: 'item', name: '魔力', slot: 'now' });

      expect(reset).toMatchObject({ found: false, defaults: 0, changes: [] });
    });
  });

  describe('standing off a default (acceptance 19)', () => {
    it('tells an item that does not stand at the default it keeps, in any of its slots', () => {
      expect(isOffDefault(number('命中', 7, { 'cs-default': '5' }))).toBe(true);
      expect(isOffDefault(number('命中', 5, { 'cs-default': '5' }))).toBe(false);
      expect(isOffDefault(number('命中', '5', { 'cs-default': '5' }))).toBe(false);
      expect(isOffDefault(resource('HP', 20, 4, { 'cs-default': '20' }))).toBe(true);
      expect(isOffDefault(resource('HP', 18, 18, { 'cs-default': '18', 'cs-default-max': '20' }))).toBe(true);
      expect(isOffDefault(resource('HP', 20, 20, { 'cs-default': '20', 'cs-default-max': '20' }))).toBe(false);
      expect(isOffDefault(check('転倒', 1, { 'cs-default': '0' }))).toBe(true);
      expect(isOffDefault(check('転倒', 0, { 'cs-default': '0' }))).toBe(false);
      expect(isOffDefault(DataElement.create('命中', '封印中', { 'cs-default': '5' }))).toBe(true);
    });

    it('tells nothing of an item that keeps no default, an empty one and a 0 held among them', () => {
      expect(isOffDefault(number('命中', 7))).toBe(false);
      expect(isOffDefault(number('命中', 7, { 'cs-default': '' }))).toBe(false);
      expect(isOffDefault(number('命中', 0, { 'cs-default': '0' }))).toBe(false);
      expect(isOffDefault(DataElement.create('メモ', '', { type: DataElementType.NOTE, 'cs-default': '3' }))).toBe(
        false
      );
    });

    it('tells a correction moved off the default it keeps', () => {
      const hp = resource('HP', 23, 23, { 'max-base': '20', 'max-correction': '3', 'cs-default-max-correction': '0' });

      expect(isOffDefault(hp)).toBe(true);
    });

    it('takes an item held at its bound for standing at a default beyond the bound', () => {
      const hp = resource('HP', 10, 10, { 'cs-default': '18' });

      expect(isOffDefault(hp)).toBe(false);
    });

    it('counts the items off their defaults on a piece and its parts, writing nothing', () => {
      const hp = resource('HP', 20, 4, { 'cs-default': '20' });
      const body = pieceWith('竜', hp, number('命中', 5, { 'cs-default': '5' }), number('回避', 2));
      partOf(body, '竜の頭', number('命中', 9, { 'cs-default': '3' }));

      expect(countItemsOffDefault(body)).toBe(2);
      expect(hp.currentValue).toBe(4);
    });

    it('counts the items making the defaults would mark, and the items that have one written', () => {
      const body = pieceWith(
        '竜',
        resource('HP', 20, 4),
        number('命中', 5),
        number('回避', ''),
        check('転倒', 0),
        DataElement.create('筋力', '12'),
        DataElement.create('種族', '人間', { 'cs-default': '3' })
      );
      partOf(body, '竜の頭', resource('HP', 10, 10));

      expect(countItemsToCapture(body)).toBe(5);
      expect(countItemsWithDefault(body)).toBe(1);
      expect(captureDefaults(body)).toBe(5);
      expect(countItemsWithDefault(body)).toBe(5);
    });
  });

  describe('putting one item itself back (acceptance 19)', () => {
    it('puts back every slot the item keeps a default for, and leaves the other items alone', () => {
      const hp = resource('HP', 10, 4, { 'cs-default': '18', 'cs-default-max': '20' });
      const hit = number('命中', 7, { 'cs-default': '5' });
      const body = pieceWith('騎士', hp, hit);

      const reset = resetElementToDefaults(body, hp);

      expect([hp.value, hp.currentValue]).toEqual([20, 18]);
      expect(hit.value).toBe(7);
      expect(reset).toMatchObject({ found: true, defaults: 2 });
      expect(reset.changes).toHaveLength(2);
    });

    it('gives the value to an alias mate that keeps no default, as putting the sheet back does', () => {
      const aliases: ElementAliasTable = [{ name: '命中力', candidates: ['命中', '命中修正'] }];
      const hit = number('命中', 7, { 'cs-default': '5' });
      const mate = number('命中修正', 7);
      const body = pieceWith('騎士', hit, mate);

      resetElementToDefaults(body, hit, aliases);

      expect([hit.value, mate.value]).toEqual([5, 5]);
    });

    it('finds nothing, and changes nothing, for an item of another sheet', () => {
      const body = pieceWith('騎士', number('命中', 7, { 'cs-default': '5' }));
      const strangers = number('命中', 9, { 'cs-default': '5' });
      pieceWith('従者', strangers);

      expect(resetElementToDefaults(body, strangers)).toMatchObject({ found: false, defaults: 0, changes: [] });
      expect(strangers.value).toBe(9);
    });
  });

  describe('alias mates (acceptance 10)', () => {
    const SPEED: ElementAliasTable = [{ name: '行動値', candidates: ['行動値A', '行動値B', 'イニシアティブ'] }];

    it('gives a mate that keeps no default the value its mate went back to', () => {
      const first = resource('行動値A', 20, 10, { 'cs-default': '15' });
      const second = resource('行動値B', 20, 12);
      const plain = DataElement.create('イニシアティブ', 4);
      const body = pieceWith('騎士', first, second, plain);

      const reset = resetPieceToDefaults(body, undefined, SPEED);

      expect([first.currentValue, second.currentValue, plain.value]).toEqual([15, 15, 15]);
      expect(reset.defaults).toBe(1);
      expect(reset.changes.map((change) => [change.name, change.followed, change.after])).toEqual([
        ['行動値A', false, 15],
        ['行動値B', true, 15],
        ['イニシアティブ', true, 15],
      ]);
    });

    it('leaves a mate that keeps a default of its own at its own, whatever order they stand in', () => {
      for (const order of [
        [0, 1, 2],
        [2, 1, 0],
        [1, 2, 0],
      ]) {
        const items = [
          resource('行動値A', 20, 10, { 'cs-default': '15' }),
          resource('行動値B', 20, 12, { 'cs-default': '7' }),
          DataElement.create('イニシアティブ', 4),
        ];
        const body = pieceWith('騎士', ...order.map((index) => items[index]));

        resetPieceToDefaults(body, undefined, SPEED);

        expect([items[0].currentValue, items[1].currentValue, items[2].value]).toEqual([15, 7, 15]);
      }
    });

    it('holds a mate within its own bounds', () => {
      const first = resource('行動値A', 20, 10, { 'cs-default': '15' });
      const second = resource('行動値B', 12, 3);
      const body = pieceWith('騎士', first, second);

      resetPieceToDefaults(body, undefined, SPEED);

      expect(second.currentValue).toBe(12);
    });

    it('carries a maximum to the maximums of its mates, and not to a plain field', () => {
      const first = resource('行動値A', 30, 10, { 'cs-default-max': '20' });
      const second = resource('行動値B', 25, 12);
      const plain = DataElement.create('イニシアティブ', 4);
      const body = pieceWith('騎士', first, second, plain);

      resetPieceToDefaults(body, undefined, SPEED);

      expect([first.value, second.value, plain.value]).toEqual([20, 20, 4]);
      expect(`${second.currentValue}`).toBe('12');
    });

    it('carries to the mates of the one item put back, and leaves a mate with a default it was not asked for', () => {
      const first = resource('行動値A', 20, 10, { 'cs-default': '15' });
      const second = resource('行動値B', 20, 12, { 'cs-default': '7' });
      const plain = DataElement.create('イニシアティブ', 4);
      const body = pieceWith('騎士', first, second, plain);

      resetPieceToDefaults(body, { kind: 'item', name: '行動値A', slot: 'now' }, SPEED);

      expect([first.currentValue, `${second.currentValue}`, plain.value]).toEqual([15, '12', 15]);
    });

    it('leaves the mates alone where nothing kept a default', () => {
      const first = resource('行動値A', 20, 10);
      const second = resource('行動値B', 20, 12);
      const body = pieceWith('騎士', first, second);

      expect(resetPieceToDefaults(body, undefined, SPEED).changes).toEqual([]);
      expect(`${second.currentValue}`).toBe('12');
    });
  });
});

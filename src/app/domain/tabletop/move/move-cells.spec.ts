import { Attributes } from '@axe/core/sync/attributes';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { moveCellsOf } from '@axe/domain/tabletop/move/move-cells';
import { afterEach, describe, expect, it } from 'vitest';

const NAMES = '移動,移動力,Speed,速度';

const built: GameCharacter[] = [];

function characterWith(
  fields: { name: string; value: number | string; pool?: number | string; unit?: string }[]
): GameCharacter {
  const character = new GameCharacter();
  character.createDataElements();
  character.initialize();
  built.push(character);
  const detail = character.detailDataElement!;
  for (const field of fields) {
    const attributes: Attributes =
      field.pool === undefined
        ? {}
        : { type: DataElementType.NUMBER_RESOURCE, currentValue: `${field.pool}`, max: `${field.value}` };
    if (field.unit !== undefined) attributes[DataElementAttribute.UNIT] = field.unit;
    detail.appendChild(
      DataElement.create(field.name, field.value, attributes, `${field.name}_${character.identifier}`)
    );
  }
  return character;
}

afterEach(() => {
  for (const character of built.splice(0)) character.destroy();
});

describe('how many cells a piece may walk', () => {
  it('takes the first of the named fields the sheet has', () => {
    expect(moveCellsOf(characterWith([{ name: '速度', value: 4 }]), NAMES, 1)).toBe(4);
    expect(
      moveCellsOf(
        characterWith([
          { name: '移動力', value: 7 },
          { name: '速度', value: 4 },
        ]),
        NAMES,
        1
      )
    ).toBe(7);
    expect(
      moveCellsOf(
        characterWith([
          { name: '移動', value: 9 },
          { name: '移動力', value: 7 },
        ]),
        NAMES,
        1
      )
    ).toBe(9);
  });

  it('measures a sheet against what one cell of the table stands for', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30 }]), NAMES, 5, 'foot')).toBe(6);
    expect(moveCellsOf(characterWith([{ name: '移動', value: 25 }]), NAMES, 5, 'foot')).toBe(5);
  });

  it('rounds a part of a cell down', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 27 }]), NAMES, 5, 'foot')).toBe(5);
  });

  it('takes the value as it stands when a cell has no distance set', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30 }]), NAMES, 0, 'foot')).toBe(30);
  });

  it('measures a sheet against what one cell stands for where the table counts in cells', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 3 }]), NAMES, 0.5, 'cell')).toBe(6);
    expect(moveCellsOf(characterWith([{ name: '移動', value: 3, unit: 'マス' }]), NAMES, 0.5, 'cell')).toBe(6);
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30 }]), NAMES, 5, 'cell')).toBe(6);
  });

  it('counts one cell of the sheet as one where the table counts in cells one to one', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 4 }]), NAMES, 1, 'cell')).toBe(4);
    expect(moveCellsOf(characterWith([{ name: '移動', value: 4 }]), NAMES, 0, 'cell')).toBe(4);
  });

  it('does not read a cell short for a distance no binary fraction holds exactly', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 0.3 }]), NAMES, 0.1, 'cell')).toBe(3);
  });

  it('reads what is left of a pool rather than its full amount', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 8, pool: 3 }]), NAMES, 1)).toBe(3);
  });

  it('says nothing at all when the sheet has none of the fields', () => {
    expect(moveCellsOf(characterWith([{ name: 'HP', value: 12 }]), NAMES, 1)).toBeNull();
  });

  it('asks the next name where the first field it found holds no number', () => {
    expect(
      moveCellsOf(
        characterWith([
          { name: '移動', value: '—' },
          { name: '移動力', value: 6 },
        ]),
        NAMES,
        1
      )
    ).toBe(6);
  });

  it('says nothing at all when the field it found is not a number', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 'はやい' }]), NAMES, 1)).toBeNull();
    expect(moveCellsOf(characterWith([{ name: '移動', value: '' }]), NAMES, 1)).toBeNull();
  });
});

describe('what a table says about walking before anybody changes it', () => {
  it('measures a sheet in the unit the table is ruled in', () => {
    // Thirty feet on a table ruled in three-metre cells: nine and a bit metres, three cells.
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30, unit: 'フィート' }]), NAMES, 3, 'metre')).toBe(3);
    // Nine metres on a table ruled in five-foot cells: a little under thirty feet, five cells.
    expect(moveCellsOf(characterWith([{ name: '移動', value: 9, unit: 'm' }]), NAMES, 5, 'foot')).toBe(5);
  });

  it('reads a sheet written in cells as cells, however the table is ruled', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 6, unit: 'マス' }]), NAMES, 5, 'foot')).toBe(6);
  });

  it('takes a sheet with no unit anybody knows to be in the table’s own', () => {
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30, unit: '間' }]), NAMES, 5, 'foot')).toBe(6);
    expect(moveCellsOf(characterWith([{ name: '移動', value: 30 }]), NAMES, 5, 'foot')).toBe(6);
  });

  it('shows the range, reads the usual fields and counts one cell as one', () => {
    const table = new GameTable();
    expect(table.moveRangeEnabled).toBe(true);
    expect(table.moveRangeElementNames).toBe(NAMES);
    expect(table.cellDistance).toBe(1);
    expect(table.cellDistanceUnit).toBe('cell');
  });
});

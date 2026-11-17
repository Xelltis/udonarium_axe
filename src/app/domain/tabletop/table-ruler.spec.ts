import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';

describe('TableRuler', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  const line = { from: { x: 10, y: 20, z: 0, piece: 'hero', lift: 5 }, to: { x: 300, y: 40, z: 75 } };

  it('lies between the ends it is made with, on the table under its name, at its first end', () => {
    const ruler = TableRuler.create('物差し', line);

    expect(ruler.aliasName).toBe('table-ruler');
    expect(ruler.name).toBe('物差し');
    expect(ruler.rulerLine).toEqual(line);
    expect(ruler.isVisibleOnTable).toBe(true);
    expect([ruler.location.x, ruler.location.y]).toEqual([10, 20]);
    expect(ObjectStore.instance.get(ruler.identifier)).toBe(ruler);
  });

  it('is saved with its ends and read back from what was saved', () => {
    const ruler = TableRuler.create('物差し', line);
    const saved = ruler.toXml();
    expect(saved).toContain(`line="${ruler.line.replace(/"/g, '&quot;')}"`);

    const read = ObjectSerializer.instance.parseXml(
      `<table-ruler line="${ruler.line.replace(/"/g, '&quot;')}"></table-ruler>`
    ) as TableRuler;

    expect(read.rulerLine).toEqual(line);
  });

  it('reads no ends from a ruler written with none, or with text that is not one', () => {
    expect((ObjectSerializer.instance.parseXml('<table-ruler></table-ruler>') as TableRuler).rulerLine).toBeNull();
    expect(
      (ObjectSerializer.instance.parseXml('<table-ruler line="nonsense"></table-ruler>') as TableRuler).rulerLine
    ).toBeNull();
  });
});

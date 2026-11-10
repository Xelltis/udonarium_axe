import {
  DEFAULT_PART_LAYER,
  emptyPartMask,
  isPartLost,
  joinedPartFaces,
  maskCovers,
  paintPartMask,
  partAtPicturePoint,
  partFacesOf,
  partLayerOf,
  partMaskOf,
  writePartFaces,
  writePartLayer,
  writePartMask,
} from '@axe/domain/character/part-look';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { describe, expect, it } from 'vitest';

describe('the look of a part over its body', () => {
  it('reads a layer as written, held to what may be drawn, and nothing for one written as none or garbled', () => {
    const layer = { x: 0.25, y: 0.125, width: 0.3333333, order: -2 };
    expect(partLayerOf(writePartLayer(layer))).toEqual({ ...layer, width: 0.3333 });
    expect(partLayerOf('{"x":0.5,"width":99}')).toEqual({ x: 0.5, y: 0.5, width: 4, order: 1 });
    expect(partLayerOf('')).toBeNull();
    expect(partLayerOf('{oops')).toBeNull();
    expect(partLayerOf('3')).toBeNull();
    expect(DEFAULT_PART_LAYER.order).toBeGreaterThan(0);
  });

  it('writes a painted piece of the picture in runs and reads it back, and nothing where nothing is painted', () => {
    const painted = paintPartMask(emptyPartMask(10), 0.5, 0.5, 0.4, true);
    const written = writePartMask(painted);

    expect(written).toMatch(/^10:[0-9a-z.]+$/);
    expect(partMaskOf(written)?.cells).toEqual(painted.cells);
    expect(maskCovers(painted, 0.5, 0.5)).toBe(true);
    expect(maskCovers(painted, 0.05, 0.05)).toBe(false);
    expect(maskCovers(painted, 1.2, 0.5)).toBe(false);
    expect(writePartMask(emptyPartMask(10))).toBe('');
    expect(partMaskOf('')).toBeNull();
    expect(partMaskOf('10:zzzz.1')).toBeNull();
    expect(partMaskOf('10:64')).toBeNull();
  });

  it('wipes paint off where the brush is used to', () => {
    const painted = paintPartMask(emptyPartMask(10), 0.5, 0.5, 1, true);
    const wiped = paintPartMask(painted, 0.5, 0.5, 0.2, false);

    expect(maskCovers(wiped, 0.5, 0.5)).toBe(false);
    expect(maskCovers(wiped, 0.2, 0.5)).toBe(true);
  });

  it('writes the faces of a model a part stands for as runs, and reads them back', () => {
    const faces = new Map([
      [3, new Set([7, 1, 2, 3, 9])],
      [0, new Set([4])],
    ]);
    const written = writePartFaces(faces);

    expect(written).toBe('0:4;3:1-3,7,9');
    expect(partFacesOf(written)).toEqual(new Map([...faces].sort(([a], [b]) => a - b)));
    expect(partFacesOf('')).toEqual(new Map());
    expect(partFacesOf('x:1;2:5-3')).toEqual(new Map([[2, new Set([5])]]));
    expect(joinedPartFaces([partFacesOf('0:1-2'), partFacesOf('0:2-3;1:0')])).toEqual(
      new Map([
        [0, new Set([1, 2, 3])],
        [1, new Set([0])],
      ])
    );
  });

  it('counts a part lost once its first resource runs out or it is marked down, and whole again once healed', () => {
    const detail = DataElement.create('detail', '', {});
    const hp = DataElement.create('HP', 10, { type: DataElementType.NUMBER_RESOURCE, currentValue: 3 });
    hp.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
    detail.appendChild(hp);
    const part = { detailDataElement: detail, downed: '' };

    expect(isPartLost(part)).toBe(false);
    hp.currentValue = 0;
    expect(isPartLost(part)).toBe(true);
    hp.currentValue = 4;
    expect(isPartLost({ ...part, downed: '1' })).toBe(true);
    expect(isPartLost({ detailDataElement: null, downed: '' })).toBe(false);
    detail.destroy();
  });

  it('finds the part a point of the body’s picture lands on: laid over, painted, then laid behind', () => {
    const mask = paintPartMask(emptyPartMask(10), 0.5, 0.5, 0.4, true);
    const base = { aspect: 1, bodyAspect: 1, mask: null, lost: false };
    const parts = [
      { ...base, id: 'head', layer: { x: 0.5, y: 0.2, width: 0.2, order: 2 } },
      { ...base, id: 'chest', layer: null, mask },
      { ...base, id: 'tail', layer: { x: 0.9, y: 0.9, width: 0.2, order: -1 } },
      { ...base, id: 'wing', layer: { x: 0.5, y: 0.5, width: 0.2, order: -1 } },
    ];

    expect(partAtPicturePoint(parts, 0.5, 0.2)).toBe('head');
    expect(partAtPicturePoint(parts, 0.5, 0.5)).toBe('chest');
    expect(partAtPicturePoint(parts, 0.9, 0.9)).toBe('tail');
    expect(partAtPicturePoint(parts, 0.05, 0.6)).toBeNull();
    expect(
      partAtPicturePoint(
        parts.map((part) => (part.id === 'head' ? { ...part, lost: true } : part)),
        0.5,
        0.2
      )
    ).toBeNull();
  });
});

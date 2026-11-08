import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { zoneStateOf } from '@axe/domain/tabletop/zone/zone-state';
import {
  ZONE_COLOUR,
  ZONE_OVER_COLOUR,
  zoneFloorMarksOf,
  zoneOverlayModelOf,
} from '@axe/features/tabletop/table-zone-overlay/zone-overlay-model';

const state = zoneStateOf({
  zones: [{ id: 'z1', centre: { x: 100, y: 100 }, limit: 3, square: false, forming: true }],
  pieces: [
    { id: 'a', point: { x: 100, y: 100 }, zone: 'z1', offField: false, count: 2, side: 'pc' },
    { id: 'b', point: { x: 100, y: 100 }, zone: 'z1', offField: false, count: 2, side: 'npc' },
    { id: 'c', point: { x: 130, y: 100 }, zone: '', offField: false, count: 1, side: 'pc' },
  ],
  rules: resolveZoneRules({ enabled: true, sizes: '4:2:3,8:3:5' }),
  pxPerMetre: 50,
});

describe('zoneOverlayModelOf', () => {
  it('draws each zone at its centre and size, everybody standing in it against its limit, overflowing and forming as it is', () => {
    expect(zoneOverlayModelOf(state, true).zones).toEqual([
      { id: 'z1', cx: 100, cy: 100, reach: 100, square: false, label: '5/3', overflowing: true, forming: true },
    ]);
  });

  it('writes the count only for whoever sees every piece', () => {
    expect(zoneOverlayModelOf(state, false).zones[0].label).toBe('');
  });

  it('marks a piece standing in a zone without being in it, once', () => {
    expect(zoneOverlayModelOf(state, true).inside).toEqual([{ id: 'c', x: 130, y: 100 }]);
  });

  it('marks no piece the reader does not see, and draws no zone of such pieces alone', () => {
    expect(zoneOverlayModelOf(state, false, (id) => id !== 'c').inside).toEqual([]);
    expect(zoneOverlayModelOf(state, false, (id) => id === 'c').zones).toEqual([]);
    expect(zoneOverlayModelOf(state, false, (id) => id === 'a').zones).toHaveLength(1);
    expect(zoneOverlayModelOf(state, true, () => false).inside).toHaveLength(1);
  });
});

describe('zoneFloorMarksOf', () => {
  const model = zoneOverlayModelOf(state, true);

  it('draws a zone holding more than its limit in the warmer colour, dashed while forming, with its count over it', () => {
    const [edge, dot, count] = zoneFloorMarksOf(model, 27);

    expect(edge).toMatchObject({
      kind: 'circle',
      x: 100,
      y: 100,
      r: 100,
      stroke: { colour: ZONE_OVER_COLOUR, dash: [12, 8] },
    });
    expect(dot).toMatchObject({ kind: 'circle', x: 100, y: 100, r: 4 });
    expect(count).toMatchObject({ kind: 'text', text: '5/3', x: 100, y: -8 });
  });

  it('draws a square zone as its square, and a ring the size given about a piece standing in a zone', () => {
    const square = { ...model, zones: [{ ...model.zones[0], square: true, label: '', overflowing: false }] };
    const marks = zoneFloorMarksOf(square, 27);

    expect(marks[0]).toMatchObject({ kind: 'line', closed: true, stroke: { colour: ZONE_COLOUR } });
    expect(marks.at(-1)).toMatchObject({ kind: 'circle', x: 130, y: 100, r: 27 });
  });

  it('draws nothing, not even the rings, without a zone', () => {
    expect(zoneFloorMarksOf({ zones: [], inside: model.inside }, 27)).toEqual([]);
  });
});

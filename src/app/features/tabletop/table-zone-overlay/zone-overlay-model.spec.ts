import { resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { zoneStateOf } from '@axe/domain/tabletop/zone/zone-state';
import { zoneOverlayModelOf } from '@axe/features/tabletop/table-zone-overlay/zone-overlay-model';

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

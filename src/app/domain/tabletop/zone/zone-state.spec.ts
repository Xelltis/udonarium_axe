import { ZonePoint } from '@axe/domain/tabletop/zone/zone-geometry';
import { parseZoneSizes, resolveZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { shapesMeet, ZoneInput, ZonePieceInput, zoneStateOf, ZoneWorld } from '@axe/domain/tabletop/zone/zone-state';

/** Fifty pixels a metre, as a table of fifty-pixel cells a metre across. */
const M = 50;

const rules = resolveZoneRules({ enabled: true, sizes: '5:3:5,10:4:7,20:6:10' });

function zone(id: string, x: number, y: number, more: Partial<ZoneInput> = {}): ZoneInput {
  return { id, centre: { x: x * M, y: y * M }, limit: null, square: false, forming: false, ...more };
}

function piece(id: string, x: number, y: number, more: Partial<ZonePieceInput> = {}): ZonePieceInput {
  return { id, point: { x: x * M, y: y * M }, zone: '', offField: false, count: 1, side: 'pc', ...more };
}

function world(zones: ZoneInput[], pieces: ZonePieceInput[], more: Partial<ZoneWorld> = {}): ZoneWorld {
  return { zones, pieces, rules, pxPerMetre: M, ...more };
}

describe('zoneStateOf', () => {
  it('sizes a zone by the bodies in it, at its centre, and puts every member at that centre', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [piece('a', 10, 10, { zone: 'z1' }), piece('b', 10.5, 10, { zone: 'z1', side: 'npc' })]
      )
    );

    expect(state.zones).toHaveLength(1);
    expect(state.zones[0].count).toBe(2);
    expect(state.zones[0].shape.reach).toBe(3 * M);
    expect(state.pointOf('b')).toEqual({ x: 10 * M, y: 10 * M });
    expect(state.zoneOf('a')?.id).toBe('z1');
    expect(state.writes.setPieceZones).toEqual([]);
    expect(state.isEmpty).toBe(false);
  });

  it('grows with a piece that counts as several bodies, and counts it so by side', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [piece('a', 10, 10, { zone: 'z1' }), piece('giant', 10, 10, { zone: 'z1', side: 'npc', count: 5 })]
      )
    );

    expect(state.zones[0].count).toBe(6);
    expect(state.zones[0].shape.reach).toBe(4 * M);
    expect(state.zones[0].sides.get('npc')).toBe(5);
  });

  it('is drawn as a square half its side across when it is square', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10, { square: true })],
        [piece('a', 10, 10, { zone: 'z1' }), piece('b', 10, 10, { zone: 'z1', side: 'npc' })]
      )
    );

    expect(state.zones[0].shape).toMatchObject({ square: true, reach: 2.5 * M });
  });

  it('ends a zone left with one side in it, and takes its pieces out', () => {
    const state = zoneStateOf(
      world([zone('z1', 10, 10)], [piece('a', 10, 10, { zone: 'z1' }), piece('b', 10, 10, { zone: 'z1' })])
    );

    expect(state.zones).toEqual([]);
    expect(state.writes.removeZones).toEqual(['z1']);
    expect(state.writes.setPieceZones).toEqual([
      { id: 'a', zone: '' },
      { id: 'b', zone: '' },
    ]);
  });

  it('joins a zone whose centre stands in another, half way between, into the lower identifier', () => {
    const state = zoneStateOf(
      world(
        [zone('z2', 12, 10), zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 12, 10, { zone: 'z2' }),
          piece('d', 12, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones.map((view) => view.id)).toEqual(['z1']);
    expect(state.zones[0].members).toEqual(['a', 'b', 'c', 'd']);
    expect(state.zones[0].shape.centre).toEqual({ x: 11 * M, y: 10 * M });
    expect(state.writes.removeZones).toEqual(['z2']);
    expect(state.writes.updateZones).toEqual([
      { id: 'z1', centre: { x: 11 * M, y: 10 * M }, forming: false, limit: null },
    ]);
    expect(state.writes.setPieceZones).toEqual([
      { id: 'c', zone: 'z1' },
      { id: 'd', zone: 'z1' },
    ]);
  });

  it('keeps on joining while one join brings another centre in', () => {
    const state = zoneStateOf(
      world(
        // z3 is out of z1's reach until z1 and z2 join and z1 stands half way to z2.
        [zone('z1', 10, 10), zone('z2', 12.9, 10), zone('z3', 14.4, 10)],
        [
          ...[
            ['z1', 10],
            ['z2', 12.9],
            ['z3', 14.4],
          ].flatMap(([id, x]) => [
            piece(`${id}a`, x as number, 10, { zone: id as string }),
            piece(`${id}b`, x as number, 10, { zone: id as string, side: 'npc' }),
          ]),
        ]
      )
    );

    expect(state.zones.map((view) => view.id)).toEqual(['z1']);
    expect(state.zones[0].count).toBe(6);
  });

  it('puts the joined centre where the table puts points', () => {
    const snap = (point: ZonePoint) => ({ x: Math.round(point.x / M) * M, y: Math.round(point.y / M) * M });
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 11, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 11, 10, { zone: 'z2' }),
          piece('d', 11, 10, { zone: 'z2', side: 'npc' }),
        ],
        { snap }
      )
    );

    expect(state.zones[0].shape.centre).toEqual({ x: 11 * M, y: 10 * M });
  });

  it('leaves zones that only overlap as they are, and says they overlap', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 15, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 15, 10, { zone: 'z2' }),
          piece('d', 15, 10, { zone: 'z2', side: 'npc' }),
          piece('e', 12.5, 10),
        ]
      )
    );

    expect(state.zones.map((view) => view.id)).toEqual(['z1', 'z2']);
    expect(state.overlaps).toEqual([['z1', 'z2']]);
    expect(state.insideOf('e').map((view) => view.id)).toEqual(['z1', 'z2']);
  });

  it('counts a piece standing on the edge as inside', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [piece('a', 10, 10, { zone: 'z1' }), piece('b', 10, 10, { zone: 'z1', side: 'npc' }), piece('e', 13, 10)]
      )
    );

    expect(state.zones[0].inside).toEqual(['e']);
    expect(state.pointOf('e')).toEqual({ x: 13 * M, y: 10 * M });
  });

  it('does not count a piece off the field or on no side, inside or in', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('gone', 10, 10, { zone: 'z1', side: 'npc', offField: true }),
          piece('stray', 10, 10, { side: null }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b']);
    expect(state.zones[0].inside).toEqual([]);
    expect(state.writes.setPieceZones).toEqual([{ id: 'gone', zone: '' }]);
  });

  it('takes out a piece carried more than a metre outside, and forgets a zone that is gone', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('away', 14.5, 10, { zone: 'z1' }),
          piece('near', 13.9, 10, { zone: 'z1' }),
          piece('lost', 30, 30, { zone: 'missing' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b', 'c', 'near']);
    expect(state.writes.setPieceZones).toEqual([
      { id: 'away', zone: '' },
      { id: 'lost', zone: '' },
    ]);
  });

  it('does away with a zone that has no centre, as one arriving with nothing written', () => {
    const state = zoneStateOf(world([zone('z1', 0, 0, { centre: null })], [piece('a', 10, 10, { zone: 'z1' })]));

    expect(state.zones).toEqual([]);
    expect(state.writes.removeZones).toEqual(['z1']);
    expect(state.writes.setPieceZones).toEqual([{ id: 'a', zone: '' }]);
  });

  it('writes the lower limit of two zones joined onto the one kept, though its centre stays', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 10, 10, { limit: 4 })],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z2' }),
          piece('d', 10, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones[0].limit).toBe(4);
    expect(state.writes.updateZones).toEqual([
      { id: 'z1', centre: { x: 10 * M, y: 10 * M }, forming: false, limit: 4 },
    ]);
  });

  it('says a zone holding more than its limit is overflowing, by its own limit or by the table', () => {
    const many = Array.from({ length: 6 }, (_, index) =>
      piece(`p${index}`, 10, 10, { zone: 'z1', side: index % 2 ? 'npc' : 'pc' })
    );

    expect(zoneStateOf(world([zone('z1', 10, 10, { limit: 4 })], many)).zones[0]).toMatchObject({
      limit: 4,
      overflowing: true,
    });
    expect(zoneStateOf(world([zone('z1', 10, 10)], many)).zones[0]).toMatchObject({
      limit: 20,
      overflowing: false,
    });
  });

  it('sizes a zone by those in it, but holds it to its limit by everybody standing in it', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10, { limit: 3 })],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('standing', 11, 10, { count: 2 }),
        ]
      )
    );

    expect(state.zones[0].count).toBe(2);
    expect(state.zones[0].occupants).toBe(4);
    expect(state.zones[0].overflowing).toBe(true);
  });

  it('brings a declared zone into force when it joins one already in force', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10, { forming: true }), zone('z2', 11, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 11, 10, { zone: 'z2' }),
          piece('d', 11, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones[0].forming).toBe(false);
    expect(state.writes.updateZones[0].forming).toBe(false);
  });

  it('keeps a piece that is down out of the zone it names, where it lies inside it without being in it', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', side: 'npc', down: true }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b']);
    expect(state.zones[0].inside).toEqual(['c']);
    expect(state.writes.setPieceZones).toEqual([{ id: 'c', zone: '' }]);
  });

  it('leaves a piece held fast behind, out of the zone, when its zone joins another and the centre moves off', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 11, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc', held: true }),
          piece('c', 11, 10, { zone: 'z2' }),
          piece('d', 11, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'c', 'd']);
    expect(state.zones[0].inside).toEqual(['b']);
    expect(state.pointOf('b')).toEqual({ x: 10 * M, y: 10 * M });
  });

  it('keeps a piece held fast in its zone while the centre stays where it is', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [piece('a', 10, 10, { zone: 'z1' }), piece('b', 10, 10, { zone: 'z1', side: 'npc', held: true })]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b']);
  });

  it('keeps a piece held on to in its zone only while the one holding it is in that zone', () => {
    const together = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', grabbedBy: 'b' }),
        ]
      )
    );
    expect(together.zones[0].members).toEqual(['a', 'b', 'c']);

    const holderGone = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { side: 'npc' }),
          piece('d', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', grabbedBy: 'b' }),
        ]
      )
    );
    expect(holderGone.zones[0].members).toEqual(['a', 'd']);
    expect(holderGone.zones[0].inside).toEqual(['b', 'c']);
    expect(holderGone.writes.setPieceZones).toEqual([{ id: 'c', zone: '' }]);
  });

  it('moves a piece held on to with the one holding it when their zone joins another', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 11, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', grabbedBy: 'b' }),
          piece('d', 11, 10, { zone: 'z2' }),
          piece('e', 11, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(state.pointOf('c')).toEqual(state.pointOf('b'));
  });

  it('takes a piece held on to out with its holder when the holder is held fast and left behind', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10), zone('z2', 11, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc', held: true }),
          piece('c', 10, 10, { zone: 'z1', grabbedBy: 'b' }),
          piece('d', 11, 10, { zone: 'z2' }),
          piece('e', 11, 10, { zone: 'z2', side: 'npc' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'd', 'e']);
    expect(state.zones[0].inside).toEqual(['b', 'c']);
  });

  it('keeps a piece riding another in its zone only while the one it rides is in that zone', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('horse', 10, 10),
          piece('rider', 10, 10, { zone: 'z1', ridingOn: 'horse' }),
          piece('mounted', 10, 10, { zone: 'z1', side: 'npc', ridingOn: 'b' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b', 'mounted']);
    expect(state.writes.setPieceZones).toEqual([{ id: 'rider', zone: '' }]);
  });

  it('lets go of nothing for a holder out of the fight or not on the table', () => {
    const state = zoneStateOf(
      world(
        [zone('z1', 10, 10)],
        [
          piece('a', 10, 10, { zone: 'z1' }),
          piece('b', 10, 10, { zone: 'z1', side: 'npc' }),
          piece('c', 10, 10, { zone: 'z1', grabbedBy: 'gone' }),
          piece('f', 10, 10, { side: 'npc', offField: true }),
          piece('g', 10, 10, { zone: 'z1', grabbedBy: 'f' }),
        ]
      )
    );

    expect(state.zones[0].members).toEqual(['a', 'b', 'c', 'g']);
  });

  it('asks for nothing to be written where everything already says what it should', () => {
    const state = zoneStateOf(world([], [piece('a', 1, 1)]));

    expect(state.isEmpty).toBe(true);
    expect(parseZoneSizes('')).toEqual([]);
  });
});

describe('shapesMeet', () => {
  it('tells whether a circle and a square meet', () => {
    const circle = { centre: { x: 0, y: 0 }, square: false, reach: 10 };

    expect(shapesMeet(circle, { centre: { x: 18, y: 0 }, square: true, reach: 8 })).toBe(true);
    expect(shapesMeet(circle, { centre: { x: 16, y: 16 }, square: true, reach: 8 })).toBe(false);
  });
});

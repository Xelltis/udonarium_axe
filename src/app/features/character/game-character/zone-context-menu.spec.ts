import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import {
  buildZoneContextMenu,
  buildZoneManageContextMenu,
  ZONE_LIMIT_CHOICES,
  ZoneManageCallbacks,
  ZoneMenuCallbacks,
} from '@axe/features/character/game-character/zone-context-menu';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function callbacks(): ZoneMenuCallbacks & { [name: string]: ReturnType<typeof vi.fn> } {
  return {
    declare: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    prepareLeave: vi.fn(),
    cancelLeave: vi.fn(),
    toggleOffField: vi.fn(),
    grab: vi.fn(),
    release: vi.fn(),
    breakFree: vi.fn(),
    checkFire: vi.fn(),
  };
}

function manageCallbacks(): ZoneManageCallbacks & { [name: string]: ReturnType<typeof vi.fn> } {
  return {
    placeSides: vi.fn(),
    setSquare: vi.fn(),
    setLimit: vi.fn(),
    remove: vi.fn(),
  };
}

function model(more: Partial<ZoneMenuModel> = {}): ZoneMenuModel {
  return {
    enabled: true,
    zone: null,
    joinable: [],
    foes: [],
    offField: false,
    leave: null,
    aiming: false,
    unseen: false,
    down: false,
    held: false,
    grabbedBy: null,
    grabbing: [],
    grabbable: [],
    ...more,
  };
}

function names(entries: ContextMenuAction[]): string[] {
  return (entries[0]?.subActions ?? []).map((entry) => entry.name);
}

describe('buildZoneContextMenu', () => {
  it('offers nothing where the room does not play zones, or to somebody who may not change the table', () => {
    expect(buildZoneContextMenu(model({ enabled: false }), true, callbacks(), t)).toEqual([]);
    expect(buildZoneContextMenu(model(), false, callbacks(), t)).toEqual([]);
  });

  it('offers a fight with each enemy at the same point, and declares the one chosen', () => {
    const handlers = callbacks();
    const entries = buildZoneContextMenu(model({ foes: [{ id: 'foe-1', name: 'ゴブリン' }] }), true, handlers, t);

    expect(entries[0].name).toBe('feature.zone.menu.title');
    expect(names(entries)[0]).toBe('feature.zone.menu.declare:{"name":"ゴブリン"}');
    entries[0].subActions![0].action!();
    expect(handlers.declare).toHaveBeenCalledWith('foe-1');
  });

  it('numbers the zones a piece may join when it stands in more than one', () => {
    expect(names(buildZoneContextMenu(model({ joinable: ['z1'] }), true, callbacks(), t))).toContain(
      'feature.zone.menu.join'
    );
    expect(names(buildZoneContextMenu(model({ joinable: ['z1', 'z2'] }), true, callbacks(), t))).toEqual([
      'feature.zone.menu.joinNumbered:{"number":1}',
      'feature.zone.menu.joinNumbered:{"number":2}',
      'feature.zone.menu.offField',
    ]);
  });

  it('offers leaving to a piece in a zone, and saying it will leave where it may', () => {
    const zone = { id: 'z1', square: false, limit: 6 };

    expect(names(buildZoneContextMenu(model({ zone }), true, callbacks(), t))).toEqual([
      'feature.zone.menu.leave',
      'feature.zone.menu.offField',
    ]);
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: false, maySay: true } }), true, callbacks(), t))
    ).toEqual(['feature.zone.menu.leave', 'feature.zone.menu.prepareLeave', 'feature.zone.menu.offField']);
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: true, maySay: true } }), true, callbacks(), t))
    ).toContain('feature.zone.menu.cancelLeave');
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: false, maySay: false } }), true, callbacks(), t))
    ).not.toContain('feature.zone.menu.prepareLeave');
  });

  it('offers putting a piece taken out of the fight back in', () => {
    expect(names(buildZoneContextMenu(model({ offField: true }), true, callbacks(), t))).toEqual([
      'feature.zone.menu.onField',
    ]);
  });

  it('offers checking the line of fire while some other piece is aimed at', () => {
    const handlers = callbacks();
    const none = buildZoneContextMenu(model(), true, handlers, t);
    expect(names(none)).not.toContain('feature.zone.menu.checkFire');

    const aiming = buildZoneContextMenu(model({ aiming: true }), true, handlers, t);
    const entry = aiming[0].subActions!.find((action) => action.name === 'feature.zone.menu.checkFire')!;
    entry.action!();

    expect(handlers.checkFire).toHaveBeenCalled();
  });

  it('offers a piece standing in a zone, not in it, saying it will leave', () => {
    const entries = buildZoneContextMenu(model({ leave: { said: false, maySay: true } }), true, callbacks(), t);

    expect(names(entries)).toContain('feature.zone.menu.prepareLeave');
    expect(names(entries)).not.toContain('feature.zone.menu.leave');
  });

  it('offers taking hold of an enemy at the same point, and letting go of one held or of what holds the piece', () => {
    const handlers = callbacks();
    const entries = buildZoneContextMenu(
      model({
        grabbedBy: { id: 'boss', name: '大蛇' },
        grabbing: [{ id: 'mouse', name: 'ねずみ' }],
        grabbable: [{ id: 'cat', name: 'ねこ' }],
      }),
      true,
      handlers,
      t
    );
    const holds = entries[0].subActions!.slice(1);

    expect(holds.map((entry) => entry.name)).toEqual([
      '☑ feature.zone.menu.grabbedBy:{"name":"大蛇"}',
      '☑ feature.zone.menu.grabbing:{"name":"ねずみ"}',
      '☐ feature.zone.menu.grab:{"name":"ねこ"}',
    ]);
    holds.forEach((entry) => entry.action!());
    expect(handlers.breakFree).toHaveBeenCalled();
    expect(handlers.release).toHaveBeenCalledWith('mouse');
    expect(handlers.grab).toHaveBeenCalledWith('cat');
  });

  it('leaves what state the piece is in, and managing the zone, to groups of their own', () => {
    const entries = buildZoneContextMenu(
      model({ down: true, unseen: true, zone: { id: 'z1', square: false, limit: 6 } }),
      true,
      callbacks(),
      t
    );

    expect(names(entries)).toEqual(['feature.zone.menu.leave', 'feature.zone.menu.offField']);
  });

  it('offers every limit from two to twenty', () => {
    expect(ZONE_LIMIT_CHOICES[0]).toBe(2);
    expect(ZONE_LIMIT_CHOICES).toContain(7);
    expect(ZONE_LIMIT_CHOICES[ZONE_LIMIT_CHOICES.length - 1]).toBe(20);
    expect(ZONE_LIMIT_CHOICES).toHaveLength(19);
  });
});

describe('buildZoneManageContextMenu', () => {
  it('offers nothing but to the master, where the room plays zones and the table may be changed', () => {
    expect(buildZoneManageContextMenu(model(), true, false, manageCallbacks(), t)).toEqual([]);
    expect(buildZoneManageContextMenu(model({ enabled: false }), true, true, manageCallbacks(), t)).toEqual([]);
    expect(buildZoneManageContextMenu(model(), false, true, manageCallbacks(), t)).toEqual([]);
  });

  it('offers setting the sides out, and for a piece in a zone shaping, limiting and ending it', () => {
    const handlers = manageCallbacks();
    const outside = buildZoneManageContextMenu(model(), true, true, handlers, t);
    const inside = buildZoneManageContextMenu(
      model({ zone: { id: 'z1', square: false, limit: 6 } }),
      true,
      true,
      handlers,
      t
    );

    expect(outside[0].name).toBe('feature.zone.menu.manage');
    expect(names(outside)).toEqual(['feature.zone.menu.placement']);
    expect(names(inside)).toEqual([
      'feature.zone.menu.placement',
      'feature.zone.menu.square',
      'feature.zone.menu.limit',
      'feature.zone.menu.remove',
    ]);
    const [placement, square, limit, remove] = inside[0].subActions!;
    placement.action!();
    square.action!();
    expect(limit.subActions!.find((entry) => entry.name.startsWith('✔'))?.name).toBe('✔ 6');
    limit.subActions![0].action!();
    remove.action!();
    expect(handlers.placeSides).toHaveBeenCalled();
    expect(handlers.setSquare).toHaveBeenCalledWith('z1', true);
    expect(handlers.setLimit).toHaveBeenCalledWith('z1', null);
    expect(handlers.remove).toHaveBeenCalledWith('z1');
  });
});

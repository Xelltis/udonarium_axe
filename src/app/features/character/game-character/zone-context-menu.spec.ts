import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import {
  buildZoneContextMenu,
  ZONE_LIMIT_CHOICES,
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
    setSquare: vi.fn(),
    setLimit: vi.fn(),
    remove: vi.fn(),
    checkFire: vi.fn(),
    placeSides: vi.fn(),
  };
}

function model(more: Partial<ZoneMenuModel> = {}): ZoneMenuModel {
  return { enabled: true, zone: null, joinable: [], foes: [], offField: false, leave: null, aiming: false, ...more };
}

function names(entries: ContextMenuAction[]): string[] {
  return (entries[0]?.subActions ?? []).map((entry) => entry.name);
}

describe('buildZoneContextMenu', () => {
  it('offers nothing where the room does not play zones, or to somebody who may not change the table', () => {
    expect(buildZoneContextMenu(model({ enabled: false }), true, true, callbacks(), t)).toEqual([]);
    expect(buildZoneContextMenu(model(), false, false, callbacks(), t)).toEqual([]);
  });

  it('offers a fight with each enemy at the same point, and declares the one chosen', () => {
    const handlers = callbacks();
    const entries = buildZoneContextMenu(
      model({ foes: [{ id: 'foe-1', name: 'ゴブリン' }] }),
      true,
      false,
      handlers,
      t
    );

    expect(entries[0].name).toBe('feature.zone.menu.title');
    expect(names(entries)[0]).toBe('feature.zone.menu.declare:{"name":"ゴブリン"}');
    entries[0].subActions![0].action!();
    expect(handlers.declare).toHaveBeenCalledWith('foe-1');
  });

  it('numbers the zones a piece may join when it stands in more than one', () => {
    expect(names(buildZoneContextMenu(model({ joinable: ['z1'] }), true, false, callbacks(), t))).toContain(
      'feature.zone.menu.join'
    );
    expect(names(buildZoneContextMenu(model({ joinable: ['z1', 'z2'] }), true, false, callbacks(), t))).toEqual([
      'feature.zone.menu.joinNumbered:{"number":1}',
      'feature.zone.menu.joinNumbered:{"number":2}',
      'feature.zone.menu.offField',
    ]);
  });

  it('offers leaving to a piece in a zone, and shaping, limiting and ending it to the master alone', () => {
    const zone = { id: 'z1', square: false, limit: 6 };

    expect(names(buildZoneContextMenu(model({ zone }), true, false, callbacks(), t))).toEqual([
      'feature.zone.menu.leave',
      'feature.zone.menu.offField',
    ]);
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: false, maySay: true } }), true, false, callbacks(), t))
    ).toEqual(['feature.zone.menu.leave', 'feature.zone.menu.prepareLeave', 'feature.zone.menu.offField']);
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: true, maySay: true } }), true, false, callbacks(), t))
    ).toContain('feature.zone.menu.cancelLeave');
    expect(
      names(buildZoneContextMenu(model({ zone, leave: { said: false, maySay: false } }), true, false, callbacks(), t))
    ).not.toContain('feature.zone.menu.prepareLeave');
    const handlers = callbacks();
    const master = buildZoneContextMenu(model({ zone }), true, true, handlers, t);
    expect(names(master)).toEqual([
      'feature.zone.menu.leave',
      'feature.zone.menu.offField',
      'feature.zone.menu.placement',
      'feature.zone.menu.square',
      'feature.zone.menu.limit',
      'feature.zone.menu.remove',
    ]);
    const limits = master[0].subActions![4].subActions!;
    expect(limits.find((entry) => entry.name.startsWith('✔'))?.name).toBe('✔ 6');
    limits[0].action!();
    expect(handlers.setLimit).toHaveBeenCalledWith('z1', null);
  });

  it('offers putting a piece taken out of the fight back in', () => {
    expect(names(buildZoneContextMenu(model({ offField: true }), true, false, callbacks(), t))).toEqual([
      'feature.zone.menu.onField',
    ]);
  });

  it('offers checking the line of fire while some other piece is aimed at', () => {
    const handlers = callbacks();
    const none = buildZoneContextMenu(model(), true, false, handlers, t);
    expect(names(none)).not.toContain('feature.zone.menu.checkFire');

    const aiming = buildZoneContextMenu(model({ aiming: true }), true, false, handlers, t);
    const entry = aiming[0].subActions!.find((action) => action.name === 'feature.zone.menu.checkFire')!;
    entry.action!();

    expect(handlers.checkFire).toHaveBeenCalled();
  });

  it('offers setting the sides out to the master alone', () => {
    const handlers = callbacks();
    expect(names(buildZoneContextMenu(model(), true, false, handlers, t))).not.toContain('feature.zone.menu.placement');

    const master = buildZoneContextMenu(model(), true, true, handlers, t);
    master[0].subActions!.find((action) => action.name === 'feature.zone.menu.placement')!.action!();

    expect(handlers.placeSides).toHaveBeenCalled();
  });

  it('offers a piece standing in a zone, not in it, saying it will leave', () => {
    const handlers = callbacks();
    const entries = buildZoneContextMenu(model({ leave: { said: false, maySay: true } }), true, false, handlers, t);

    expect(names(entries)).toContain('feature.zone.menu.prepareLeave');
    expect(names(entries)).not.toContain('feature.zone.menu.leave');
  });

  it('offers every limit from two to twenty', () => {
    expect(ZONE_LIMIT_CHOICES[0]).toBe(2);
    expect(ZONE_LIMIT_CHOICES).toContain(7);
    expect(ZONE_LIMIT_CHOICES[ZONE_LIMIT_CHOICES.length - 1]).toBe(20);
    expect(ZONE_LIMIT_CHOICES).toHaveLength(19);
  });
});

import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { buildRideContextMenu, RideMenuCallbacks } from '@axe/features/character/game-character/ride-context-menu';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function callbacks(): RideMenuCallbacks & { [name: string]: ReturnType<typeof vi.fn> } {
  return {
    getOn: vi.fn(),
    getOff: vi.fn(),
    setProne: vi.fn(),
    setMountable: vi.fn(),
    setPassenger: vi.fn(),
    setCargo: vi.fn(),
    setAnyone: vi.fn(),
    setSeatHeight: vi.fn(),
  };
}

function model(more: Partial<RideMenuModel> = {}): RideMenuModel {
  return { riding: null, offers: [], mount: null, changeRefusal: null, prone: { on: false, refusal: null }, ...more };
}

/** The entries gathered under the riding group. */
const entriesOf = (menu: ContextMenuAction[]) =>
  menu.find((entry) => entry.name === 'feature.ride.menu.title')?.subActions ?? [];
/** The entries standing on the menu's first level beside the group. */
const firstLevelOf = (menu: ContextMenuAction[]) => menu.filter((entry) => entry.name !== 'feature.ride.menu.title');

describe('buildRideContextMenu', () => {
  it('offers nothing to somebody who may not change the table', () => {
    expect(buildRideContextMenu(model(), false, callbacks(), t)).toEqual([]);
  });

  it('offers each seat free on a mount it stands on at the first level, greyed out with why where it may not be taken', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(
      model({
        offers: [
          {
            id: 'horse',
            name: '馬',
            seats: [
              { seat: 'rider', refusal: 'needsSkill' },
              { seat: 'cargo', refusal: null },
            ],
          },
        ],
      }),
      true,
      handlers,
      t
    );
    const [front, load] = firstLevelOf(menu);

    expect(front.name).toBe('feature.ride.menu.on_rider:{"mount":"馬"}feature.ride.menu.refusal_needsSkill');
    expect(front.enabled).toBe(false);
    expect(load.enabled).toBe(true);
    load.action!();
    expect(handlers.getOn).toHaveBeenCalledWith('horse', 'cargo');
  });

  it('offers getting off the mount ridden at the first level, and making the piece a mount in the group', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(model({ riding: { mount: '馬', seat: 'rider' } }), true, handlers, t);

    expect(menu.map((entry) => entry.name)).toEqual([
      'feature.ride.menu.off:{"mount":"馬"}',
      'feature.ride.menu.title',
    ]);
    expect(entriesOf(menu).map((entry) => entry.name)).toEqual([
      '☐ feature.ride.menu.prone',
      '☐ feature.ride.menu.mountable',
    ]);
    menu[0].action!();
    entriesOf(menu)[1].action!();
    expect(handlers.getOff).toHaveBeenCalled();
    expect(handlers.setMountable).toHaveBeenCalledWith(true);
  });

  it('greys out getting on and off, with why, for a piece that has got on or off this turn', () => {
    const riding = buildRideContextMenu(
      model({ riding: { mount: '馬', seat: 'rider' }, changeRefusal: 'changedThisTurn' }),
      true,
      callbacks(),
      t
    );
    const walking = buildRideContextMenu(
      model({
        offers: [{ id: 'horse', name: '馬', seats: [{ seat: 'rider', refusal: null }] }],
        changeRefusal: 'changedThisTurn',
      }),
      true,
      callbacks(),
      t
    );

    expect(firstLevelOf(riding)[0].name).toBe(
      'feature.ride.menu.off:{"mount":"馬"}feature.ride.menu.refusal_changedThisTurn'
    );
    expect(firstLevelOf(riding)[0].enabled).toBe(false);
    expect(firstLevelOf(walking)[0].enabled).toBe(false);
  });

  it('says the piece has fallen over, and greys out getting up in the turn it fell in its own', () => {
    const handlers = callbacks();
    const fallen = buildRideContextMenu(model({ prone: { on: true, refusal: null } }), true, handlers, t);
    const justFallen = buildRideContextMenu(
      model({ prone: { on: true, refusal: 'fellThisTurn' } }),
      true,
      callbacks(),
      t
    );

    expect(entriesOf(fallen)[0].name).toBe('☑ feature.ride.menu.prone');
    entriesOf(fallen)[0].action!();
    expect(handlers.setProne).toHaveBeenCalledWith(false);
    expect(entriesOf(justFallen)[0].name).toBe('☑ feature.ride.menu.pronefeature.ride.menu.refusal_fellThisTurn');
    expect(entriesOf(justFallen)[0].enabled).toBe(false);
  });

  it('says how a mount is set up, and changes each part of it', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(
      model({ mount: { passenger: true, cargo: 2, anyone: false, seatHeight: null, aboard: 0 } }),
      true,
      handlers,
      t
    );
    const settings = entriesOf(menu).find((entry) => entry.name === 'feature.ride.menu.settings')!.subActions!;

    expect(settings[0].name).toBe('☑ feature.ride.menu.passenger');
    expect(settings[1].subActions!.find((entry) => entry.name.startsWith('✔'))?.name).toBe('✔ 2');
    expect(settings[3].subActions![0].name).toBe('✔ feature.ride.menu.seatHeightDefault');
    settings[0].action!();
    settings[1].subActions![0].action!();
    settings[2].action!();
    settings[3].subActions![3].action!();
    expect(handlers.setPassenger).toHaveBeenCalledWith(false);
    expect(handlers.setCargo).toHaveBeenCalledWith(0);
    expect(handlers.setAnyone).toHaveBeenCalledWith(true);
    expect(handlers.setSeatHeight).toHaveBeenCalledWith(1);
  });
});

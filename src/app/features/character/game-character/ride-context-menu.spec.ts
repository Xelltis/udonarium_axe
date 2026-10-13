import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import {
  buildRideContextMenu,
  RideMenuCallbacks,
  RideMenuEntries,
} from '@axe/features/character/game-character/ride-context-menu';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function callbacks(): RideMenuCallbacks & { [name: string]: ReturnType<typeof vi.fn> } {
  return {
    getOn: vi.fn(),
    getOff: vi.fn(),
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
const entriesOf = (menu: RideMenuEntries) =>
  menu.group.find((entry) => entry.name === 'feature.ride.menu.title')?.subActions ?? [];
/** The entries offered with working a move out. */
const firstLevelOf = (menu: RideMenuEntries) => menu.onAndOff;

describe('buildRideContextMenu', () => {
  it('offers nothing to somebody who may not change the table', () => {
    expect(buildRideContextMenu(model(), false, callbacks(), t)).toEqual({ onAndOff: [], group: [] });
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
              { seat: 'rider', refusal: 'needsSkill', getsUp: false },
              { seat: 'cargo', refusal: null, getsUp: false },
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

  it('offers getting off the mount ridden with the moves, and making the piece a mount in the group', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(model({ riding: { mount: '馬', seat: 'rider' } }), true, handlers, t);

    expect(menu.onAndOff.map((entry) => entry.name)).toEqual(['feature.ride.menu.off:{"mount":"馬"}']);
    expect(menu.group.map((entry) => entry.name)).toEqual(['feature.ride.menu.title']);
    expect(entriesOf(menu).map((entry) => entry.name)).toEqual(['☐ feature.ride.menu.mountable']);
    menu.onAndOff[0].action!();
    entriesOf(menu)[0].action!();
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
        offers: [{ id: 'horse', name: '馬', seats: [{ seat: 'rider', refusal: null, getsUp: false }] }],
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

  it('offers to get a piece lying where it fell up and onto a mount it may then take', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(
      model({
        offers: [
          {
            id: 'horse',
            name: '馬',
            seats: [
              { seat: 'rider', refusal: 'prone', getsUp: true },
              { seat: 'cargo', refusal: 'prone', getsUp: false },
            ],
          },
        ],
      }),
      true,
      handlers,
      t
    );
    const [front, load] = firstLevelOf(menu);

    expect(front.name).toBe('feature.ride.menu.upAndOn_rider:{"mount":"馬"}');
    expect(front.enabled).toBe(true);
    expect(load.name).toBe('feature.ride.menu.on_cargo:{"mount":"馬"}feature.ride.menu.refusal_prone');
    expect(load.enabled).toBe(false);
    front.action!();
    expect(handlers.getOn).toHaveBeenCalledWith('horse', 'rider');
  });

  it('says how a mount is set up, and changes each part of it', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(
      model({ mount: { passenger: true, cargo: 2, anyone: false, seatHeight: null, aboard: 0 } }),
      true,
      handlers,
      t
    );
    const settings = entriesOf(menu).slice(1);

    expect(entriesOf(menu)[0].name).toBe('☑ feature.ride.menu.mountable');
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

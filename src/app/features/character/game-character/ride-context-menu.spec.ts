import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { buildRideContextMenu, RideMenuCallbacks } from '@axe/features/character/game-character/ride-context-menu';

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
  return { riding: null, offers: [], mount: null, changeRefusal: null, ...more };
}

const entriesOf = (menu: ContextMenuAction[]) => menu[0]?.subActions ?? [];

describe('buildRideContextMenu', () => {
  it('offers nothing to somebody who may not change the table', () => {
    expect(buildRideContextMenu(model(), false, callbacks(), t)).toEqual([]);
  });

  it('offers each seat free on a mount at the point, greyed out with why where it may not be taken', () => {
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
    const [front, load] = entriesOf(menu);

    expect(front.name).toBe('feature.ride.menu.on_rider:{"mount":"馬"}feature.ride.menu.refusal_needsSkill');
    expect(front.enabled).toBe(false);
    expect(load.enabled).toBe(true);
    load.action!();
    expect(handlers.getOn).toHaveBeenCalledWith('horse', 'cargo');
  });

  it('offers getting off the mount ridden, and making the piece a mount', () => {
    const handlers = callbacks();
    const menu = buildRideContextMenu(model({ riding: { mount: '馬', seat: 'rider' } }), true, handlers, t);

    expect(entriesOf(menu).map((entry) => entry.name)).toEqual([
      'feature.ride.menu.off:{"mount":"馬"}',
      '☐ feature.ride.menu.mountable',
    ]);
    entriesOf(menu)[0].action!();
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

    expect(entriesOf(riding)[0].name).toBe(
      'feature.ride.menu.off:{"mount":"馬"}feature.ride.menu.refusal_changedThisTurn'
    );
    expect(entriesOf(riding)[0].enabled).toBe(false);
    expect(entriesOf(walking)[0].enabled).toBe(false);
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

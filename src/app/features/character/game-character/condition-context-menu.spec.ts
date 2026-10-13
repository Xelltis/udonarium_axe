import { ZoneMenuModel } from '@axe/application/tabletop/engagement-zone.service';
import { RideMenuModel } from '@axe/application/tabletop/ride.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import {
  buildConditionContextMenu,
  ConditionMenuCallbacks,
} from '@axe/features/character/game-character/condition-context-menu';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key);

function callbacks(): ConditionMenuCallbacks & { [name: string]: ReturnType<typeof vi.fn> } {
  return {
    setUnseen: vi.fn(),
    setDown: vi.fn(),
    setProne: vi.fn(),
    setHeld: vi.fn(),
  };
}

function zone(more: Partial<ZoneMenuModel> = {}): ZoneMenuModel {
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

function ride(more: Partial<RideMenuModel> = {}): RideMenuModel {
  return { riding: null, offers: [], mount: null, changeRefusal: null, prone: { on: false, refusal: null }, ...more };
}

/** The entries gathered under the group. */
function statesOf(menu: ContextMenuAction[]): ContextMenuAction[] {
  expect(menu.map((entry) => entry.name)).toEqual(['feature.character.contextMenu.conditionGroup']);
  return menu[0].subActions ?? [];
}

describe('buildConditionContextMenu', () => {
  it('offers nothing to somebody who may not change the table', () => {
    expect(buildConditionContextMenu(zone(), ride(), false, callbacks(), t)).toEqual([]);
  });

  it('says only whether the piece has fallen over where the room does not play zones', () => {
    const states = statesOf(buildConditionContextMenu(zone({ enabled: false }), ride(), true, callbacks(), t));

    expect(states.map((entry) => entry.name)).toEqual(['☐ feature.ride.menu.prone']);
  });

  it('ticks each state the piece is in, fallen over among them, and turns each one over', () => {
    const handlers = callbacks();
    const states = statesOf(
      buildConditionContextMenu(zone({ down: true }), ride({ prone: { on: true, refusal: null } }), true, handlers, t)
    );

    expect(states.map((entry) => entry.name)).toEqual([
      '☐ feature.zone.menu.unseen',
      '☑ feature.zone.menu.down',
      '☑ feature.ride.menu.prone',
      '☐ feature.zone.menu.held',
    ]);
    states.forEach((entry) => entry.action!());
    expect(handlers.setUnseen).toHaveBeenCalledWith(true);
    expect(handlers.setDown).toHaveBeenCalledWith(false);
    expect(handlers.setProne).toHaveBeenCalledWith(false);
    expect(handlers.setHeld).toHaveBeenCalledWith(true);
  });

  it('greys out getting up, with why, in the turn the piece fell over in its own', () => {
    const states = statesOf(
      buildConditionContextMenu(
        zone({ enabled: false }),
        ride({ prone: { on: true, refusal: 'fellThisTurn' } }),
        true,
        callbacks(),
        t
      )
    );

    expect(states[0].name).toBe('☑ feature.ride.menu.pronefeature.ride.menu.refusal_fellThisTurn');
    expect(states[0].enabled).toBe(false);
  });

  it('leaves holding on to an enemy to the fight', () => {
    const states = statesOf(
      buildConditionContextMenu(
        zone({ grabbedBy: { id: 'boss', name: '大蛇' }, grabbable: [{ id: 'cat', name: 'ねこ' }] }),
        ride(),
        true,
        callbacks(),
        t
      )
    );

    expect(states).toHaveLength(4);
  });
});

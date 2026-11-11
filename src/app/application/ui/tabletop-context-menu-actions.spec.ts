import {
  buildAltitudeAction,
  buildCopyAction,
  buildLockToggleAction,
  copyBeside,
} from '@axe/application/ui/tabletop-context-menu-actions';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { beMyself } from '@axe/testing/peer-context-stub';

const t = ((key: string) => key) as Parameters<typeof buildLockToggleAction>[2];

describe('buildLockToggleAction', () => {
  it('offers to unlock a locked object and does so', () => {
    let v = true;
    const action = buildLockToggleAction(true, (next) => (v = next), t);
    expect(action.name).toBe('feature.tabletop.contextMenu.unlock');
    action.action?.();
    expect(v).toBe(false);
  });

  it('offers to lock an unlocked object and does so', () => {
    let v = false;
    const action = buildLockToggleAction(false, (next) => (v = next), t);
    expect(action.name).toBe('feature.tabletop.contextMenu.lock');
    action.action?.();
    expect(v).toBe(true);
  });
});

describe('buildCopyAction', () => {
  function makeObj(): {
    obj: TabletopObject;
    cloneObj: { location: { x: number; y: number }; isLock?: boolean; update(): void };
    calls: { cloned: number; updated: number };
  } {
    const calls = { cloned: 0, updated: 0 };
    const cloneObj = {
      identifier: 'copy-1',
      location: { name: 'table', x: 100, y: 200 },
      isLock: true,
      update() {
        calls.updated += 1;
      },
    };
    const obj = {
      identifier: 'src',
      clone() {
        calls.cloned += 1;
        return cloneObj;
      },
    } as unknown as TabletopObject;
    return { obj, cloneObj, calls };
  }

  it('clones, offsets by a grid square and updates', () => {
    const { obj, cloneObj, calls } = makeObj();
    const action = buildCopyAction(obj, 50, t);
    action.action?.();
    expect(calls.cloned).toBe(1);
    expect(calls.updated).toBe(1);
    expect(cloneObj.location.x).toBe(150);
    expect(cloneObj.location.y).toBe(250);
  });

  it('lets afterClone change the copy before it is updated', () => {
    const { obj, cloneObj } = makeObj();
    const action = buildCopyAction(obj, 50, t, {
      afterClone: (c) => {
        (c as unknown as { isLock: boolean }).isLock = false;
      },
    });
    action.action?.();
    expect(cloneObj.isLock).toBe(false);
  });

  it('greys itself out for a die whose face a room server keeps from this user, and not with SkyWay', () => {
    beMyself('me');
    const die = DiceSymbol.create('ダイス', DiceType.D6, 1);
    die.owner = 'someone';
    try {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      expect(buildCopyAction(die, 50, t).enabled).toBe(false);

      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
      expect(buildCopyAction(die, 50, t).enabled).toBe(true);
    } finally {
      vi.restoreAllMocks();
      die.destroy();
    }
  });
});

describe('buildAltitudeAction()', () => {
  function target(overrides: Partial<TabletopObject> = {}) {
    return { altitude: 3, posZ: 40, isAltitudeIndicate: false, ...overrides } as unknown as TabletopObject;
  }

  it('returns both the altitude and the board offset to zero', () => {
    const piece = target();

    buildAltitudeAction(piece, t).subActions?.[0].action?.();

    expect(piece.altitude).toBe(0);
    expect(piece.posZ).toBe(0);
  });

  it('leaves the board offset alone when asked to keep it', () => {
    // A range area lies on the board and uses its offset for something other than height.
    const area = target();

    buildAltitudeAction(area, t, { keepPosZ: true }).subActions?.[0].action?.();

    expect(area.altitude).toBe(0);
    expect(area.posZ).toBe(40);
  });

  it('toggles the readout', () => {
    const piece = target({ isAltitudeIndicate: true } as Partial<TabletopObject>);
    const changed = vi.fn();

    const action = buildAltitudeAction(piece, t, { onChanged: changed });
    expect(action.subActions?.[1].name).toBe('feature.tabletop.contextMenu.altitudeShowOn');
    action.subActions?.[1].action?.();

    expect(piece.isAltitudeIndicate).toBe(false);
    expect(changed).toHaveBeenCalledOnce();
  });

  it('appends the entries only this object needs', () => {
    const action = buildAltitudeAction(target(), t, {
      extraActions: [{ name: '影', action: () => undefined }],
    });

    expect(action.subActions?.map((sub) => sub.name)).toContain('影');
  });
});

/**
 * Stands in for a piece's copy, which is made through its XML: happy-dom refuses the dotted attribute
 * names a piece is written with, so the copy is made by hand of what the test reads.
 */
function copiedByHand(piece: GameCharacter): void {
  vi.spyOn(piece, 'clone').mockImplementation(() => {
    const copy = GameCharacter.create(piece.name, 1, '');
    copy.ridingOn = piece.ridingOn;
    copy.rideSeat = piece.rideSeat;
    copy.location.name = piece.location.name;
    copy.location.x = piece.location.x;
    copy.location.y = piece.location.y;
    return copy as never;
  });
}

describe('copyBeside', () => {
  afterEach(() => {
    for (const piece of ObjectStore.instance.getObjects(GameCharacter)) ObjectStore.instance.delete(piece, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('copies the parts standing with a piece onto its copy, each where it stood against the piece', () => {
    const body = GameCharacter.create('竜', 3, '');
    body.location.x = 100;
    body.location.y = 100;
    body.setLocation('table');
    const arm = GameCharacter.create('腕', 1, '');
    arm.ridingOn = body.identifier;
    arm.rideSeat = 'part';
    arm.location.x = 150;
    arm.location.y = 125;
    arm.setLocation('table');
    copiedByHand(body);
    copiedByHand(arm);

    const copy = copyBeside(body, 50);

    const copiedParts = ObjectStore.instance
      .getObjects(GameCharacter)
      .filter((piece) => piece.ridingOn === copy.identifier);
    expect(copiedParts).toHaveLength(1);
    expect(copiedParts[0].rideSeat).toBe('part');
    expect(copiedParts[0].location).toMatchObject({ name: 'table', x: 200, y: 175 });
    expect(body.partsAlong()).toEqual([arm]);
  });
});

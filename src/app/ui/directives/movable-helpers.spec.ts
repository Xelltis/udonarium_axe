import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  applyPointerEvents,
  collectCollidableElements,
  MovableCoordinateResolver,
  MovableLayerItem,
  movedElsewhere,
  resolveMovableLocalCoordinate,
  setLayerCollidable,
} from '@axe/ui/directives/movable-helpers';

describe('movable-helpers', () => {
  describe('movedElsewhere', () => {
    it('is false without an object or a location', () => {
      expect(movedElsewhere(null, 0, 0, 0)).toBe(false);
      expect(movedElsewhere({} as TabletopObject, 0, 0, 0)).toBe(false);
    });

    it('is true when the positions differ', () => {
      const object = {
        location: { x: 1, y: 2 },
        posZ: 3,
      } as TabletopObject;
      expect(movedElsewhere(object, 0, 0, 0)).toBe(true);
    });

    it('is false when the positions match', () => {
      const object = {
        location: { x: 1, y: 2 },
        posZ: 3,
      } as TabletopObject;
      expect(movedElsewhere(object, 1, 2, 3)).toBe(false);
    });
  });

  describe('collectCollidableElements / applyPointerEvents', () => {
    it('returns only the root when the root itself collides', () => {
      const root = document.createElement('div');
      root.style.pointerEvents = 'auto';
      const result = collectCollidableElements(root);
      expect(result).toEqual([root]);
    });

    it('gathers from the children when the root does not collide', () => {
      const root = document.createElement('div');
      root.style.pointerEvents = 'none';
      const child = document.createElement('span');
      child.style.pointerEvents = 'auto';
      root.appendChild(child);
      const result = collectCollidableElements(root);
      expect(result).toEqual([child]);
    });

    it('applies pointer events to everything at once', () => {
      const a = document.createElement('div');
      const b = document.createElement('span');
      applyPointerEvents([a, b], false);
      expect(a.style.pointerEvents).toBe('none');
      expect(b.style.pointerEvents).toBe('none');
      applyPointerEvents([a, b], true);
      expect(a.style.pointerEvents).toBe('auto');
      expect(b.style.pointerEvents).toBe('auto');
    });
  });

  describe('setLayerCollidable', () => {
    interface FakeItem extends MovableLayerItem {
      pointerEvents: 'auto' | 'none' | null;
    }

    function makeItem(layerName: string, isGrabbing = false): FakeItem {
      const item: FakeItem = {
        layerName,
        input: { isGrabbing },
        pointerEvents: null,
        setPointerEvents(isEnable: boolean) {
          item.pointerEvents = isEnable ? 'auto' : 'none';
        },
      };
      return item;
    }

    it('passes pointer-events:none to its own layer while grabbed, so a sibling cannot cancel the drag', () => {
      const self = makeItem('terrain', true);
      const peerA = makeItem('terrain');
      const peerB = makeItem('terrain');
      const layerHash = { terrain: [self, peerA, peerB] };

      setLayerCollidable(layerHash, ['terrain'], self, true, true);

      expect(peerA.pointerEvents).toBe('none');
      expect(peerB.pointerEvents).toBe('none');
    });

    it('other layers outside the collision set get pointer-events:none while grabbed', () => {
      const self = makeItem('terrain', true);
      const character = makeItem('character');
      const layerHash = { terrain: [self], character: [character] };

      setLayerCollidable(layerHash, ['terrain'], self, true, true);

      expect(character.pointerEvents).toBe('none');
    });

    it('layers listed as collidable keep pointer-events:auto while grabbed, so collisions still register', () => {
      const self = makeItem('character', true);
      const terrain = makeItem('terrain');
      const layerHash = { character: [self], terrain: [terrain] };

      setLayerCollidable(layerHash, ['terrain'], self, true, true);

      // character is its own layer, so none; terrain is a collision target, so auto
      expect(terrain.pointerEvents).toBe('auto');
    });

    it('letting go restores pointer-events:auto everywhere', () => {
      const self = makeItem('terrain', false);
      const peer = makeItem('terrain');
      const character = makeItem('character');
      const layerHash = { terrain: [self, peer], character: [character] };

      setLayerCollidable(layerHash, ['terrain'], self, false, false);

      expect(peer.pointerEvents).toBe('auto');
      expect(character.pointerEvents).toBe('auto');
    });

    it('skips itself and anything already held elsewhere', () => {
      const self = makeItem('terrain', true);
      const otherGrabbing = makeItem('terrain', true);
      const layerHash = { terrain: [self, otherGrabbing] };

      setLayerCollidable(layerHash, ['terrain'], self, true, true);

      expect(otherGrabbing.pointerEvents).toBeNull();
    });
  });

  describe('resolveMovableLocalCoordinate', () => {
    const asked: string[] = [];
    const resolver: MovableCoordinateResolver = {
      convertToFace: (c, surface) => {
        asked.push(surface);
        return { x: c.x, y: c.y, z: 0 };
      },
    };

    beforeEach(() => asked.splice(0));

    it('on the floor it takes the supporting z under the pointer and rests on the terrain', () => {
      const contactSupportZ = (cx: number, cy: number) => (cx === 10 && cy === 20 ? 100 : 0);

      const result = resolveMovableLocalCoordinate(resolver, 'floor', { x: 10, y: 20, z: 0 }, contactSupportZ);

      expect(result).toEqual({ x: 10, y: 20, z: 100 });
      expect(asked).toEqual(['floor']);
    });

    it('a wall surface takes the same supporting z, stacking up the wall', () => {
      const contactSupportZ = (cx: number, cy: number) => (cx === 5 && cy === 6 ? 50 : 0);

      const result = resolveMovableLocalCoordinate(resolver, 'north-wall', { x: 5, y: 6, z: 0 }, contactSupportZ);

      expect(result).toEqual({ x: 5, y: 6, z: 50 });
      expect(asked).toEqual(['north-wall']);
    });

    it('with nothing supporting it, z is zero on floor and wall alike', () => {
      const contactSupportZ = () => 0;

      expect(resolveMovableLocalCoordinate(resolver, 'floor', { x: 1, y: 2, z: 0 }, contactSupportZ)).toEqual({
        x: 1,
        y: 2,
        z: 0,
      });
      expect(resolveMovableLocalCoordinate(resolver, 'north-wall', { x: 1, y: 2, z: 0 }, contactSupportZ)).toEqual({
        x: 1,
        y: 2,
        z: 0,
      });
    });
  });
});

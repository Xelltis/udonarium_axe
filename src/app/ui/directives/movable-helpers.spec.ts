import { GridType } from '@axe/domain/tabletop/game-table';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  applyPointerEvents,
  beamRestPosition,
  calcHexAllSnapPosition,
  calcHexBothSnapPosition,
  calcHexEdgeMidpointSnapPosition,
  calcHexSnapPosition,
  calcHexVertexSnapPosition,
  calcSnapNum,
  collectCollidableElements,
  ContactFootprint,
  ContactRider,
  dropTargetSurface,
  findContactSupportZ,
  MovableCoordinateResolver,
  MovableLayerItem,
  resolveMovableLocalCoordinate,
  setLayerCollidable,
  shouldTransitionTo,
  toTransformCss,
} from '@axe/ui/directives/movable-helpers';

describe('movable-helpers', () => {
  describe('calcSnapNum', () => {
    it('returns the value unchanged when the interval is zero or less', () => {
      expect(calcSnapNum(13, 0)).toBe(13);
      expect(calcSnapNum(13, -1)).toBe(13);
    });

    it('rounds a positive number to the grid', () => {
      expect(calcSnapNum(13, 25)).toBe(25);
      expect(calcSnapNum(36, 25)).toBe(25);
    });

    it('rounds a negative number to the grid', () => {
      expect(calcSnapNum(-13, 25)).toBe(-25);
      expect(calcSnapNum(-36, 25)).toBe(-25);
    });
  });

  describe('toTransformCss', () => {
    it('returns a translate3d string', () => {
      expect(toTransformCss(1, 2, 3, 'scale(2)')).toBe('translate3d(1px,2px,3px) scale(2)');
    });
  });

  describe('shouldTransitionTo', () => {
    it('is false without an object or a location', () => {
      expect(shouldTransitionTo(null, 0, 0, 0)).toBe(false);
      expect(shouldTransitionTo({} as TabletopObject, 0, 0, 0)).toBe(false);
    });

    it('is true when the positions differ', () => {
      const object = {
        location: { x: 1, y: 2 },
        posZ: 3,
      } as TabletopObject;
      expect(shouldTransitionTo(object, 0, 0, 0)).toBe(true);
    });

    it('is false when the positions match', () => {
      const object = {
        location: { x: 1, y: 2 },
        posZ: 3,
      } as TabletopObject;
      expect(shouldTransitionTo(object, 1, 2, 3)).toBe(false);
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

  describe('calcHexSnapPosition', () => {
    const gridSize = 50;
    const s = gridSize / Math.sqrt(3);

    describe('flat-top (HEX_VERTICAL)', () => {
      const colSpacing = 1.5 * s;

      it('snaps a point near the origin to the centre of hex (0,0)', () => {
        const result = calcHexSnapPosition(5, 5, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });

      it('snaps to the centre of column 1, which sits half a row down', () => {
        const cx = colSpacing;
        const cy = gridSize / 2;
        const result = calcHexSnapPosition(cx, cy, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(cx - gridSize / 2);
        expect(result.y).toBeCloseTo(cy - gridSize / 2);
      });

      it('snaps a point between two hexes to the nearer one', () => {
        const cx0 = 0;
        const cx1 = colSpacing;
        const midX = (cx0 + cx1) / 2 - 1;
        const result = calcHexSnapPosition(midX, 0, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(cx0 - gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });
    });

    describe('pointy-top (HEX_HORIZONTAL)', () => {
      const rowSpacing = 1.5 * s;

      it('snaps a point near the origin to the centre of hex (0,0)', () => {
        const result = calcHexSnapPosition(5, 5, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });

      it('snaps to the centre of row 1, which sits half a column across', () => {
        const cx = gridSize / 2;
        const cy = rowSpacing;
        const result = calcHexSnapPosition(cx, cy, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(cx - gridSize / 2);
        expect(result.y).toBeCloseTo(cy - gridSize / 2);
      });

      it('snaps a point between two hexes to the nearer one', () => {
        const cy0 = 0;
        const cy1 = rowSpacing;
        const midY = (cy0 + cy1) / 2 - 1;
        const result = calcHexSnapPosition(0, midY, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(cy0 - gridSize / 2);
      });
    });
  });

  describe('calcHexVertexSnapPosition', () => {
    const gridSize = 50;
    const s = gridSize / Math.sqrt(3);

    describe('flat-top (HEX_VERTICAL)', () => {
      it('snaps a point near the origin to a vertex rather than the cell centre', () => {
        // flat-top (0,0) hex center is at (0,0), vertex at angle 0 is at (s,0)
        const result = calcHexVertexSnapPosition(s, 0, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(s - gridSize / 2);
        expect(result.y).toBeCloseTo(0 - gridSize / 2);
      });

      it('snaps to the nearest vertex even from the cell centre', () => {
        // (0,0) hex center → nearest vertex is at distance s
        const result = calcHexVertexSnapPosition(0, 0, gridSize, GridType.HEX_VERTICAL);
        // Should snap to one of the 6 vertices of (0,0) hex, distance s from center
        const snappedCenterX = result.x + gridSize / 2;
        const snappedCenterY = result.y + gridSize / 2;
        const dist = Math.sqrt(snappedCenterX * snappedCenterX + snappedCenterY * snappedCenterY);
        expect(dist).toBeCloseTo(s);
      });
    });

    describe('pointy-top (HEX_HORIZONTAL)', () => {
      it('snaps a point near the origin to a vertex rather than the cell centre', () => {
        // pointy-top (0,0) hex center is at (0,0), vertex at angle -90° is at (0,-s)
        const result = calcHexVertexSnapPosition(0, -s, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(0 - gridSize / 2);
        expect(result.y).toBeCloseTo(-s - gridSize / 2);
      });

      it('snaps to the nearest vertex even from the cell centre', () => {
        const result = calcHexVertexSnapPosition(0, 0, gridSize, GridType.HEX_HORIZONTAL);
        const snappedCenterX = result.x + gridSize / 2;
        const snappedCenterY = result.y + gridSize / 2;
        const dist = Math.sqrt(snappedCenterX * snappedCenterX + snappedCenterY * snappedCenterY);
        expect(dist).toBeCloseTo(s);
      });
    });
  });

  describe('calcHexBothSnapPosition', () => {
    const gridSize = 50;

    it('snaps to the cell centre when nearest to it', () => {
      // (0,0) hex center → should snap to center
      const result = calcHexBothSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      const centerResult = calcHexSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(centerResult.x);
      expect(result.y).toBeCloseTo(centerResult.y);
    });

    it('snaps to a vertex when nearest to one', () => {
      const s = gridSize / Math.sqrt(3);
      // flat-top vertex at (s, 0) — very close to vertex
      const result = calcHexBothSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      const vertexResult = calcHexVertexSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(vertexResult.x);
      expect(result.y).toBeCloseTo(vertexResult.y);
    });
  });

  describe('calcHexEdgeMidpointSnapPosition', () => {
    const gridSize = 50;
    // inradius = gridSize / 2 = 25

    it('flat-top: snaps to the edge midpoint 30 degrees round', () => {
      // flat-top edge midpoint at 30 degrees: (inradius*cos30, inradius*sin30)
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexEdgeMidpointSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      expect(result.x + gridSize / 2).toBeCloseTo(mx);
      expect(result.y + gridSize / 2).toBeCloseTo(my);
    });

    it('pointy-top: snaps to the edge midpoint straight ahead', () => {
      // pointy-top edge midpoint at 0 degrees: (inradius, 0) = (25, 0)
      const inradius = gridSize / 2;
      const result = calcHexEdgeMidpointSnapPosition(inradius - 0.5, 0, gridSize, GridType.HEX_HORIZONTAL);
      expect(result.x + gridSize / 2).toBeCloseTo(inradius);
      expect(result.y + gridSize / 2).toBeCloseTo(0);
    });

    it('an edge midpoint lands one inradius from the cell centre', () => {
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexEdgeMidpointSnapPosition(mx, my, gridSize, GridType.HEX_VERTICAL);
      const cx = result.x + gridSize / 2;
      const cy = result.y + gridSize / 2;
      expect(Math.sqrt(cx * cx + cy * cy)).toBeCloseTo(inradius);
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

  describe('calcHexAllSnapPosition', () => {
    const gridSize = 50;

    it('snaps to the cell centre when nearest to it', () => {
      const result = calcHexAllSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      const centerResult = calcHexSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(centerResult.x);
      expect(result.y).toBeCloseTo(centerResult.y);
    });

    it('snaps to a vertex when nearest to one', () => {
      const s = gridSize / Math.sqrt(3);
      const result = calcHexAllSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      const vertexResult = calcHexVertexSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(vertexResult.x);
      expect(result.y).toBeCloseTo(vertexResult.y);
    });

    it('snaps to an edge midpoint when nearest to one', () => {
      // near the flat-top edge midpoint at 30 degrees
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexAllSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      const edgeResult = calcHexEdgeMidpointSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(edgeResult.x);
      expect(result.y).toBeCloseTo(edgeResult.y);
    });
  });

  describe('findContactSupportZ', () => {
    const footprints: ContactFootprint[] = [
      { left: 0, top: 0, right: 100, bottom: 100, bottomZ: 0, topZ: 50 },
      { left: 0, top: 0, right: 100, bottom: 100, bottomZ: 0, topZ: 150 },
      { left: 500, top: 500, right: 600, bottom: 600, bottomZ: 0, topZ: 999 },
    ];

    const block = (thicknessPx: number, bottomZ: number): ContactRider => ({
      altitudePx: 0,
      thicknessPx,
      ridesUp: false,
      bottomZ,
    });
    const token = (bottomZ: number): ContactRider => ({
      altitudePx: 0,
      thicknessPx: 0,
      ridesUp: true,
      bottomZ,
    });
    const cell = (x: number, y: number, bottomZ: number, topZ: number): ContactFootprint => ({
      left: x,
      top: y,
      right: x + 100,
      bottom: y + 100,
      bottomZ,
      topZ,
    });

    it('returns the highest top of the footprints under the centre', () => {
      expect(findContactSupportZ(footprints, 50, 50)).toBe(150);
    });

    it('returns zero, the floor, when no footprint covers it', () => {
      expect(findContactSupportZ(footprints, 300, 300)).toBe(0);
    });

    it('returns zero with no footprints at all', () => {
      expect(findContactSupportZ([], 50, 50)).toBe(0);
    });

    it('stays on the floor under a canopy tall enough to walk beneath', () => {
      const canopy = [cell(0, 0, 150, 200)];

      expect(findContactSupportZ(canopy, 50, 50, block(50, 0))).toBe(0);
      expect(findContactSupportZ(canopy, 50, 50, token(0))).toBe(0);
    });

    it('climbs a canopy the block is too tall to fit under', () => {
      const canopy = [cell(0, 0, 40, 90)];

      expect(findContactSupportZ(canopy, 50, 50, block(50, 0))).toBe(90);
    });

    it('fills a gap it matches exactly rather than climbing over it', () => {
      const canopy = [cell(0, 0, 50, 100)];

      expect(findContactSupportZ(canopy, 50, 50, block(50, 0))).toBe(0);
    });

    it('climbs onto a block standing on the floor, which leaves no room beneath', () => {
      const box = [cell(0, 0, 0, 50)];

      expect(findContactSupportZ(box, 50, 50, block(50, 0))).toBe(50);
      expect(findContactSupportZ(box, 50, 50, token(0))).toBe(50);
    });

    it('keeps what is already up on a canopy up there', () => {
      const canopy = [cell(0, 0, 150, 200)];

      expect(findContactSupportZ(canopy, 50, 50, token(200))).toBe(200);
      expect(findContactSupportZ(canopy, 50, 50, block(50, 200))).toBe(200);
    });

    it('drops what walks off a canopy onto the floor it left', () => {
      const canopy = [cell(0, 0, 150, 200)];

      expect(findContactSupportZ(canopy, 300, 300, token(200))).toBe(0);
    });

    it('lands on a deck when a pillar takes the ground under the pointer', () => {
      const bridge = [cell(0, 0, 0, 150), cell(0, 0, 150, 200)];

      expect(findContactSupportZ(bridge, 50, 50, block(50, 0))).toBe(200);
    });

    it('takes a canopy built at altitude as the height it keeps, not a floor to climb', () => {
      const canopy: ContactRider = { altitudePx: 150, thicknessPx: 50, ridesUp: false, bottomZ: 150 };

      expect(findContactSupportZ([], 50, 50, canopy)).toBe(0);
      expect(findContactSupportZ([cell(0, 0, 0, 200)], 50, 50, canopy)).toBe(200);
    });

    it('is not blocked by something flat lying on the floor', () => {
      const note = [cell(0, 0, 0, 0)];

      expect(findContactSupportZ(note, 50, 50, block(50, 0))).toBe(0);
    });
  });

  describe('beamRestPosition', () => {
    const box = { minX: 100, maxX: 200, minY: 0, maxY: 200, minZ: 450, maxZ: 500 };

    it('puts the centre under the cursor and z on top when the cursor is over the beam', () => {
      expect(beamRestPosition(box, 150, 100, 50, 50)).toEqual({ x: 125, y: 75, z: 500 });
    });

    it('clamps a cursor beyond the beam to its nearest edge', () => {
      // the floor projection lands inside the beam, at greater y, so it sticks to the maxY edge
      expect(beamRestPosition(box, 150, 600, 50, 50)).toEqual({ x: 125, y: 175, z: 500 });
    });
  });

  describe('resolveMovableLocalCoordinate', () => {
    function makeSurface(surface?: string): HTMLElement {
      const el = document.createElement('div');
      if (surface) el.dataset.surface = surface;
      return el;
    }

    const resolver: MovableCoordinateResolver = {
      convertToLocal: (c) => ({ x: c.x, y: c.y, z: 0 }),
    };

    it('on the floor it takes the supporting z under the pointer and rests on the terrain', () => {
      const floor = makeSurface('floor');
      const contactSupportZ = (cx: number, cy: number) => (cx === 10 && cy === 20 ? 100 : 0);

      const result = resolveMovableLocalCoordinate(resolver, floor, { x: 10, y: 20, z: 0 }, contactSupportZ);

      expect(result).toEqual({ x: 10, y: 20, z: 100 });
    });

    it('a wall surface takes the same supporting z, stacking up the wall', () => {
      const wall = makeSurface('north');
      const contactSupportZ = (cx: number, cy: number) => (cx === 5 && cy === 6 ? 50 : 0);

      const result = resolveMovableLocalCoordinate(resolver, wall, { x: 5, y: 6, z: 0 }, contactSupportZ);

      expect(result).toEqual({ x: 5, y: 6, z: 50 });
    });

    it('with nothing supporting it, z is zero on floor and wall alike', () => {
      const floor = makeSurface('floor');
      const wall = makeSurface('north');
      const contactSupportZ = () => 0;

      expect(resolveMovableLocalCoordinate(resolver, floor, { x: 1, y: 2, z: 0 }, contactSupportZ)).toEqual({
        x: 1,
        y: 2,
        z: 0,
      });
      expect(resolveMovableLocalCoordinate(resolver, wall, { x: 1, y: 2, z: 0 }, contactSupportZ)).toEqual({
        x: 1,
        y: 2,
        z: 0,
      });
    });
  });
});

describe('dropTargetSurface()', () => {
  function surfaceIn(parent: Element, name: string): HTMLElement {
    const surface = document.createElement('div');
    surface.dataset.surface = name;
    parent.appendChild(surface);
    return surface;
  }

  it('finds the face the pointer is over', () => {
    const table = document.createElement('div');
    const floor = surfaceIn(table, 'floor');
    const piece = document.createElement('div');
    floor.appendChild(piece);

    expect(dropTargetSurface(piece, floor)).toBe(floor);
  });

  it('reads the face off whatever the pointer actually landed on', () => {
    const table = document.createElement('div');
    const floor = surfaceIn(table, 'floor');
    const tile = document.createElement('span');
    floor.appendChild(tile);

    expect(dropTargetSurface(document.createElement('div'), tile)).toBe(floor);
  });

  it('will not lay a board on a face the board is carrying', () => {
    // Dragged, a board brings its own face under the pointer with it; taken at its word it
    // lands wherever its own corner happens to be, and leaps about the table.
    const board = document.createElement('div');
    const itsOwnFace = surfaceIn(board, 'board-identifier');

    expect(dropTargetSurface(board, itsOwnFace)).toBeNull();
  });

  it('says nothing where the pointer is over no face at all', () => {
    expect(dropTargetSurface(document.createElement('div'), null)).toBeNull();
    expect(dropTargetSurface(document.createElement('div'), document.createElement('div'))).toBeNull();
  });
});

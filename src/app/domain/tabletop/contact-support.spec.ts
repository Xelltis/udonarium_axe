import {
  beamRestPosition,
  ContactFootprint,
  contactRestLevels,
  ContactRider,
  findContactSupport,
  findContactSupportZ,
  nextContactLevel,
} from '@axe/domain/tabletop/contact-support';

describe('contact support', () => {
  describe('findContactSupportZ', () => {
    const footprints: ContactFootprint[] = [
      { left: 0, top: 0, right: 100, bottom: 100, bottomZ: 0, topZ: 50 },
      { left: 0, top: 0, right: 100, bottom: 100, bottomZ: 0, topZ: 150 },
      { left: 500, top: 500, right: 600, bottom: 600, bottomZ: 0, topZ: 999 },
    ];

    const block = (thicknessPx: number, restingZ: number): ContactRider => ({
      altitudePx: 0,
      thicknessPx,
      ridesUp: false,
      restingZ,
    });
    const token = (restingZ: number): ContactRider => ({
      altitudePx: 0,
      thicknessPx: 0,
      ridesUp: true,
      restingZ,
    });
    const cell = (x: number, y: number, bottomZ: number, topZ: number): ContactFootprint => ({
      left: x,
      top: y,
      right: x + 100,
      bottom: y + 100,
      bottomZ,
      topZ,
    });

    it('reads a turned footprint where it is turned to, about its middle', () => {
      // Two hundred by fifty, turned a quarter round: it runs 75 to 125 across and -75 to 125 down.
      const beam: ContactFootprint = { left: 0, top: 0, right: 200, bottom: 50, bottomZ: 0, topZ: 50, rotate: 90 };

      expect(findContactSupportZ([beam], 100, 100)).toBe(50);
      expect(findContactSupportZ([beam], 25, 25)).toBe(0);
    });

    describe('a piece dragged along the surface it is on', () => {
      /** A ramp 200px across, climbing to the north from the ground at its south edge. */
      const ramp: ContactFootprint = {
        left: 0,
        top: 0,
        right: 200,
        bottom: 200,
        bottomZ: 0,
        topZ: 100,
        identifier: 'ramp',
        topAt: (_x, y) => Math.max(0, 100 * (1 - y / 200)),
      };

      it('reads the surface where the piece is, not at its highest corner', () => {
        expect(findContactSupport([ramp], 100, 100, token(0)).z).toBeCloseTo(50);
        expect(findContactSupport([ramp], 100, 200, token(0)).z).toBeCloseTo(0);
      });

      it('says what the piece came to rest on', () => {
        expect(findContactSupport([ramp], 100, 100, token(0)).on).toBe('ramp');
      });

      it('climbs the ramp while the piece keeps to it, rather than dropping to the floor', () => {
        const onTheRamp: ContactRider = { ...token(50), restingOn: 'ramp' };

        expect(findContactSupport([ramp], 100, 50, onTheRamp).z).toBeCloseTo(75);
        expect(findContactSupport([ramp], 100, 150, onTheRamp).z).toBeCloseTo(25);
      });

      it('puts a piece dragged onto the ramp on its surface, which fills the space below', () => {
        expect(findContactSupport([ramp], 100, 50, token(0)).z).toBeCloseTo(75);
      });

      it('drops to the floor once the piece is dragged off the ramp', () => {
        const onTheRamp: ContactRider = { ...token(50), restingOn: 'ramp' };

        expect(findContactSupport([ramp], 300, 300, onTheRamp).z).toBe(0);
      });
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

    it('takes the level nearest the height the piece is already at', () => {
      const canopy = [cell(0, 0, 150, 200)];

      // Held just under the canopy, it steps up onto it; down near the floor, it stays down.
      expect(findContactSupportZ(canopy, 50, 50, token(160))).toBe(200);
      expect(findContactSupportZ(canopy, 50, 50, token(40))).toBe(0);
    });

    it('leaves a piece on the lower level where two are equally near', () => {
      const canopy = [cell(0, 0, 150, 200)];

      expect(findContactSupportZ(canopy, 50, 50, token(100))).toBe(0);
    });

    it('flies a piece kept above the ground under a deck rather than onto it', () => {
      const deck = [cell(0, 0, 140, 150)];
      const flier: ContactRider = { altitudePx: 100, thicknessPx: 0, ridesUp: true, restingZ: 0 };

      // Its feet are at 100 and the deck's top at 150, which is the nearer of the two, but the
      // height it is kept at is clearance: it passes under the deck and stays on the floor.
      expect(findContactSupportZ(deck, 50, 50, flier)).toBe(0);
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
      const canopy: ContactRider = { altitudePx: 150, thicknessPx: 50, ridesUp: false, restingZ: 150 };

      expect(findContactSupportZ([], 50, 50, canopy)).toBe(0);
      expect(findContactSupportZ([cell(0, 0, 0, 200)], 50, 50, canopy)).toBe(200);
    });

    it('is not blocked by something flat lying on the floor', () => {
      const note = [cell(0, 0, 0, 0)];

      expect(findContactSupportZ(note, 50, 50, block(50, 0))).toBe(0);
    });
  });

  describe('contactRestLevels', () => {
    const cell = (x: number, y: number, bottomZ: number, topZ: number): ContactFootprint => ({
      left: x,
      top: y,
      right: x + 100,
      bottom: y + 100,
      bottomZ,
      topZ,
    });
    const rider: ContactRider = { altitudePx: 0, thicknessPx: 50, ridesUp: false, restingZ: 0 };

    it('offers the floor and the roof of a rock hanging over it', () => {
      expect(contactRestLevels([cell(0, 0, 150, 200)], 50, 50, rider)).toEqual([0, 200]);
    });

    it('leaves out the floor a block on the ground has taken', () => {
      expect(contactRestLevels([cell(0, 0, 0, 50)], 50, 50, rider)).toEqual([50]);
    });

    it('offers the floor alone where nothing stands', () => {
      expect(contactRestLevels([cell(500, 500, 0, 50)], 50, 50, rider)).toEqual([0]);
    });

    it('counts a shared height once', () => {
      const twins = [cell(0, 0, 0, 50), cell(0, 0, 0, 50)];

      expect(contactRestLevels(twins, 50, 50, rider)).toEqual([50]);
    });
  });

  describe('nextContactLevel', () => {
    const levels = [0, 100, 250];

    it('goes up to the next height there is', () => {
      expect(nextContactLevel(levels, 0, true)).toBe(100);
      expect(nextContactLevel(levels, 100, true)).toBe(250);
    });

    it('goes down to the one below', () => {
      expect(nextContactLevel(levels, 250, false)).toBe(100);
      expect(nextContactLevel(levels, 100, false)).toBe(0);
    });

    it('has nowhere to go past either end', () => {
      expect(nextContactLevel(levels, 250, true)).toBeNull();
      expect(nextContactLevel(levels, 0, false)).toBeNull();
      expect(nextContactLevel([], 0, true)).toBeNull();
    });

    it('reads a height it is standing at as the one it is on, not one to step to', () => {
      expect(nextContactLevel([0, 100], 100.2, true)).toBeNull();
      expect(nextContactLevel([0, 100], 99.8, false)).toBe(0);
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
});

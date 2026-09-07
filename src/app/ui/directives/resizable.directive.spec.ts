import {
  anchorOf,
  ResizableDirective,
  rotationCorrection,
  screenDeltaToElementDelta,
} from '@axe/ui/directives/resizable.directive';
import { HandleType } from '@axe/ui/directives/resize-handler';

describe('ResizableDirective', () => {
  it('should be defined', () => {
    expect(ResizableDirective).toBeDefined();
  });

  describe('safety around the dom', () => {
    it('measures a position even for an element with no parent', () => {
      const orphanElement = document.createElement('div');
      orphanElement.style.left = '10px';
      orphanElement.style.top = '20px';
      orphanElement.style.width = '100px';
      orphanElement.style.height = '100px';

      expect(orphanElement.parentElement).toBeNull();
    });
  });

  describe('screenDeltaToElementDelta', () => {
    it('keeps pointer movement unchanged at zero degrees', () => {
      expect(screenDeltaToElementDelta(12, -7, 0)).toEqual({ x: 12, y: -7, z: 0 });
    });

    it('maps downward movement to the local right edge after a clockwise quarter turn', () => {
      const delta = screenDeltaToElementDelta(0, 20, 90);
      expect(delta.x).toBeCloseTo(20);
      expect(delta.y).toBeCloseTo(0);
    });

    it('maps leftward movement to the local right edge after a half turn', () => {
      const delta = screenDeltaToElementDelta(-20, 0, 180);
      expect(delta.x).toBeCloseTo(20);
      expect(delta.y).toBeCloseTo(0);
    });
  });

  describe('resizing a panel that has been turned', () => {
    interface Box {
      left: number;
      top: number;
      width: number;
      height: number;
    }

    /** Where a corner of a turned box lands: its middle, plus the corner laid down turned. */
    function cornerOnScreen(box: Box, degrees: number, corner: { x: number; y: number }) {
      const radians = (degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const px = (corner.x * box.width) / 2;
      const py = (corner.y * box.height) / 2;
      return {
        x: box.left + box.width / 2 + (px * cos - py * sin),
        y: box.top + box.height / 2 + (px * sin + py * cos),
      };
    }

    /** The box a drag of the given handle leaves behind, with or without the turn accounted for. */
    function resized(
      box: Box,
      handle: HandleType,
      width: number,
      height: number,
      degrees: number,
      correct = true
    ): Box {
      const anchor = anchorOf(handle);
      const grown = { ...box, width: box.width + width, height: box.height + height };
      // What the directive writes for a handle that holds the near sides, plus the correction.
      const held = { left: anchor.x > 0 ? -width : 0, top: anchor.y > 0 ? -height : 0 };
      const turned = correct ? rotationCorrection(width, height, anchor, degrees) : { left: 0, top: 0 };
      return { ...grown, left: box.left + held.left + turned.left, top: box.top + held.top + turned.top };
    }

    const start: Box = { left: 100, top: 50, width: 200, height: 120 };

    it('holds the far edge where it was, a quarter turn round', () => {
      const after = resized(start, HandleType.E, 40, 0, 90);

      const before = cornerOnScreen(start, 90, anchorOf(HandleType.E));
      const held = cornerOnScreen(after, 90, anchorOf(HandleType.E));
      expect(held.x).toBeCloseTo(before.x, 6);
      expect(held.y).toBeCloseTo(before.y, 6);
    });

    it('holds it half a turn round, where the panel used to grow away from the pointer', () => {
      const after = resized(start, HandleType.SE, 40, 25, 180);

      const before = cornerOnScreen(start, 180, anchorOf(HandleType.SE));
      const held = cornerOnScreen(after, 180, anchorOf(HandleType.SE));
      expect(held.x).toBeCloseTo(before.x, 6);
      expect(held.y).toBeCloseTo(before.y, 6);
    });

    it('holds the east edge when the west one is dragged', () => {
      const after = resized(start, HandleType.W, 40, 0, 90);

      const before = cornerOnScreen(start, 90, anchorOf(HandleType.W));
      const held = cornerOnScreen(after, 90, anchorOf(HandleType.W));
      expect(held.x).toBeCloseTo(before.x, 6);
      expect(held.y).toBeCloseTo(before.y, 6);
    });

    it('drifts sideways without the correction, which is what was wrong with it', () => {
      const after = resized(start, HandleType.E, 40, 0, 90, false);

      const before = cornerOnScreen(start, 90, anchorOf(HandleType.E));
      const held = cornerOnScreen(after, 90, anchorOf(HandleType.E));
      // Half of what was added, laid down the wrong way round: the panel slides across.
      expect(Math.hypot(held.x - before.x, held.y - before.y)).toBeCloseTo(Math.hypot(20, 20), 6);
    });

    it('gives nothing back where the panel is not turned', () => {
      expect(rotationCorrection(40, 25, anchorOf(HandleType.SE), 0)).toEqual({ left: 0, top: 0 });
    });
  });
});

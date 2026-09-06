import { ResizableDirective, screenDeltaToElementDelta } from '@axe/ui/directives/resizable.directive';

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
});

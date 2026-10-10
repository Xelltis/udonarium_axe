import { TestBed } from '@angular/core/testing';
import { BillboardFrameService } from '@axe/application/ui/billboard-frame.service';
import { TableViewRotation } from '@axe/application/ui/ui-signal.service';
import { beforeEach, describe, expect, it } from 'vitest';

/** A facing of the shape the pieces use: the camera's turn taken back out, and the piece's own with it. */
const facingOf =
  (pieceRotate: number) =>
  (rotation: TableViewRotation | null): string =>
    `rotateZ(${-pieceRotate}deg) rotateZ(${-(rotation?.z ?? 10)}deg) rotateX(${-(rotation?.x ?? 50)}deg)`;

describe('the register of what faces the camera', () => {
  let frame: BillboardFrameService;
  let element: HTMLElement;

  beforeEach(() => {
    frame = TestBed.inject(BillboardFrameService);
    element = document.createElement('div');
  });

  it('faces an element as it joins, before the camera has moved at all', () => {
    frame.register(element, facingOf(0));

    expect(element.style.transform).toBe(facingOf(0)(null));
  });

  it('writes what the transform would be worked out to at the turn it is given', () => {
    const turned: TableViewRotation = { x: 40, y: 0, z: -45 };
    frame.register(element, facingOf(15));

    frame.apply(turned);

    expect(element.style.transform).toBe(facingOf(15)(turned));
  });

  it('leaves the element alone when the turn works out to what it already wears', () => {
    frame.register(element, () => 'rotateZ(0deg)');
    frame.apply({ x: 50, y: 0, z: 10 });
    element.style.transform = 'touched by hand';

    frame.apply({ x: 50, y: 0, z: 90 });

    expect(element.style.transform).toBe('touched by hand');
  });

  it('writes nothing more once the element is off the register', () => {
    const release = frame.register(element, facingOf(0));
    frame.apply({ x: 40, y: 0, z: -45 });
    const parted = element.style.transform;

    release();
    frame.apply({ x: 10, y: 0, z: 120 });

    expect(element.style.transform).toBe(parted);
  });

  it('faces a latecomer the way the table already stands', () => {
    const turned: TableViewRotation = { x: 30, y: 0, z: 120 };
    frame.apply(turned);

    frame.register(element, facingOf(0));

    expect(element.style.transform).toBe(facingOf(0)(turned));
  });
});

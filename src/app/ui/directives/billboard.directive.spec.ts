import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BillboardFacing, BillboardFrameService } from '@axe/application/ui/billboard-frame.service';
import { BillboardDirective } from '@axe/ui/directives/billboard.directive';
import { makeBillboardTransform } from '@axe/ui/tabletop/billboard-transform';
import { beforeEach, describe, expect, it } from 'vitest';

@Component({
  imports: [BillboardDirective],
  template: `<div data-testid="label" [appBillboard]="facing()"></div>`,
})
class HostComponent {
  readonly facing = signal<BillboardFacing>((rotation) => `rotateZ(${-(rotation?.z ?? 10)}deg)`);
}

describe('an element kept facing the camera', () => {
  let frame: BillboardFrameService;

  beforeEach(() => {
    frame = TestBed.inject(BillboardFrameService);
  });

  function show() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const label = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="label"]')!;
    return { fixture, label };
  }

  it('is faced as it is laid out, and turned by the frame after that', async () => {
    const { fixture, label } = show();
    await fixture.whenStable();
    expect(label.style.transform).toBe('rotateZ(-10deg)');

    frame.apply({ x: 50, y: 0, z: 120 });

    expect(label.style.transform).toBe('rotateZ(-120deg)');
  });

  it('follows a new way of facing without waiting for the camera', async () => {
    const { fixture, label } = show();
    await fixture.whenStable();
    frame.apply({ x: 50, y: 0, z: 120 });

    fixture.componentInstance.facing.set((rotation) => `rotateX(${-(rotation?.z ?? 0)}deg)`);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(label.style.transform).toBe('rotateX(-120deg)');
  });

  it('wears the transform the billboard is worked out to, down to the last figure', async () => {
    const facing: BillboardFacing = (rotation) =>
      makeBillboardTransform({
        rotation,
        pieceRotate: 45,
        pieceRoll: 0,
        parentInverseRotation: 'rotateX(90deg)',
        verticalOffset3D: 30,
        mode2d: false,
      });
    const { fixture, label } = show();
    fixture.componentInstance.facing.set(facing);
    fixture.detectChanges();
    await fixture.whenStable();

    frame.apply({ x: 60, y: 20, z: 120 });

    expect(label.style.transform).toBe(facing({ x: 60, y: 20, z: 120 }));
  });

  it('is off the register once it is gone from the table', async () => {
    const { fixture, label } = show();
    await fixture.whenStable();
    const parted = label.style.transform;

    fixture.destroy();
    frame.apply({ x: 50, y: 0, z: 200 });

    expect(label.style.transform).toBe(parted);
  });
});

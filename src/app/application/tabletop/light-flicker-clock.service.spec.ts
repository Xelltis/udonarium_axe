import { TestBed } from '@angular/core/testing';
import { LightFlickerClockService } from '@axe/application/tabletop/light-flicker-clock.service';
import { describe, expect, it } from 'vitest';

describe('LightFlickerClockService', () => {
  it('draws the lights at the clock’s moment, at the one held while held, and at the clock’s again once let go', () => {
    const clock = TestBed.inject(LightFlickerClockService);
    const before = performance.now();
    expect(clock.now()).toBeGreaterThanOrEqual(before);
    expect(clock.held()).toBeNull();

    clock.hold(2000);
    expect(clock.now()).toBe(2000);
    expect(clock.held()).toBe(2000);

    clock.hold(null);
    expect(clock.now()).toBeGreaterThanOrEqual(before);
  });
});

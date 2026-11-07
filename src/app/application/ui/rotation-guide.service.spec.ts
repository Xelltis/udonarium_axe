import { TestBed } from '@angular/core/testing';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RotationGuideService', () => {
  let guide: RotationGuideService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    guide = TestBed.inject(RotationGuideService);
  });

  it('holds no turn until one is reported', () => {
    expect(guide.turn()).toBeNull();
  });

  it('holds the turn last reported, and lets it go when the one turning ends it', () => {
    const turning = {};
    guide.report(turning, { angle: 45, step: 45, snapping: true });

    expect(guide.turn()).toEqual({ angle: 45, step: 45, snapping: true });

    guide.end(turning);
    expect(guide.turn()).toBeNull();
  });

  it('keeps a turn under way when something else ends one', () => {
    const turning = {};
    guide.report(turning, { angle: 10, step: 45, snapping: false });

    guide.end({});

    expect(guide.turn()?.angle).toBe(10);
  });
});

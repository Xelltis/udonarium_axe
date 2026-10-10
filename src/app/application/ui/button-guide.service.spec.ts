import { TestBed } from '@angular/core/testing';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';

describe('ButtonGuideService', () => {
  function service(): ButtonGuideService {
    TestBed.resetTestingModule();
    return TestBed.inject(ButtonGuideService);
  }

  it('starts put away', () => {
    expect(service().shown()).toBe(false);
  });

  it('is shown, put away and turned over on request', () => {
    const guide = service();

    guide.show();
    expect(guide.shown()).toBe(true);
    guide.show();
    expect(guide.shown()).toBe(true);
    guide.hide();
    expect(guide.shown()).toBe(false);
    guide.toggle();
    expect(guide.shown()).toBe(true);
    guide.toggle();
    expect(guide.shown()).toBe(false);
  });
});

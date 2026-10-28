import { TestBed } from '@angular/core/testing';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';

describe('BattleCutInPreferenceService', () => {
  const WINDOW_KEY = 'axe.battle.window';

  function service(): BattleCutInPreferenceService {
    TestBed.resetTestingModule();
    return TestBed.inject(BattleCutInPreferenceService);
  }

  beforeEach(() => localStorage.removeItem(WINDOW_KEY));
  afterEach(() => localStorage.removeItem(WINDOW_KEY));

  it('draws the stage over the whole screen until told otherwise', () => {
    expect(service().stageWindow().size).toBe('full');
  });

  it('steps the stage down into a window, keeps where it was dragged, and takes both up again next time', () => {
    const preference = service();

    preference.cycleStageSize();
    preference.cycleStageSize();
    preference.placeStageWindow(0.2, 0.6);

    expect(preference.stageWindow()).toEqual({ size: 'medium', x: 0.2, y: 0.6 });
    expect(service().stageWindow()).toEqual({ size: 'medium', x: 0.2, y: 0.6 });
  });

  it('chooses a size outright, keeping the place the window had', () => {
    const preference = service();
    preference.placeStageWindow(0, 1);

    preference.setStageSize('small');

    expect(preference.stageWindow()).toEqual({ size: 'small', x: 0, y: 1 });
  });
});

import { TestBed } from '@angular/core/testing';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';

describe('PieceOverlayPreferenceService', () => {
  const STORAGE_KEY = 'ui-piece-overlay';

  function service(): PieceOverlayPreferenceService {
    TestBed.resetTestingModule();
    return TestBed.inject(PieceOverlayPreferenceService);
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('starts with the resource bars and the buffs shown', () => {
    const overlay = service();

    expect(overlay.resourceBars()).toBe(true);
    expect(overlay.buffs()).toBe(true);
  });

  it('hides one without the other, and shows it again', () => {
    const overlay = service();

    overlay.toggleResourceBars();
    expect(overlay.resourceBars()).toBe(false);
    expect(overlay.buffs()).toBe(true);

    overlay.toggleBuffs();
    overlay.toggleResourceBars();
    expect(overlay.resourceBars()).toBe(true);
    expect(overlay.buffs()).toBe(false);
  });

  it('keeps the choice for the next session', () => {
    service().toggleBuffs();

    expect(service().buffs()).toBe(false);
    expect(service().resourceBars()).toBe(true);
  });

  it.each([
    ['nothing JSON can read', 'hidden'],
    ['something that is not an object', '7'],
    ['switches that are not false', JSON.stringify({ resourceBars: 'false', buffs: 0 })],
  ])('shows both when it finds %s', (_what, stored) => {
    localStorage.setItem(STORAGE_KEY, stored);
    const overlay = service();

    expect(overlay.resourceBars()).toBe(true);
    expect(overlay.buffs()).toBe(true);
  });

  it('still switches for this session in a browser that will not keep it', () => {
    const overlay = service();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });

    expect(() => overlay.toggleResourceBars()).not.toThrow();
    expect(overlay.resourceBars()).toBe(false);
  });
});

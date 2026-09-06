import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_TABLETOP_DISPLAY_SETTINGS,
  normalizeTabletopDisplaySettings,
  TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY,
  TabletopDisplaySettingsService,
} from '@axe/application/ui/tabletop-display-settings.service';
import { GameTable } from '@axe/domain/tabletop/game-table';

describe('TabletopDisplaySettingsService', () => {
  beforeEach(() => {
    localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY));

  it('starts disabled with the existing tabletop-display defaults', () => {
    expect(TestBed.inject(TabletopDisplaySettingsService).settings()).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
  });

  it('normalizes untrusted values', () => {
    expect(
      normalizeTabletopDisplaySettings({
        enabled: true,
        cutInMultiDirectionMode: 'diagonal',
        hoverDetailPlacement: 'somewhere',
        radialMenuEnabled: true,
        radialMenuRotationSpeed: 99,
        multiAngleEnabled: true,
        multiAngleResourceBuffEnabled: true,
        multiAngleMotionMode: 'quarter-turn',
        multiAngleRevolutionSeconds: -2,
        multiAnglePauseSeconds: 50,
        multiAnglePieceRevolutionSeconds: Number.NaN,
        multiAngleTickerEnabled: true,
        multiAngleTickerPixelsPerSecond: 5,
        multiAngleFontScale: 'huge',
      })
    ).toEqual({
      enabled: true,
      cutInMultiDirectionMode: 'none',
      hoverDetailPlacement: 'piece',
      radialMenuEnabled: true,
      radialMenuRotationSpeed: 24,
      multiAngleEnabled: true,
      multiAngleResourceBuffEnabled: true,
      multiAngleMotionMode: 'quarter-turn',
      multiAngleRevolutionSeconds: 1,
      multiAnglePauseSeconds: 30,
      multiAnglePieceRevolutionSeconds: 60,
      multiAngleTickerEnabled: true,
      multiAngleTickerPixelsPerSecond: 20,
      multiAngleFontScale: 'small',
    });
  });

  it('persists a patch for the next service instance', () => {
    const service = TestBed.inject(TabletopDisplaySettingsService);
    service.patch({ enabled: true, radialMenuRotationSpeed: 9, multiAngleFontScale: 'large' });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const restored = TestBed.inject(TabletopDisplaySettingsService);

    expect(restored.enabled()).toBe(true);
    expect(restored.radialMenuRotationSpeed()).toBe(9);
    expect(restored.multiAngleFontScale()).toBe('large');
  });

  it('does not update a synchronized table when a local setting changes', () => {
    const table = new GameTable('unrelated-shared-table');
    table.initialize();
    const version = table.version;

    TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: true, radialMenuEnabled: true });

    expect(table.version).toBe(version);
    table.destroy();
  });

  it('falls back from malformed JSON', () => {
    localStorage.setItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY, '{broken');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TabletopDisplaySettingsService).settings()).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
  });

  it('falls back when storage cannot be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TabletopDisplaySettingsService).settings()).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
    getItem.mockRestore();
  });

  it('keeps the session value when storage cannot be written', () => {
    const service = TestBed.inject(TabletopDisplaySettingsService);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    expect(() => service.patch({ enabled: true })).not.toThrow();
    expect(service.enabled()).toBe(true);
    setItem.mockRestore();
  });
});

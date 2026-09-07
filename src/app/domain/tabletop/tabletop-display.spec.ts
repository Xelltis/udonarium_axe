import { DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND } from '@axe/domain/tabletop/multi-angle';
import {
  DEFAULT_TABLETOP_DISPLAY_SETTINGS,
  normalizeTabletopDisplayOwn,
  normalizeTabletopDisplaySettings,
  resolveTabletopDisplay,
} from '@axe/domain/tabletop/tabletop-display';

describe('the way a flat table is drawn', () => {
  it('answers with the quiet defaults for a table that carries none of it', () => {
    expect(normalizeTabletopDisplaySettings({})).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
    expect(normalizeTabletopDisplaySettings(null)).toEqual(DEFAULT_TABLETOP_DISPLAY_SETTINGS);
  });

  it('reads what an older room wrote down as text', () => {
    const settings = normalizeTabletopDisplaySettings({
      multiAngleEnabled: 'true',
      orthographicProjection: 'false',
      multiAngleTickerPixelsPerSecond: '90',
    });

    expect(settings.multiAngleEnabled).toBe(true);
    expect(settings.orthographicProjection).toBe(false);
    expect(settings.multiAngleTickerPixelsPerSecond).toBe(90);
  });

  it('takes an empty attribute as never having been asked, rather than as nothing per second', () => {
    const settings = normalizeTabletopDisplaySettings({
      multiAngleTickerPixelsPerSecond: '',
      multiAngleRevolutionSeconds: '',
      radialMenuRotationSpeed: '',
    });

    expect(settings.multiAngleTickerPixelsPerSecond).toBe(DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND);
    expect(settings.multiAngleRevolutionSeconds).toBe(DEFAULT_TABLETOP_DISPLAY_SETTINGS.multiAngleRevolutionSeconds);
    expect(settings.radialMenuRotationSpeed).toBe(DEFAULT_TABLETOP_DISPLAY_SETTINGS.radialMenuRotationSpeed);
  });

  it('holds a speed to what the screen can be read at', () => {
    expect(
      normalizeTabletopDisplaySettings({ multiAngleTickerPixelsPerSecond: 9000 }).multiAngleTickerPixelsPerSecond
    ).toBe(240);
    expect(normalizeTabletopDisplaySettings({ radialMenuRotationSpeed: 0 }).radialMenuRotationSpeed).toBe(1);
    expect(normalizeTabletopDisplaySettings({ radialMenuRotationSpeed: 7.6 }).radialMenuRotationSpeed).toBe(8);
    expect(normalizeTabletopDisplaySettings({ multiAnglePauseSeconds: -3 }).multiAnglePauseSeconds).toBe(0);
  });

  it('reads a way of moving it does not know as turning steadily', () => {
    expect(normalizeTabletopDisplaySettings({ multiAngleMotionMode: 'tumbling' }).multiAngleMotionMode).toBe(
      'continuous'
    );
    expect(normalizeTabletopDisplaySettings({ multiAngleMotionMode: 'quarter-turn' }).multiAngleMotionMode).toBe(
      'quarter-turn'
    );
  });
});

describe('what one screen has been told', () => {
  it('answers with what it holds, and leaves the rest to the table', () => {
    const table = { multiAngleEnabled: true, radialMenuEnabled: true, multiAngleTickerEnabled: true };

    const resolved = resolveTabletopDisplay(table, { radialMenuEnabled: false });

    expect(resolved.radialMenuEnabled).toBe(false);
    expect(resolved.multiAngleEnabled).toBe(true);
    expect(resolved.multiAngleTickerEnabled).toBe(true);
  });

  it('keeps only what it was actually told, and nothing that is not a setting', () => {
    const own = normalizeTabletopDisplayOwn({
      multiAngleTickerEnabled: true,
      multiAngleTickerPixelsPerSecond: 100,
      hoisted: 'nonsense',
    });

    expect(own).toEqual({ multiAngleTickerEnabled: true, multiAngleTickerPixelsPerSecond: 100 });
  });

  it('reads a value it cannot use as never having been told it', () => {
    expect(normalizeTabletopDisplayOwn({ multiAngleTickerPixelsPerSecond: '' })).toEqual({
      multiAngleTickerPixelsPerSecond: DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND,
    });
    expect(normalizeTabletopDisplayOwn({})).toEqual({});
    expect(normalizeTabletopDisplayOwn('what')).toEqual({});
  });

  it('hands the table back everything once the screen is emptied', () => {
    const table = { multiAngleEnabled: true };

    expect(resolveTabletopDisplay(table, {}).multiAngleEnabled).toBe(true);
  });
});

import { DEFAULT_MULTI_ANGLE_TICKER_PIXELS_PER_SECOND } from '@axe/domain/tabletop/multi-angle';
import {
  DEFAULT_TABLETOP_DISPLAY_SETTINGS,
  normalizeTabletopDisplayOverride,
  normalizeTabletopDisplaySettings,
  overridesSection,
  pickSection,
  resolveTabletopDisplay,
  TABLETOP_DISPLAY_SECTION_NAMES,
  TABLETOP_DISPLAY_SECTIONS,
  withoutSection,
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

describe('a reader taking a feature over', () => {
  it('leaves every other feature to the table', () => {
    const table = { multiAngleEnabled: true, radialMenuEnabled: true, multiAngleTickerEnabled: true };
    const override = pickSection(normalizeTabletopDisplaySettings({ radialMenuEnabled: false }), 'menus');

    const resolved = resolveTabletopDisplay(table, override);

    expect(resolved.radialMenuEnabled).toBe(false);
    expect(resolved.multiAngleEnabled).toBe(true);
    expect(resolved.multiAngleTickerEnabled).toBe(true);
  });

  it('knows which features it speaks for, and hands one back', () => {
    const override = pickSection(normalizeTabletopDisplaySettings({ multiAngleEnabled: true }), 'pieceLabels');

    expect(overridesSection(override, 'pieceLabels')).toBe(true);
    expect(overridesSection(override, 'ticker')).toBe(false);
    expect(overridesSection(withoutSection(override, 'pieceLabels'), 'pieceLabels')).toBe(false);
  });

  it('keeps only the features it holds every setting of', () => {
    const override = normalizeTabletopDisplayOverride({
      multiAngleTickerEnabled: true,
      multiAngleTickerPixelsPerSecond: 100,
      radialMenuEnabled: true,
      hoisted: 'nonsense',
    });

    expect(override).toEqual({ multiAngleTickerEnabled: true, multiAngleTickerPixelsPerSecond: 100 });
  });

  it('carries nothing over from a record that has been emptied', () => {
    expect(normalizeTabletopDisplayOverride({})).toEqual({});
    expect(normalizeTabletopDisplayOverride('what')).toEqual({});
  });
});

describe('the features a reader chooses between', () => {
  it('names every setting exactly once', () => {
    const named = TABLETOP_DISPLAY_SECTION_NAMES.flatMap((section) => [...TABLETOP_DISPLAY_SECTIONS[section]]);

    expect(new Set(named).size).toBe(named.length);
    expect([...named].sort()).toEqual(Object.keys(DEFAULT_TABLETOP_DISPLAY_SETTINGS).sort());
  });
});

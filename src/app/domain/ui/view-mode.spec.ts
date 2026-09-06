import {
  asViewMode,
  DEFAULT_VIEW_MODE,
  laysFlat,
  nextViewMode,
  VIEW_MODES,
  viewModeIcon,
  viewModeLabelKey,
} from '@axe/domain/ui/view-mode';

describe('how a reader looks at the table', () => {
  it('follows the table until the reader says otherwise', () => {
    expect(DEFAULT_VIEW_MODE).toBe('auto');
    expect(laysFlat('auto', true)).toBe(true);
    expect(laysFlat('auto', false)).toBe(false);
  });

  it('lets the reader overrule what the table recommends, either way', () => {
    expect(laysFlat('flat', false)).toBe(true);
    expect(laysFlat('perspective', true)).toBe(false);
  });

  it('reads something it does not know as no choice at all', () => {
    expect(asViewMode('sideways')).toBeNull();
    expect(asViewMode('flat')).toBe('flat');
  });

  it('comes back round to where it started', () => {
    let mode = DEFAULT_VIEW_MODE;
    const seen = VIEW_MODES.map(() => (mode = nextViewMode(mode)));

    expect(new Set(seen).size).toBe(VIEW_MODES.length);
    expect(mode).toBe(DEFAULT_VIEW_MODE);
  });

  it('says which view auto has settled on, and names an explicit choice outright', () => {
    expect(viewModeLabelKey('auto', true)).toBe('app.fab.viewAutoFlat');
    expect(viewModeLabelKey('auto', false)).toBe('app.fab.viewAutoPerspective');
    expect(viewModeLabelKey('flat', false)).toBe('app.fab.viewFlat');
    expect(viewModeLabelKey('perspective', true)).toBe('app.fab.viewPerspective');
  });

  it('marks the control as following the table, and otherwise shows the view in force', () => {
    expect(viewModeIcon('auto', true)).toBe('hdr_auto');
    expect(viewModeIcon('flat', true)).toBe('grid_view');
    expect(viewModeIcon('perspective', false)).toBe('view_in_ar');
  });
});

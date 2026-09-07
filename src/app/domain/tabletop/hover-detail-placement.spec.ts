import {
  asHoverDetailPlacement,
  DEFAULT_HOVER_DETAIL_PLACEMENT,
  HOVER_DETAIL_PLACEMENTS,
} from '@axe/domain/tabletop/hover-detail-placement';

describe('hover detail placement', () => {
  it('keeps a known placement', () => {
    expect(asHoverDetailPlacement('piece')).toBe('piece');
    expect(asHoverDetailPlacement('screen-edges')).toBe('screen-edges');
  });

  it('falls back to the piece placement for anything else', () => {
    expect(asHoverDetailPlacement('corners')).toBe(DEFAULT_HOVER_DETAIL_PLACEMENT);
    expect(asHoverDetailPlacement(undefined)).toBe(DEFAULT_HOVER_DETAIL_PLACEMENT);
    expect(asHoverDetailPlacement(4)).toBe(DEFAULT_HOVER_DETAIL_PLACEMENT);
  });

  it('offers exactly the two placements, starting with the one tables already use', () => {
    expect(HOVER_DETAIL_PLACEMENTS).toEqual(['piece', 'screen-edges']);
    expect(DEFAULT_HOVER_DETAIL_PLACEMENT).toBe('piece');
  });
});

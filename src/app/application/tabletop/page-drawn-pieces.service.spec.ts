import { TestBed } from '@angular/core/testing';
import { PageDrawnPiecesService } from '@axe/application/tabletop/page-drawn-pieces.service';

describe('PageDrawnPiecesService', () => {
  it('tells which pieces the page draws itself until they are handed back', () => {
    const pages = TestBed.inject(PageDrawnPiecesService);

    pages.draw('die', true);
    expect(pages.drawsItself('die')).toBe(true);
    expect(pages.drawsItself('coin')).toBe(false);

    pages.draw('die', false);
    expect(pages.drawsItself('die')).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';

describe('ToolbarFoldService', () => {
  const STORAGE_KEY = 'ui-toolbars';

  function service(): ToolbarFoldService {
    TestBed.resetTestingModule();
    return TestBed.inject(ToolbarFoldService);
  }

  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.restoreAllMocks();
  });

  it('starts with both toolbars open', () => {
    const folds = service();

    expect(folds.isFolded('pl')).toBe(false);
    expect(folds.isFolded('gm')).toBe(false);
  });

  it('folds one toolbar without the other, and opens it again', () => {
    const folds = service();

    folds.toggle('gm');
    expect(folds.isFolded('gm')).toBe(true);
    expect(folds.isFolded('pl')).toBe(false);

    folds.toggle('gm');
    expect(folds.isFolded('gm')).toBe(false);
  });

  it('keeps a fold for the next session', () => {
    service().toggle('pl');

    expect(service().isFolded('pl')).toBe(true);
    expect(service().isFolded('gm')).toBe(false);
  });

  it.each([
    ['nothing JSON can read', 'folded'],
    ['something that is not an object', '42'],
    ['folds that are not true or false', JSON.stringify({ pl: 'true', gm: 1 })],
  ])('leaves both open when it finds %s', (_what, stored) => {
    localStorage.setItem(STORAGE_KEY, stored);
    const folds = service();

    expect(folds.isFolded('pl')).toBe(false);
    expect(folds.isFolded('gm')).toBe(false);
  });

  it('still folds for this session in a browser that will not keep it', () => {
    const folds = service();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refused');
    });

    expect(() => folds.toggle('pl')).not.toThrow();
    expect(folds.isFolded('pl')).toBe(true);
  });
});

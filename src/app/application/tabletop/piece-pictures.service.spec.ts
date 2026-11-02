import { TestBed } from '@angular/core/testing';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PiecePicturesService', () => {
  let pictures: PiecePicturesService;
  let revoked: string[];

  beforeEach(() => {
    revoked = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url));
    pictures = TestBed.inject(PiecePicturesService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('holds the latest picture of a piece, and lets go of the one before it', () => {
    pictures.show('note', { url: 'blob:first', widthPx: 100, heightPx: 50 });
    pictures.show('note', { url: 'blob:second', widthPx: 100, heightPx: 60 });

    expect(pictures.pictureOf('note')).toEqual({ url: 'blob:second', widthPx: 100, heightPx: 60 });
    expect(revoked).toEqual(['blob:first']);
  });

  it('lets go of a piece’s picture once the piece is gone', () => {
    pictures.show('note', { url: 'blob:first', widthPx: 100, heightPx: 50 });

    pictures.forget('note');

    expect(pictures.pictureOf('note')).toBeNull();
    expect(revoked).toEqual(['blob:first']);
  });
});

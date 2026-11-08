import { computed } from '@angular/core';
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

  it('wakes only what reads the piece whose picture is taken, from before it has one', () => {
    let runs = 0;
    const note = computed(() => {
      runs++;
      return pictures.pictureOf('note')?.url ?? null;
    });
    expect(note()).toBeNull();

    pictures.show('mask', { url: 'blob:mask', widthPx: 10, heightPx: 10 });
    expect(note()).toBeNull();
    expect(runs).toBe(1);

    pictures.show('note', { url: 'blob:note', widthPx: 10, heightPx: 10 });
    expect(note()).toBe('blob:note');
    pictures.forget('note');
    expect(note()).toBeNull();
    expect(runs).toBe(3);
  });

  it('counts a picture as being taken until it is, or until taking it fails', async () => {
    let finish!: (picture: Blob) => void;
    const taken = pictures.whileTaking(new Promise<Blob>((resolve) => (finish = resolve)));
    const failed = pictures.whileTaking(Promise.reject(new Error('no picture')));
    expect(pictures.taking()).toBe(2);

    await failed.catch(() => undefined);
    expect(pictures.taking()).toBe(1);
    finish(new Blob());
    await taken;
    expect(pictures.taking()).toBe(0);
  });
});

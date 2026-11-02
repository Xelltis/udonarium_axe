import { TestBed } from '@angular/core/testing';
import { TextNoteFacesService } from '@axe/application/tabletop/text-note-faces.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TextNoteFacesService', () => {
  let faces: TextNoteFacesService;
  let revoked: string[];

  beforeEach(() => {
    revoked = [];
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => revoked.push(url));
    faces = TestBed.inject(TextNoteFacesService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('holds the latest picture of a note’s panel, and lets go of the one before it', () => {
    faces.show('note', { url: 'blob:first', widthPx: 100, heightPx: 50 });
    faces.show('note', { url: 'blob:second', widthPx: 100, heightPx: 60 });

    expect(faces.faceOf('note')).toEqual({ url: 'blob:second', widthPx: 100, heightPx: 60 });
    expect(revoked).toEqual(['blob:first']);
  });

  it('lets go of a note’s picture once the note is gone', () => {
    faces.show('note', { url: 'blob:first', widthPx: 100, heightPx: 50 });

    faces.forget('note');

    expect(faces.faceOf('note')).toBeNull();
    expect(revoked).toEqual(['blob:first']);
  });
});

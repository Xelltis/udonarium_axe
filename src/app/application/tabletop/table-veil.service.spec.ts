import { TestBed } from '@angular/core/testing';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { describe, expect, it } from 'vitest';

describe('TableVeilService', () => {
  it('counts a picture the darkness is drawn with as loading until it is said to have come, once however often it is said', () => {
    const veil = TestBed.inject(TableVeilService);
    const first = veil.pictureLoading();
    const second = veil.pictureLoading();
    expect(veil.loadingPictures()).toBe(2);

    first();
    first();
    expect(veil.loadingPictures()).toBe(1);
    second();
    expect(veil.loadingPictures()).toBe(0);
  });
});

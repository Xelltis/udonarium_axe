import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import {
  PART_PICTURE_DRAWER,
  type PartLookToDraw,
  PiecePartPicturesService,
} from '@axe/application/tabletop/piece-part-pictures.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { writePartLayer } from '@axe/domain/character/part-look';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PiecePartPicturesService', () => {
  let pictures: PiecePartPicturesService;
  let drawn: { own: string; looks: readonly PartLookToDraw[] }[];
  let finish: (() => void)[];

  beforeEach(() => {
    drawn = [];
    finish = [];
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: PART_PICTURE_DRAWER,
          useValue: (own: string, looks: readonly PartLookToDraw[]) => {
            drawn.push({ own, looks });
            const at = drawn.length;
            return new Promise((resolve) =>
              finish.push(() => resolve({ url: `blob:drawn-${at}`, width: 100, height: 200 }))
            );
          },
        },
      ],
    });
    pictures = TestBed.inject(PiecePartPicturesService);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    for (const identifier of ['dragon', 'head']) ImageStorage.instance.delete(identifier);
  });

  function picture(identifier: string): string {
    ImageStorage.instance.add({
      identifier,
      name: `${identifier}.png`,
      type: 'image/png',
      blob: null,
      url: `blob:${identifier}`,
      thumbnail: { type: '', blob: null, url: '' },
    });
    return identifier;
  }

  function bodyWithPart(): { body: GameCharacter; part: GameCharacter } {
    const body = GameCharacter.create('ドラゴン', 2, picture('dragon'));
    body.setLocation('table');
    const part = GameCharacter.create('頭', 1, picture('head'));
    part.setLocation('table');
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    return { body, part };
  }

  it('draws nothing of its own for a piece whose parts lay nothing over its picture', async () => {
    const { body } = bodyWithPart();

    expect(pictures.pictureOf(body)).toBeNull();
    expect(drawn).toEqual([]);
  });

  it('draws the body’s picture with its parts once, and again only as they change, keeping the last meanwhile', async () => {
    const { body, part } = bodyWithPart();
    part.partLayer = writePartLayer({ x: 0.5, y: 0.2, width: 0.3, order: 1 });

    expect(pictures.pictureOf(body)).toBeNull();
    expect(drawn).toHaveLength(1);
    expect(drawn[0].looks[0]).toMatchObject({ layer: { x: 0.5, y: 0.2, width: 0.3, order: 1 }, lost: false });
    finish[0]();
    await Promise.resolve();
    await Promise.resolve();
    expect(pictures.pictureOf(body)).toEqual({ url: 'blob:drawn-1', width: 100, height: 200 });
    expect(drawn).toHaveLength(1);

    part.downed = '1';
    TestBed.inject(ObjectChangeService).notifyChanged(part.identifier);
    expect(pictures.pictureOf(body)?.url).toBe('blob:drawn-1');
    expect(drawn).toHaveLength(2);
    expect(drawn[1].looks[0].lost).toBe(true);
    finish[1]();
    await Promise.resolve();
    await Promise.resolve();
    expect(pictures.pictureOf(body)?.url).toBe('blob:drawn-2');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:drawn-1');
  });

  it('hears of a part made after the piece was first drawn, as the drawing of the piece asks for it', () => {
    const body = GameCharacter.create('ドラゴン', 2, picture('dragon'));
    body.setLocation('table');
    const head = GameCharacter.create('頭', 1, picture('head'));
    head.setLocation('table');
    const shown = computed(() => pictures.pictureOf(body));

    expect(shown()).toBeNull();
    head.ridingOn = body.identifier;
    head.rideSeat = 'part';
    head.partLayer = writePartLayer({ x: 0.5, y: 0.2, width: 0.3, order: 1 });
    TestBed.inject(ObjectChangeService).notifyChanged(head.identifier);
    shown();

    expect(drawn).toHaveLength(1);
  });
});

import { TestBed } from '@angular/core/testing';
import { PiecePartPickService } from '@axe/application/tabletop/piece-part-pick.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { emptyPartMask, paintPartMask, writePartLayer, writePartMask } from '@axe/domain/character/part-look';
import type { PickHit } from '@axe/domain/tabletop/pick/pick-index';
import type { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('PiecePartPickService', () => {
  let service: PiecePartPickService;
  let dragon: GameCharacter;
  let head: GameCharacter;
  let chest: GameCharacter;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(PiecePartPickService);
    dragon = GameCharacter.create('ドラゴン', 2, '');
    dragon.setLocation('table');
    head = GameCharacter.create('頭', 1, '');
    chest = GameCharacter.create('胸', 1, '');
    for (const part of [head, chest]) {
      part.setLocation('table');
      part.ridingOn = dragon.identifier;
      part.rideSeat = 'part';
    }
    head.partLayer = writePartLayer({ x: 0.5, y: 0.2, width: 0.2, order: 1 });
    chest.partMask = writePartMask(paintPartMask(emptyPartMask(10), 0.5, 0.7, 0.4, true));
    const sprite = (id: string, owner: string) => ({ id, owner, widthPx: 100, heightPx: 100 }) as TableWorldSprite;
    vi.spyOn(TestBed.inject(TablePiecesService), 'sprites').mockReturnValue([
      sprite(`${dragon.identifier}#pedestal`, dragon.identifier),
      sprite(`${dragon.identifier}#picture`, dragon.identifier),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pressing(id: string, shapeIndex: number, u: number, v: number): void {
    vi.spyOn(TestBed.inject(TablePickService), 'pressedAt').mockReturnValue({
      target: { id },
      shapeIndex,
      u,
      v,
    } as unknown as PickHit);
  }

  it('finds the part a press on the body’s picture lands on, laid over it or painted on it', () => {
    pressing(dragon.identifier, 1, 0.5, 0.2);
    expect(service.partAt(dragon, 0, 0)).toBe(head);

    pressing(dragon.identifier, 1, 0.5, 0.7);
    expect(service.partAt(dragon, 0, 0)).toBe(chest);

    pressing(dragon.identifier, 1, 0.05, 0.05);
    expect(service.partAt(dragon, 0, 0)).toBeNull();
  });

  it('finds none where the press lands on the pedestal, on another piece, or on a part that is lost', () => {
    pressing(dragon.identifier, 0, 0.5, 0.2);
    expect(service.partAt(dragon, 0, 0)).toBeNull();

    pressing('somebody', 1, 0.5, 0.2);
    expect(service.partAt(dragon, 0, 0)).toBeNull();

    head.downed = '1';
    pressing(dragon.identifier, 1, 0.5, 0.2);
    expect(service.partAt(dragon, 0, 0)).toBeNull();
  });

  it('finds the part a press on the body’s model lands on by the face it lands on, and none lost', () => {
    head.partFaces = '0:5-9;2:1';
    const face = vi.spyOn(TestBed.inject(Table3dService), 'modelFaceAt');

    face.mockReturnValue({ owner: dragon.identifier, mesh: 0, triangle: 7 });
    expect(service.partAt(dragon, 0, 0)).toBe(head);
    face.mockReturnValue({ owner: dragon.identifier, mesh: 2, triangle: 3 });
    expect(service.partAt(dragon, 0, 0)).toBeNull();
    head.downed = '1';
    face.mockReturnValue({ owner: dragon.identifier, mesh: 0, triangle: 7 });
    expect(service.partAt(dragon, 0, 0)).toBeNull();
  });
});

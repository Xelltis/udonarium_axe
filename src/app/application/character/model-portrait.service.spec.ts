import { TestBed } from '@angular/core/testing';
import { ModelPortraitService } from '@axe/application/character/model-portrait.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { portraitPicturesOf } from '@axe/domain/character/character-portrait';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelPortraitService', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }));
  afterEach(() => vi.restoreAllMocks());

  it('holds the picture taken here and has the piece show it, keeping the portraits it had', async () => {
    const piece = GameCharacter.create('騎士', 1, 'first');
    vi.spyOn(TestBed.inject(ImageStorage), 'addAsync').mockResolvedValue({ identifier: 'taken' } as never);

    const added = await TestBed.inject(ModelPortraitService).addShown(piece, new Blob(['x']), '3Dモデル');

    expect(added).toBe(true);
    expect(portraitPicturesOf(piece)).toEqual(['first', 'taken']);
    piece.destroy();
  });

  it('adds nothing where the picture could not be held', async () => {
    const piece = GameCharacter.create('騎士', 1, 'first');
    vi.spyOn(TestBed.inject(ImageStorage), 'addAsync').mockResolvedValue(null);

    expect(await TestBed.inject(ModelPortraitService).addShown(piece, new Blob(['x']), '')).toBe(false);
    expect(portraitPicturesOf(piece)).toEqual(['first']);
    piece.destroy();
  });
});

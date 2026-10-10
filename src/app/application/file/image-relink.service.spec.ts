import { TestBed } from '@angular/core/testing';
import { ImageRelinkService } from '@axe/application/file/image-relink.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ImageRelinkService', () => {
  const old = ImageFile.createEmpty('a'.repeat(64));
  const next = ImageFile.createEmpty('b'.repeat(64));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  function service(): ImageRelinkService {
    return TestBed.inject(ImageRelinkService);
  }

  function portraitOf(character: GameCharacter): unknown {
    return character.imageDataElement?.getFirstElementByName('imageIdentifier')?.value;
  }

  it('shows the new picture wherever the old one was shown, in a field or in the data of a sheet', () => {
    const character = GameCharacter.create('コマ', 1, old.identifier);
    const table = new GameTable();
    table.initialize();
    table.backgroundImageIdentifier = old.identifier;

    const changed = service().replace(old, next);

    expect(portraitOf(character)).toBe(next.identifier);
    expect(table.backgroundImageIdentifier).toBe(next.identifier);
    expect(changed).toBeGreaterThanOrEqual(2);
  });

  it('leaves what was said in the chat as it was said', () => {
    const message = new ChatMessage();
    message.initialize();
    message.imageIdentifier = old.identifier;

    service().replace(old, next);

    expect(message.imageIdentifier).toBe(old.identifier);
  });

  it('leaves an identifier the old one is only part of alone', () => {
    const table = new GameTable();
    table.initialize();
    table.backgroundImageIdentifier = `${old.identifier}_copy`;

    service().replace(old, next);

    expect(table.backgroundImageIdentifier).toBe(`${old.identifier}_copy`);
  });

  it('hands the tag over to the new picture and puts the old one out of the list', () => {
    const tag = ImageTag.create(old.identifier);
    tag.tag = '背景';
    tag.isSecret = true;

    service().replace(old, next);

    expect(ImageTag.get(next.identifier).tag).toBe('背景');
    expect(ImageTag.get(next.identifier).isSecret).toBe(true);
    expect(ImageTag.get(old.identifier).tag).toBe(SYSTEM_RESERVED_TAG);
  });

  it('leaves the tag and keeping back of a picture already filed alone when the edit comes out as it', () => {
    const oldTag = ImageTag.create(old.identifier);
    oldTag.tag = '敵';
    oldTag.isSecret = false;
    const nextTag = ImageTag.create(next.identifier);
    nextTag.tag = '伏せ札';
    nextTag.isSecret = true;

    service().replace(old, next);

    expect(ImageTag.get(next.identifier).tag).toBe('伏せ札');
    expect(ImageTag.get(next.identifier).isSecret).toBe(true);
    expect(ImageTag.get(old.identifier).tag).toBe(SYSTEM_RESERVED_TAG);
  });

  it('does nothing when the picture comes out the same', () => {
    const character = GameCharacter.create('コマ', 1, old.identifier);

    expect(service().replace(old, old)).toBe(0);
    expect(portraitOf(character)).toBe(old.identifier);
  });
});

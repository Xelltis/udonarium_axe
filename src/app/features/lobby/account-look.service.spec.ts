import { TestBed } from '@angular/core/testing';
import { hasChosenIconByHand, noteIconChosenByHand } from '@axe/core/storage/icon-chosen-by-hand';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_CURSOR_IMAGE_IDENTIFIER, DEFAULT_CURSOR_NAME, PeerCursor } from '@axe/domain/peer/peer-cursor';
import { AccountLook, AccountLookService } from '@axe/features/lobby/account-look.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AccountLookService', () => {
  const AVATAR = 'https://cdn.discordapp.com/avatars/1/a.png';
  const KAI: AccountLook = { userId: 'acct_1', name: 'Kai', avatarUrl: null };
  let look: AccountLookService;
  let cursor: PeerCursor;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    look = TestBed.inject(AccountLookService);
    cursor = PeerCursor.createMyCursor();
    cursor.name = DEFAULT_CURSOR_NAME;
    cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
    vi.spyOn(TestBed.inject(ImageStorage), 'add').mockImplementation((url) => ({ identifier: url }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEYS.iconChosenByHand);
    for (const held of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor))
      ObjectStore.instance.delete(held, false);
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.myCursor = null!;
  });

  it('lends the name and the avatar to a cursor still at its defaults, and takes both back', () => {
    look.lend({ ...KAI, avatarUrl: AVATAR });
    expect(cursor.name).toBe('Kai');
    expect(cursor.imageIdentifier).toBe(AVATAR);

    look.takeBack();
    expect(cursor.name).toBe(DEFAULT_CURSOR_NAME);
    expect(cursor.imageIdentifier).toBe(DEFAULT_CURSOR_IMAGE_IDENTIFIER);
  });

  it('leaves a name and an icon the reader chose, and notes the icon as chosen by hand', () => {
    cursor.name = 'わたし';
    cursor.imageIdentifier = 'my-icon';

    look.lend({ ...KAI, avatarUrl: AVATAR });
    look.takeBack();

    expect(cursor.name).toBe('わたし');
    expect(cursor.imageIdentifier).toBe('my-icon');
    expect(hasChosenIconByHand(KAI.userId)).toBe(true);
  });

  it('keeps what the reader changed after it was lent', () => {
    look.lend({ ...KAI, avatarUrl: AVATAR });
    cursor.name = '改名';

    look.takeBack();

    expect(cursor.name).toBe('改名');
    expect(cursor.imageIdentifier).toBe(DEFAULT_CURSOR_IMAGE_IDENTIFIER);
  });

  it('moves what it lent straight on to another account', () => {
    const other = 'https://cdn.discordapp.com/avatars/2/b.png';
    look.lend({ ...KAI, avatarUrl: AVATAR });

    look.lend({ userId: 'acct_2', name: 'Mio', avatarUrl: other });

    expect(cursor.name).toBe('Mio');
    expect(cursor.imageIdentifier).toBe(other);
  });

  it('keeps the account’s own avatar where it is the icon, and puts none on a default icon once one was chosen by hand', () => {
    look.lend({ ...KAI, avatarUrl: AVATAR });
    noteIconChosenByHand(KAI.userId);

    look.lend({ ...KAI, avatarUrl: AVATAR });
    expect(cursor.imageIdentifier).toBe(AVATAR);

    cursor.imageIdentifier = DEFAULT_CURSOR_IMAGE_IDENTIFIER;
    look.lend({ ...KAI, avatarUrl: AVATAR });
    expect(cursor.imageIdentifier).toBe(DEFAULT_CURSOR_IMAGE_IDENTIFIER);
  });

  it('does nothing before the seat has a cursor', () => {
    PeerCursor.myCursor = null!;

    expect(() => look.lend(KAI)).not.toThrow();
    expect(() => look.takeBack()).not.toThrow();
  });
});

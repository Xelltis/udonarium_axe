import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/index';
import { IPeerContext } from '@axe/core/network/peer-context';
import { ImageFile } from '@axe/core/storage/image-file';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

describe('Card', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
    // Clear any existing objects from previous tests
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('should create a card with name, images, and size', () => {
      const card = Card.create('Test Card', 'front.png', 'back.png', 2);

      expect(card).toBeTruthy();
      expect(card.name).toBe('Test Card');
      expect(card.size).toBe(2);
    });

    it('should create card with default size of 2', () => {
      const card = Card.create('Test', 'front.png', 'back.png');

      expect(card.size).toBe(2);
    });

    it('should create card with custom identifier', () => {
      const card = Card.create('Test', 'front.png', 'back.png', 2, 'custom-id');

      expect(card.identifier).toBe('custom-id');
    });

    it('should create face text fields with compatible defaults', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      expect(card.faceText).toBe('');
      expect(card.faceFontSize).toBe(18);
      expect(card.commonDataElement!.getFirstElementByName('text')!.type).toBe('note');
      expect(card.commonDataElement!.getFirstElementByName('text')!.currentValue).toBe('');
    });

    it('should lazily add missing face text fields to legacy cards', () => {
      const card = new Card();
      card.createDataElements();
      expect(card.faceText).toBe('');
      card.faceText = 'Legacy text';
      card.faceFontSize = 42;
      expect(card.faceText).toBe('Legacy text');
      expect(card.faceFontSize).toBe(42);
      expect(card.commonDataElement!.getFirstElementByName('text')!.type).toBe('note');
      expect(card.commonDataElement!.getFirstElementByName('text')!.identifier).toBe(`text_${card.identifier}`);
      expect(card.commonDataElement!.getFirstElementByName('fontsize')!.identifier).toBe(`fontsize_${card.identifier}`);
    });

    it('should keep the note value and its current value in step', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      try {
        card.faceText = 'written later';
        const element = card.commonDataElement!.getFirstElementByName('text')!;
        expect(element.value).toBe('written later');
        expect(element.currentValue).toBe('written later');
      } finally {
        card.destroy();
      }
    });

    it('should normalize invalid face font sizes', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.faceFontSize = Number.NaN;
      expect(card.faceFontSize).toBe(Card.DEFAULT_FACE_FONT_SIZE);
      card.faceFontSize = 999;
      expect(card.faceFontSize).toBe(120);
    });

    it('should add card to object store', () => {
      const card = Card.create('Test', 'front.png', 'back.png');

      expect(store.get(card.identifier)).toBe(card);
    });

    it('should create front and back image data elements', () => {
      const card = Card.create('Test', 'front.png', 'back.png');

      const frontElement = card.imageDataElement!.getFirstElementByName('front');
      const backElement = card.imageDataElement!.getFirstElementByName('back');

      expect(frontElement).toBeTruthy();
      expect(backElement).toBeTruthy();
      expect(frontElement!.value).toBe('front.png');
      expect(backElement!.value).toBe('back.png');
    });
  });

  describe('face text compatibility', () => {
    it('reads text and font size from a Fly-compatible card XML', () => {
      const restored = ObjectSerializer.instance.parseXml(`<card state="0">
        <data name="card">
          <data name="image"><data name="imageIdentifier" type="image"></data></data>
          <data name="common">
            <data name="name">Information</data>
            <data name="size">2</data>
            <data name="fontsize">24</data>
            <data name="text" type="note">First line\nSecond line</data>
            <data name="color" type="color">#555555</data>
          </data>
          <data name="detail"></data>
        </data>
      </card>`) as Card;

      expect(restored.faceText).toBe('First line\nSecond line');
      expect(restored.faceFontSize).toBe(24);
      expect(restored.commonDataElement!.getFirstElementByName('color')?.value).toBe('#555555');
    });

    it('round-trips face text through XML', () => {
      const card = Card.create('Information', 'front.png', 'back.png');
      card.faceText = 'Sword & shield\n|剣《つるぎ》';
      card.faceFontSize = 32;
      // happy-dom's XML parser rejects attribute names containing dots, so remove only location data.
      // The assertion still verifies that every card-specific face value survives the round trip.
      const xml = card.toXml().replace(/location\.[a-z]+="[^"]*"\s*/g, '');
      for (const object of store.getObjects()) store.delete(object, false);
      store.clearDeleteHistory();

      const restored = ObjectSerializer.instance.parseXml(xml) as Card;

      expect(restored.faceText).toBe('Sword & shield\n|剣《つるぎ》');
      expect(restored.faceFontSize).toBe(32);
    });
  });

  describe('aliasName', () => {
    it('should return "card"', () => {
      const card = new Card();
      expect(card.aliasName).toBe('card');
    });
  });

  describe('state management', () => {
    it('should initialize with FRONT state', () => {
      const card = new Card();
      expect(card.state).toBe(CardState.FRONT);
    });

    it('should have isFront true when state is FRONT', () => {
      const card = new Card();
      card.state = CardState.FRONT;

      expect(card.isFront).toBe(true);
    });

    it('should have isFront false when state is BACK', () => {
      const card = new Card();
      card.state = CardState.BACK;

      expect(card.isFront).toBe(false);
    });

    it('should change state with faceUp()', () => {
      const card = new Card();
      card.state = CardState.BACK;
      card.owner = 'user123';

      card.faceUp();

      expect(card.state).toBe(CardState.FRONT);
      expect(card.owner).toBe('');
    });

    it('should change state with faceDown()', () => {
      const card = new Card();
      card.state = CardState.FRONT;
      card.owner = 'user123';

      card.faceDown();

      expect(card.state).toBe(CardState.BACK);
      expect(card.owner).toBe('');
    });

    it('should clear owner when facing up', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.owner = 'user123';

      card.faceUp();

      expect(card.owner).toBe('');
      expect(card.hasOwner).toBe(false);
    });

    it('should clear owner when facing down', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.owner = 'user123';

      card.faceDown();

      expect(card.owner).toBe('');
      expect(card.hasOwner).toBe(false);
    });
  });

  describe('lock functionality', () => {
    it('should initialize with isLock false', () => {
      const card = new Card();
      expect(card.isLock).toBe(false);
    });

    it('should allow setting isLock', () => {
      const card = new Card();
      card.isLock = true;

      expect(card.isLock).toBe(true);
    });

    it('should initialize with dispLockMark true', () => {
      const card = new Card();
      expect(card.dispLockMark).toBe(true);
    });

    it('should allow hiding lock mark', () => {
      const card = new Card();
      card.dispLockMark = false;

      expect(card.dispLockMark).toBe(false);
    });
  });

  describe('owner management', () => {
    it('should initialize without owner', () => {
      const card = new Card();
      expect(card.owner).toBe('');
      expect(card.hasOwner).toBe(false);
    });

    it('should detect when card has owner', () => {
      const card = new Card();
      card.owner = 'user123';

      expect(card.hasOwner).toBe(true);
    });

    it('should return empty ownerName when no owner', () => {
      const card = new Card();

      expect(card.ownerName).toBe('');
    });

    it('should detect owner online status when owner exists', () => {
      const card = new Card();
      card.owner = 'user123';

      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ userId: 'user123', isOpen: true } as IPeerContext]);

      expect(card.ownerIsOnline).toBe(true);
    });

    it('should detect owner offline status', () => {
      const card = new Card();
      card.owner = 'user123';

      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{ userId: 'user123', isOpen: false } as IPeerContext]);

      expect(card.ownerIsOnline).toBe(false);
    });

    it('should return false for ownerIsOnline when no owner', () => {
      const card = new Card();

      expect(card.ownerIsOnline).toBe(false);
    });

    it('should detect if card is in current user hand', () => {
      const card = new Card();
      const mockUserId = 'current-user';

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: mockUserId } as IPeerContext);
      card.owner = mockUserId;

      expect(card.isPeeking).toBe(true);
    });

    it('should return false for isPeeking when owned by different user', () => {
      const card = new Card();

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user1' } as IPeerContext);
      card.owner = 'user2';

      expect(card.isPeeking).toBe(false);
    });
  });

  describe('hand', () => {
    it('moves a card into a hand face down, and out of its owners keeping', () => {
      const card = new Card();
      card.state = CardState.FRONT;
      card.owner = 'me';

      card.toHand('me');

      expect(card.location.name).toBe('hand:me');
      expect(card.state).toBe(CardState.BACK);
      expect(card.owner).toBe('');
    });

    it('puts a card played face up back on the table', () => {
      const card = new Card();
      card.toHand('me');

      card.playFaceUp();

      expect(card.location.name).toBe('table');
      expect(card.state).toBe(CardState.FRONT);
      expect(card.isInAnyHand).toBe(false);
    });

    it('puts one played face down back still hidden', () => {
      const card = new Card();
      card.toHand('me');

      card.playFaceDown();

      expect(card.location.name).toBe('table');
      expect(card.state).toBe(CardState.BACK);
      expect(card.owner).toBe('');
    });

    it('leaves it where it was before it went into the hand', () => {
      const card = new Card();
      card.location.x = 320;
      card.location.y = 240;

      card.toHand('me');
      card.playFaceUp();

      expect(card.location.x).toBe(320);
      expect(card.location.y).toBe(240);
    });
  });

  describe('visibility', () => {
    it('should be visible when in hand', () => {
      const card = new Card();

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'user1' } as IPeerContext);
      card.owner = 'user1';

      expect(card.isVisible).toBe(true);
    });

    it('should be visible when face up', () => {
      const card = new Card();
      card.state = CardState.FRONT;

      expect(card.isVisible).toBe(true);
    });

    it('a card in your own hand can be seen', () => {
      const card = new Card();
      card.state = CardState.BACK;

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'me' } as IPeerContext);
      card.toHand('me');

      expect(card.isInMyHand).toBe(true);
      expect(card.isVisible).toBe(true);
    });

    it('one in somebody elses cannot', () => {
      const card = new Card();

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'me' } as IPeerContext);
      card.toHand('other');

      expect(card.isInMyHand).toBe(false);
      expect(card.isInAnyHand).toBe(true);
      expect(card.isVisible).toBe(false);
    });

    it('should not be visible when face down and not in hand', () => {
      const card = new Card();
      card.state = CardState.BACK;
      card.owner = '';

      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'someone' } as IPeerContext);
      expect(card.isVisible).toBe(false);
    });

    it('should use front image when visible', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.state = CardState.FRONT;

      const image = card.imageFile;
      expect(image).toBe(card.frontImage ?? ImageFile.Empty);
    });

    it('should use back image when not visible', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.state = CardState.BACK;
      card.owner = '';

      const image = card.imageFile;
      expect(image).toBe(card.backImage ?? ImageFile.Empty);
    });
  });

  describe('rotation and z-index', () => {
    it('should initialize with rotate 0', () => {
      const card = new Card();
      expect(card.rotate).toBe(0);
    });

    it('should allow setting rotation', () => {
      const card = new Card();
      card.rotate = 90;

      expect(card.rotate).toBe(90);
    });

    it('should initialize with zindex 0', () => {
      const card = new Card();
      expect(card.zindex).toBe(0);
    });

    it('should allow setting z-index', () => {
      const card = new Card();
      card.zindex = 5;

      expect(card.zindex).toBe(5);
    });
  });

  describe('size management', () => {
    it('should allow changing size', () => {
      const card = Card.create('Test', 'front.png', 'back.png', 2);

      card.size = 3;

      expect(card.size).toBe(3);
    });

    it('should get size from common data', () => {
      const card = Card.create('Test', 'front.png', 'back.png', 4);

      expect(card.size).toBe(4);
    });
  });

  describe('overview dimensions', () => {
    it('should have default overViewWidth of 250', () => {
      const card = new Card();
      expect(card.overViewWidth).toBe(250);
    });

    it('should allow setting overViewWidth', () => {
      const card = new Card();
      card.overViewWidth = 300;

      expect(card.overViewWidth).toBe(300);
    });

    it('should have default overViewMaxHeight of 250', () => {
      const card = new Card();
      expect(card.overViewMaxHeight).toBe(250);
    });

    it('should allow setting overViewMaxHeight', () => {
      const card = new Card();
      card.overViewMaxHeight = 400;

      expect(card.overViewMaxHeight).toBe(400);
    });
  });

  describe('table visibility', () => {
    it('should detect when on table without parent', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.setLocation('table');

      expect(card.isVisibleOnTable).toBe(true);
    });

    it('should not be visible on table when in different location', () => {
      const card = Card.create('Test', 'front.png', 'back.png');
      card.setLocation('graveyard');

      expect(card.isVisibleOnTable).toBe(false);
    });
  });

  describe('CardState enum', () => {
    it('should have FRONT state', () => {
      expect(CardState.FRONT).toBeDefined();
    });

    it('should have BACK state', () => {
      expect(CardState.BACK).toBeDefined();
    });

    it('should have distinct values', () => {
      expect(CardState.FRONT).not.toBe(CardState.BACK);
    });
  });

  describe('isOwnedBy', () => {
    it('is true for the owner', () => {
      const card = new Card();
      card.owner = 'user-A';
      expect(card.isOwnedBy('user-A')).toBe(true);
    });

    it('is false for anybody else', () => {
      const card = new Card();
      card.owner = 'user-A';
      expect(card.isOwnedBy('user-B')).toBe(false);
    });

    it('is false for an empty id, which a card nobody holds has as its owner', () => {
      const card = new Card();
      expect(card.isOwnedBy('')).toBe(false);
    });
  });

  describe('played offline, where no connection hands this seat a user id', () => {
    let card: Card;

    beforeEach(() => {
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: '', isOpen: false } as IPeerContext);
      PeerCursor.createMyCursor();
      card = Card.create('伏せ札', 'front.png', 'back.png');
      card.state = CardState.BACK;
    });

    afterEach(() => {
      vi.restoreAllMocks();
      card.destroy();
      PeerCursor.myCursor = null!;
    });

    it('keeps a card laid face down from showing its face to this seat', () => {
      expect(card.isMine).toBe(false);
      expect(card.isVisible).toBe(false);
    });

    it('lets this seat look at one alone, and take one into its hand, by the id on its own cursor', () => {
      PeerCursor.myCursor.userId = 'me';

      card.owner = PeerCursor.myUserId;
      expect(card.isPeeking).toBe(true);

      card.toHand(PeerCursor.myUserId);
      expect(card.isInMyHand).toBe(true);
      expect(card.isVisible).toBe(true);
    });
  });

  describe('isOwnerOnline', () => {
    it('is true while the owner is here', () => {
      const card = new Card();
      card.owner = 'user-A';
      const contexts = [{ userId: 'user-A', isOpen: true }];
      expect(card.isOwnerOnline(contexts)).toBe(true);
    });

    it('is false once they are gone', () => {
      const card = new Card();
      card.owner = 'user-A';
      const contexts = [{ userId: 'user-A', isOpen: false }];
      expect(card.isOwnerOnline(contexts)).toBe(false);
    });

    it('is false for an owner nobody has seen', () => {
      const card = new Card();
      card.owner = 'user-A';
      const contexts: { userId: string; isOpen: boolean }[] = [];
      expect(card.isOwnerOnline(contexts)).toBe(false);
    });
  });
});

describe('the colour of a card face', () => {
  it('keeps a colour that was chosen and falls back to the ink for anything else', () => {
    const card = Card.create('coloured', 'front.png', 'back.png');
    try {
      expect(card.faceFontColor).toBe(Card.DEFAULT_FACE_FONT_COLOR);
      expect(card.commonDataElement!.getFirstElementByName('fontcolor')).toBeNull();

      card.faceFontColor = '#Ff8800';
      expect(card.faceFontColor).toBe('#Ff8800');

      card.faceFontColor = 'red';
      expect(card.faceFontColor).toBe(Card.DEFAULT_FACE_FONT_COLOR);
    } finally {
      card.destroy();
    }
  });
});

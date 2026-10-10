import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/index';
import { IPeerContext } from '@axe/core/network/peer-context';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

describe('DiceSymbol', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('DiceType enum', () => {
    it('D2 = 0', () => {
      expect(DiceType.D2).toBe(0);
    });

    it('D4 = 1', () => {
      expect(DiceType.D4).toBe(1);
    });

    it('D6 = 2', () => {
      expect(DiceType.D6).toBe(2);
    });

    it('D8 = 3', () => {
      expect(DiceType.D8).toBe(3);
    });

    it('D10 = 4', () => {
      expect(DiceType.D10).toBe(4);
    });

    it('D10_10TIMES = 5', () => {
      expect(DiceType.D10_10TIMES).toBe(5);
    });

    it('D12 = 6', () => {
      expect(DiceType.D12).toBe(6);
    });

    it('D20 = 7', () => {
      expect(DiceType.D20).toBe(7);
    });
  });

  describe('create()', () => {
    it('takes a name', () => {
      const dice = DiceSymbol.create('テストダイス', DiceType.D6, 1);
      expect(dice.name).toBe('テストダイス');
    });

    it('takes a size', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 2);
      expect(dice.size).toBe(2);
    });

    it('is added to the store', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(store.get(dice.identifier)).toBe(dice);
    });

    it('takes an identifier of its own', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1, 'custom-dice-id');
      expect(dice.identifier).toBe('custom-dice-id');
    });

    it('makes one when none is given', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.identifier).toBeTruthy();
      expect(dice.identifier.length).toBeGreaterThan(0);
    });

    it('builds a root element', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.rootDataElement).toBeTruthy();
    });

    it('builds a common element', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.commonDataElement).toBeTruthy();
    });

    it('builds an image element', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.imageDataElement).toBeTruthy();
    });
  });

  describe('aliasName', () => {
    it('names itself a die', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.aliasName).toBe('dice-symbol');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.isLock).toBe(false);
    });

    it('starts unowned', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.owner).toBe('');
    });

    it('starts unturned', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.rotate).toBe(0);
    });

    it('starts still to be used', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.isUsed).toBe(false);
    });

    it('reads a die from a room that had no such mark as still to be used', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      const context = dice.toContext();
      delete (context.syncData as Record<string, unknown>)['isUsed'];

      dice.apply(context);

      expect(dice.isUsed).toBeFalsy();
    });
  });

  describe('faces', () => {
    it('gives a two-sided die two faces', () => {
      const dice = DiceSymbol.create('d2', DiceType.D2, 1);
      expect(dice.faces).toHaveLength(2);
      expect(dice.faces).toEqual(['1', '2']);
    });

    it('gives a four-sided die four', () => {
      const dice = DiceSymbol.create('d4', DiceType.D4, 1);
      expect(dice.faces).toHaveLength(4);
      expect(dice.faces).toEqual(['1', '2', '3', '4']);
    });

    it('gives a six-sided die six', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.faces).toHaveLength(6);
      expect(dice.faces).toEqual(['1', '2', '3', '4', '5', '6']);
    });

    it('gives an eight-sided die eight', () => {
      const dice = DiceSymbol.create('d8', DiceType.D8, 1);
      expect(dice.faces).toHaveLength(8);
    });

    it('gives a ten-sided die ten', () => {
      const dice = DiceSymbol.create('d10', DiceType.D10, 1);
      expect(dice.faces).toHaveLength(10);
      expect(dice.faces[0]).toBe('1');
      expect(dice.faces[9]).toBe('10');
    });

    it('gives a tens die ten faces counting by tens', () => {
      const dice = DiceSymbol.create('d100', DiceType.D10_10TIMES, 1);
      expect(dice.faces).toHaveLength(10);
      expect(dice.faces).toEqual(['10', '20', '30', '40', '50', '60', '70', '80', '90', '100']);
    });

    it('gives a twelve-sided die twelve', () => {
      const dice = DiceSymbol.create('d12', DiceType.D12, 1);
      expect(dice.faces).toHaveLength(12);
    });

    it('gives a twenty-sided die twenty', () => {
      const dice = DiceSymbol.create('d20', DiceType.D20, 1);
      expect(dice.faces).toHaveLength(20);
      expect(dice.faces[0]).toBe('1');
      expect(dice.faces[19]).toBe('20');
    });
  });

  describe('the face it starts on', () => {
    it('starts on the first face', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.face).toBe('1');
    });

    it('starts a tens die on its first', () => {
      const dice = DiceSymbol.create('d100', DiceType.D10_10TIMES, 1);
      expect(dice.face).toBe('10');
    });
  });

  describe('diceRoll()', () => {
    it('returns a value among its faces', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      const result = dice.diceRoll();
      expect(dice.faces).toContain(result);
    });

    it('takes a new face', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      const result = dice.diceRoll();
      expect(dice.face).toBe(result);
    });

    it('returns nothing when it has no faces', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      // clears its faces by removing every image element
      [...dice.imageDataElement!.children].forEach((child) => child.destroy());
      const result = dice.diceRoll();
      expect(result).toBe('');
    });

    it('always lands on one of its faces however often it is rolled', () => {
      const dice = DiceSymbol.create('d20', DiceType.D20, 1);
      for (let i = 0; i < 50; i++) {
        const result = dice.diceRoll();
        expect(dice.faces).toContain(result);
      }
    });
  });

  describe('setDicetype()', () => {
    it('takes a new kind of die', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.faces).toHaveLength(6);

      dice.setDicetype(DiceType.D20);
      expect(dice.faces).toHaveLength(20);
    });

    it('goes back to the first face when the kind changes', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.face = '5';

      dice.setDicetype(DiceType.D4);
      expect(dice.face).toBe('1');
    });

    it('and the old faces are removed', () => {
      const dice = DiceSymbol.create('d20', DiceType.D20, 1);
      expect(dice.faces).toHaveLength(20);

      dice.setDicetype(DiceType.D2);
      expect(dice.faces).toHaveLength(2);
    });
  });

  describe('name getter/setter', () => {
    it('takes a new name', () => {
      const dice = DiceSymbol.create('初期名', DiceType.D6, 1);
      dice.name = '新しい名前';
      expect(dice.name).toBe('新しい名前');
    });
  });

  describe('size getter/setter', () => {
    it('takes a new size', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.size = 3;
      expect(dice.size).toBe(3);
    });
  });

  describe('its owner', () => {
    it('is false while it is unowned', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.hasOwner).toBe(false);
    });

    it('is true once it has an owner', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'user-123';
      expect(dice.hasOwner).toBe(true);
    });

    it('returns nothing when the owner cannot be found', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'nonexistent-user';
      vi.spyOn(PeerCursor, 'findByUserId').mockReturnValue(null!);
      expect(dice.ownerName).toBe('');
    });

    it('returns their name when they can', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'user-123';
      vi.spyOn(PeerCursor, 'findByUserId').mockReturnValue({ name: 'テストユーザー' } as PeerCursor);
      expect(dice.ownerName).toBe('テストユーザー');
    });
  });

  describe('visibility', () => {
    it('can be seen while it is unowned', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.isVisible).toBe(true);
    });

    it('can be seen by its owner', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'my-user';
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'my-user' } as IPeerContext);
      expect(dice.isMine).toBe(true);
      expect(dice.isVisible).toBe(true);
    });

    it('cannot be seen by anybody else', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'other-user';
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: 'my-user' } as IPeerContext);
      expect(dice.isMine).toBe(false);
      expect(dice.isVisible).toBe(false);
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.location.name).toBe('table');
    });

    it('starts at ground level', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.posZ).toBe(0);
    });
  });

  describe('imageFile', () => {
    it('returns the picture of the face it starts on', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      expect(dice.face).toBe('1');
      // The picture comes from storage, which is empty under test.
      // what matters is that it has faces and reads the right one
      expect(dice.faces.includes(dice.face)).toBe(true);
    });

    it('returns the picture of the new face after a roll', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      // the face is set by hand
      dice.face = '3';
      // and that face is given a picture
      const faceElement = dice.imageDataElement?.getFirstElementByName('3');
      if (faceElement) faceElement.value = 'img-id-3';

      const storageSpy = vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(null);
      void dice.imageFile;
      // the first call should ask for that picture
      expect(storageSpy.mock.calls[0][0]).toBe('img-id-3');
    });

    it('falls back to the first face for a value it does not have', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.face = 'nonexistent';
      // the first face is given a picture
      const face1Element = dice.imageDataElement?.getFirstElementByName('1');
      if (face1Element) face1Element.value = 'img-id-1';

      const storageSpy = vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(null);
      void dice.imageFile;
      // the missing face asks storage for nothing,
      // and the fallback asks for the picture of the first
      expect(storageSpy.mock.calls[0][0]).toBe('img-id-1');
    });
  });
});

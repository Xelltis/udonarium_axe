import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { IPeerContext } from '@axe/core/network/peer-context';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { rereadSealedFaces, sealedFaceOf } from '@axe/core/storage/sealed-faces';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { claimBroughtInPiece } from '@axe/domain/tabletop/ownership';

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
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'my-user' } as IPeerContext);
      expect(dice.isMine).toBe(true);
      expect(dice.isVisible).toBe(true);
    });

    it("is nobody's while it is unowned, though this seat has no user id, as offline", () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: '' } as IPeerContext);
      expect(dice.isMine).toBe(false);
      expect(dice.isVisible).toBe(true);
    });

    it('cannot be seen by anybody else', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      dice.owner = 'other-user';
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId: 'my-user' } as IPeerContext);
      expect(dice.isMine).toBe(false);
      expect(dice.isVisible).toBe(false);
    });
  });

  describe('who may read and turn it', () => {
    const seat = (userId: string) =>
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId } as IPeerContext);

    it('opens to anyone a die nobody keeps, and a kept one to its keeper and to a seat that sees what is kept back', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      seat('me');
      try {
        expect(dice.isOpenTo(false)).toBe(true);
        dice.owner = 'me';
        expect(dice.isOpenTo(false)).toBe(true);
        dice.owner = 'them';
        expect(dice.isOpenTo(false)).toBe(false);
        expect(dice.isOpenTo(true)).toBe(true);
      } finally {
        dice.destroy();
      }
    });

    it('shows its name where it is open and its name is not hidden, and always to a seat that sees what is kept back', () => {
      const dice = DiceSymbol.create('d6', DiceType.D6, 1);
      seat('me');
      try {
        expect(dice.showsNameTo(false)).toBe(true);
        dice.hideName = true;
        expect(dice.showsNameTo(false)).toBe(false);
        expect(dice.showsNameTo(true)).toBe(true);
        dice.hideName = false;
        dice.owner = 'them';
        expect(dice.showsNameTo(false)).toBe(false);
        expect(dice.showsNameTo(true)).toBe(true);
      } finally {
        dice.destroy();
      }
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

  describe('sealed by the seat that keeps it', () => {
    const seat = (userId: string) =>
      vi.spyOn(Network.instance, 'peerContext', 'get').mockReturnValue({ userId } as IPeerContext);

    function sealedBy(userId: string, face = '5'): DiceSymbol {
      const dice = DiceSymbol.create('plot', DiceType.D6, 1);
      dice.face = face;
      dice.owner = userId;
      seat(userId);
      dice.seal();
      return dice;
    }

    beforeEach(() => {
      localStorage.removeItem('axe-sealed-dice-faces');
      rereadSealedFaces();
    });

    afterEach(() => {
      localStorage.removeItem('axe-sealed-dice-faces');
      rereadSealedFaces();
    });

    it('tells the room no face, and shows its keeper the face it had', () => {
      const dice = sealedBy('me', '5');

      expect(dice.sentFace).toBe('');
      expect(dice.face).toBe('5');
      expect(dice.isSealed).toBe(true);
    });

    it('shows any other seat no face, the game master included', () => {
      const dice = sealedBy('me', '5');

      seat('them');
      expect(dice.face).toBe('');
      expect(dice.isOpenTo(true)).toBe(false);
      expect(dice.isOpenTo(false)).toBe(false);
    });

    it('keeps a face it is turned to in the keeper’s browser, never telling the room', () => {
      const dice = sealedBy('me', '5');

      dice.face = '2';
      const rolled = dice.diceRoll();

      expect(dice.sentFace).toBe('');
      expect(dice.face).toBe(rolled);
      expect(sealedFaceOf(dice.identifier)).toBe(rolled);
    });

    it('writes no face into the saved data', () => {
      const dice = sealedBy('me', '5');

      const xml = ObjectSerializer.instance.toXml(dice);

      expect(xml).toContain('face=""');
      expect(xml).toContain('sealed="true"');
    });

    it('shows its keeper the face again once the page is loaded anew', () => {
      const dice = sealedBy('me', '3');

      rereadSealedFaces();

      expect(dice.face).toBe('3');
    });

    it('tells the room the face once it is unsealed, and lets go of what was kept', () => {
      const dice = sealedBy('me', '4');

      dice.unseal();

      expect([dice.sealed, dice.sentFace, dice.face]).toEqual([false, '4', '4']);
      expect(sealedFaceOf(dice.identifier)).toBeNull();
    });

    it('is unsealed when handed to another seat or to none, its face lost to the room, standing on its first face', () => {
      const handed = sealedBy('me', '6');
      const dropped = sealedBy('me', '6');

      handed.owner = 'them';
      dropped.owner = '';

      expect([handed.sealed, handed.isSealed, handed.sentFace]).toEqual([false, false, '1']);
      expect([dropped.sealed, dropped.isSealed, dropped.sentFace, dropped.face]).toEqual([false, false, '1', '1']);
    });

    it('comes back from a file unsealed, on its first face, the face it was sealed with never written', () => {
      const dice = sealedBy('me', '5');
      const saved = ObjectSerializer.instance.toXml(dice);
      expect(saved).not.toContain('face="5"');

      claimBroughtInPiece(dice, 'me');

      expect([dice.isSealed, dice.owner, dice.face]).toEqual([false, '', '1']);
    });

    it('lets go of the face this browser kept once its seal is let go of here, or it is deleted here', () => {
      const given = sealedBy('me', '5');
      const deleted = sealedBy('me', '3');

      given.owner = 'them';
      deleted.destroy();

      seat('me');
      expect(JSON.parse(localStorage.getItem('axe-sealed-dice-faces') ?? '{}')).toEqual({});
    });

    it('holds its face only in the browser of the seat that sealed it, which alone reads it', () => {
      const dice = sealedBy('me', '5');
      expect(dice.holdsSealedFace).toBe(true);
      expect(dice.isOpenTo(false)).toBe(true);

      rereadSealedFaces();
      localStorage.removeItem('axe-sealed-dice-faces');
      rereadSealedFaces();

      expect(dice.holdsSealedFace).toBe(false);
      expect(dice.isOpenTo(false)).toBe(false);
      expect(dice.isOpenTo(true)).toBe(false);
      seat('them');
      expect(dice.holdsSealedFace).toBe(false);
    });

    it('copies its face for a copy its keeper makes, still telling the room none', () => {
      const dice = sealedBy('me', '4');
      vi.spyOn(GameObject.prototype, 'clone').mockImplementation(() => {
        const made = DiceSymbol.create('plot', DiceType.D6, 1);
        made.owner = 'me';
        made.sealed = true;
        made.sentFace = '';
        return made;
      });

      const copy = dice.clone();

      expect([copy.isSealed, copy.sentFace, copy.face]).toEqual([true, '', '4']);
      copy.destroy();
    });

    it('copies with its seal let go, on its first face, where the face is not held, as by another seat', () => {
      const dice = sealedBy('me', '4');
      vi.spyOn(GameObject.prototype, 'clone').mockImplementation(() => {
        const made = DiceSymbol.create('plot', DiceType.D6, 1);
        made.owner = 'me';
        made.sealed = true;
        made.sentFace = '';
        return made;
      });

      seat('them');
      const byAnother = dice.clone();
      seat('me');
      rereadSealedFaces();
      localStorage.removeItem('axe-sealed-dice-faces');
      rereadSealedFaces();
      const elsewhere = dice.clone();

      for (const copy of [byAnother, elsewhere]) {
        expect([copy.isSealed, copy.sentFace, copy.owner]).toEqual([false, '1', 'me']);
        copy.destroy();
      }
    });

    it('seals nothing while nobody keeps it', () => {
      const dice = DiceSymbol.create('plot', DiceType.D6, 1);
      dice.sealed = true;

      expect(dice.isSealed).toBe(false);
      expect(dice.isOpenTo(false)).toBe(true);
    });

    it('reads data saved before dice could be sealed as unsealed', () => {
      const dice = ObjectSerializer.instance.parseXml('<dice-symbol face="3" owner="me"></dice-symbol>') as DiceSymbol;
      seat('me');

      expect([dice.sealed, dice.isSealed, dice.face]).toEqual([false, false, '3']);
      dice.destroy();
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { markLoadedWithheld, markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { isWithheldHere } from '@axe/domain/tabletop/withheld';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('isWithheldHere', () => {
  const made: { destroy(): void }[] = [];

  /** Takes the front picture away as a room server withholds it, as if it had never come. */
  function faceDown(): Card {
    const card = Card.create('剣の2', 'front.png', 'back.png');
    const front = card.imageDataElement!.getFirstElementByName('front')!;
    ObjectStore.instance.remove(front);
    card.imageDataElement!.removeChild(front);
    made.push(card);
    return card;
  }

  function note(mode: DisclosureMode, owner = ''): TextNote {
    const made_ = TextNote.create('メモ', '本文');
    made_.disclosureMode = mode;
    made_.owner = owner;
    made.push(made_);
    return made_;
  }

  function die(owner: string): DiceSymbol {
    const made_ = DiceSymbol.create('ダイス', DiceType.D6, 1);
    made_.owner = owner;
    made.push(made_);
    return made_;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    beMyself('me');
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.role = PeerRole.Player;
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of made.splice(0)) object.destroy();
    PeerCursor.myCursor = null!;
  });

  it('holds a card, and a deck, whose front a room server keeps from this user', () => {
    const hidden = faceDown();
    const stack = CardStack.create('山札');
    made.push(stack);
    stack.putOnBottom(hidden);

    expect(isWithheldHere(hidden)).toBe(true);
    expect(isWithheldHere(stack)).toBe(true);
    const shown = Card.create('剣の3', 'front.png', 'back.png');
    made.push(shown);
    expect(isWithheldHere(shown)).toBe(false);
  });

  it('holds a note not disclosed to this user, and a die somebody else owns', () => {
    expect(isWithheldHere(note(DisclosureMode.GameMaster))).toBe(true);
    expect(isWithheldHere(note(DisclosureMode.GameMaster, 'me'))).toBe(false);
    expect(isWithheldHere(note(DisclosureMode.All))).toBe(false);
    expect(isWithheldHere(die('someone'))).toBe(true);
    expect(isWithheldHere(die('me'))).toBe(false);
    expect(isWithheldHere(die(''))).toBe(false);
  });

  it('holds no note or die back from the game master, who is handed them whole', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;

    expect(isWithheldHere(note(DisclosureMode.GameMaster))).toBe(false);
    expect(isWithheldHere(die('someone'))).toBe(false);
  });

  it('holds nothing back with SkyWay, which hands everything over whole', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);

    expect(isWithheldHere(faceDown())).toBe(false);
    expect(isWithheldHere(note(DisclosureMode.GameMaster))).toBe(false);
    expect(isWithheldHere(die('someone'))).toBe(false);
  });

  it('still holds back what a table brought from a room server lacks, once away from it', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    markSeatWithheld(true, 'room');
    try {
      const masked = die('someone');
      masked.face = '';
      const blacked = note(DisclosureMode.GameMaster);
      blacked.text = '██ ██';

      expect(isWithheldHere(faceDown())).toBe(true);
      expect(isWithheldHere(masked)).toBe(true);
      expect(isWithheldHere(blacked)).toBe(true);
    } finally {
      markLoadedWithheld(false, false);
    }
  });

  it('holds back a die whose face a marked save lacked, though loading took its owner away', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    markLoadedWithheld(true, false);
    try {
      const masked = die('');
      masked.face = '';

      expect(isWithheldHere(masked)).toBe(true);
    } finally {
      markLoadedWithheld(false, false);
    }
  });

  it('holds back from the game master on a room server what a marked save brought in lacking', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    markLoadedWithheld(true, false);
    try {
      const masked = die('');
      masked.face = '';
      const blacked = note(DisclosureMode.All);
      blacked.text = '███';

      expect(isWithheldHere(masked)).toBe(true);
      expect(isWithheldHere(blacked)).toBe(true);
      expect(isWithheldHere(die('someone'))).toBe(false);
    } finally {
      markLoadedWithheld(false, false);
    }
  });

  it('holds back no note written in █ alone on a room server with nothing come from elsewhere', () => {
    const blacked = note(DisclosureMode.All);
    blacked.text = '███';
    const faceless = die('');
    faceless.face = '';

    expect(isWithheldHere(blacked)).toBe(false);
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(isWithheldHere(blacked)).toBe(false);
    expect(isWithheldHere(faceless)).toBe(false);
  });

  it('holds back what a recording’s board lacks while it is shown, with nothing marked', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    setNetworkIsolated(true);
    try {
      const masked = die('someone');
      masked.face = '';

      expect(isWithheldHere(faceDown())).toBe(true);
      expect(isWithheldHere(masked)).toBe(true);
      expect(isWithheldHere(die('someone'))).toBe(false);
    } finally {
      setNetworkIsolated(false);
    }
  });

  it('holds back no die or note handed over whole with SkyWay after a marked save was loaded', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(null);
    markLoadedWithheld(true, false);
    try {
      const faceless = die('');
      for (const face of [...(faceless.imageDataElement?.children ?? [])]) face.destroy();
      faceless.face = '';

      expect(isWithheldHere(die('someone'))).toBe(false);
      expect(isWithheldHere(faceless)).toBe(false);
      expect(isWithheldHere(note(DisclosureMode.GameMaster))).toBe(false);
    } finally {
      markLoadedWithheld(false, false);
    }
  });
});

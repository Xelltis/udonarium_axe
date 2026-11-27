import { TestBed } from '@angular/core/testing';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { localDispatch } from '@axe/core/network/network-messaging';
import { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { rereadSealedFaces } from '@axe/core/storage/sealed-faces';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { SealedDiceEventHandlerService } from '@axe/features/dice/sealed-dice-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SealedDiceEventHandlerService', () => {
  const made: DiceSymbol[] = [];

  function die(owner: string, sealed: boolean): DiceSymbol {
    const dice = DiceSymbol.create('plot', DiceType.D6, 1);
    dice.location.name = 'table';
    dice.face = '2';
    dice.owner = owner;
    if (sealed && owner === 'me') dice.seal();
    else if (sealed) {
      dice.sealed = true;
      dice.sentFace = '';
    }
    made.push(dice);
    return dice;
  }

  beforeEach(() => {
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    const mine = { userId: 'me' } as IPeerContext;
    setPeerContextProvider({ peerContext: mine, peerContexts: [mine], peerIds: ['me'], peerId: 'me' });
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
    vi.spyOn(TestBed.inject(ChatLineEditService), 'discloseDieRolls').mockReturnValue(0);
    TestBed.inject(SealedDiceEventHandlerService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const dice of made.splice(0)) dice.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
    localStorage.removeItem('axe-sealed-dice-faces');
    rereadSealedFaces();
  });

  it('shows the dice this seat sealed when the game master asks every seat to, and leaves the rest as they are', () => {
    const mine = die('me', true);
    const theirs = die('somebody-else', true);
    const kept = die('me', false);
    const roles: Record<string, PeerRole> = { 'gm-peer': PeerRole.GameMaster, 'player-peer': PeerRole.Player };
    vi.spyOn(PeerCursor, 'findByPeerId').mockImplementation((peerId) =>
      roles[peerId] ? ({ role: roles[peerId] } as PeerCursor) : null
    );

    localDispatch('REVEAL_SEALED_DICE', null, 'player-peer');
    localDispatch('REVEAL_SEALED_DICE', null, 'nobody-peer');
    expect(mine.isSealed).toBe(true);

    localDispatch('REVEAL_SEALED_DICE', null, 'gm-peer');

    expect([mine.isSealed, mine.owner, mine.sentFace]).toEqual([false, '', '2']);
    expect([theirs.isSealed, theirs.owner]).toEqual([true, 'somebody-else']);
    expect(kept.owner).toBe('me');
  });

  it('draws anew a sealed die whose face another tab of the page changed', () => {
    const mine = die('me', true);
    const version = TestBed.inject(ObjectChangeService).versionOf(mine.identifier);
    const before = version();

    localStorage.setItem('axe-sealed-dice-faces', JSON.stringify({ [mine.identifier]: '6' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'axe-sealed-dice-faces' }));

    expect(version()).toBeGreaterThan(before);
    expect(mine.face).toBe('6');
  });

  it('answers each asking once under a lock of this seat’s own, and takes none where this seat has sealed no die', () => {
    const held = new Set<string>();
    const locks = {
      request: (name: string, _options: unknown, run: (lock: unknown) => unknown) => {
        if (held.has(name)) return Promise.resolve(run(null));
        held.add(name);
        return Promise.resolve(run({ name }));
      },
    };
    Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
    vi.spyOn(PeerCursor, 'findByPeerId').mockReturnValue({ role: PeerRole.GameMaster } as PeerCursor);
    try {
      localDispatch('REVEAL_SEALED_DICE', { asking: 'first' }, 'gm-peer');
      expect([...held]).toEqual([]);

      const first = die('me', true);
      localDispatch('REVEAL_SEALED_DICE', { asking: 'first' }, 'gm-peer');
      expect([...held]).toEqual(['axe-reveal-sealed-dice:me:first']);
      expect(first.isSealed).toBe(false);

      const later = die('me', true);
      localDispatch('REVEAL_SEALED_DICE', { asking: 'first' }, 'gm-peer');
      expect(later.isSealed).toBe(true);
      localDispatch('REVEAL_SEALED_DICE', { asking: 'second' }, 'gm-peer');
      expect(later.isSealed).toBe(false);
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });
});

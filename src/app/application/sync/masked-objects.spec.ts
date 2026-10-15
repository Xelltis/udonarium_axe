import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import visibility from '@axe/core/network/server/contract/visibility.json';
import { AUTHORITY_PEER_ID, AuthorityEvent } from '@axe/core/network/server/server-protocol';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { Card } from '@axe/domain/card/card';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { DataElement } from '@axe/domain/data/data-element';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { beMyself } from '@axe/testing/peer-context-stub';
import type { MockInstance } from 'vitest';

/** The attributes of a secret line the server empties for those who may not read it. */
const MASKED_CHAT_ATTRIBUTES = ['dicebot', 'stamp', 'attachmentImageIdentifiers', 'editHistory', 'vnEmote'];

type Viewer = keyof typeof visibility.viewers;
type Room = keyof typeof visibility.rooms;

/** How the server shows an object to a viewer, by the fixture: as it is unless a case says otherwise. */
function kindFor(room: Room, identifier: string, viewer: Viewer): string {
  const found = visibility.cases.find((entry) => entry.room === room && entry.identifier === identifier);
  return found ? found.expect[viewer] : 'full';
}

/** An object kept back in part as the server describes it: a secret line, a die's face, a memo's words. */
function masked(context: ObjectContext): ObjectContext {
  const syncData = structuredClone(context.syncData) as Record<string, unknown>;
  const attributes = (syncData['attributes'] ?? {}) as Record<string, unknown>;
  if (context.aliasName === 'chat') {
    syncData['value'] = '';
    for (const name of MASKED_CHAT_ATTRIBUTES) attributes[name] = '';
  } else if (context.aliasName === 'dice-symbol') {
    attributes['face'] = '';
  } else if (typeof syncData['value'] === 'string') {
    syncData['value'] = (syncData['value'] as string).replace(/\S/g, '█');
  }
  syncData['attributes'] = attributes;
  return { ...context, syncData };
}

/**
 * A room as the server hands it to a viewer: what they may not see, or what waits for a parent or a
 * line not there yet, left out, and the rest masked where it says.
 */
function handedTo(room: Room, viewer: Viewer): ObjectContext[] {
  return (visibility.rooms[room] as ObjectContext[])
    .filter((context) => ['full', 'masked'].includes(kindFor(room, context.identifier, viewer)))
    .map((context) => (kindFor(room, context.identifier, viewer) === 'masked' ? masked(context) : context));
}

describe('objects a room server hands over with parts kept back', () => {
  type Sent = { eventName: string; data: { aliasName?: string; identifier?: string } };
  let send: MockInstance<(data: unknown, sendTo?: string, replaceKey?: string) => void>;
  const written = () =>
    send.mock.calls
      .map(([context]) => context as Sent)
      .filter(({ eventName }) => eventName === 'UPDATE_GAME_OBJECT' || eventName === 'DELETE_GAME_OBJECT')
      .map(({ eventName, data }) => `${eventName} ${data.aliasName} ${data.identifier}`);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  beforeEach(() => {
    // The classes register the aliases the server's objects arrive under.
    void [Card, ChatMessage, ChatTab, DataElement, DiceSymbol, TextNote];
    vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue(AUTHORITY_PEER_ID);
    send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    beMyself(visibility.viewers.player.userId);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = visibility.viewers.player.userId;
    PeerCursor.myCursor.role = PeerRole.Player;
    ObjectSynchronizer.instance.initialize();
    send.mockClear();
  });

  afterEach(() => {
    for (const room of Object.keys(visibility.rooms) as Room[]) {
      for (const context of visibility.rooms[room]) {
        const object = ObjectStore.instance.get(context.identifier);
        if (object) ObjectStore.instance.remove(object);
      }
    }
    ObjectStore.instance.clearDeleteHistory();
    ObjectSynchronizer.instance.destroy();
    PeerCursor.myCursor.destroy();
    vi.restoreAllMocks();
  });

  /** Takes the seat of a viewer in the fixture. */
  function beViewer(viewer: Viewer, role: PeerRole): void {
    beMyself(visibility.viewers[viewer].userId);
    PeerCursor.myCursor.userId = visibility.viewers[viewer].userId;
    PeerCursor.myCursor.role = role;
  }

  // The server hands things over as updates, and as its own word for those that come into view
  // later or for a change it puts back.
  const handings = ['UPDATE_GAME_OBJECT', AuthorityEvent.AUTHORITATIVE];
  const seats = [
    ['player', PeerRole.Player],
    ['guest', PeerRole.Guest],
  ] as const;
  for (const room of Object.keys(visibility.rooms) as Room[]) {
    for (const [viewer, role] of seats) {
      for (const eventName of handings) {
        it(`takes the ${room} as a ${viewer} is handed it in ${eventName}, and writes nothing back`, async () => {
          beViewer(viewer, role);
          await settle();
          send.mockClear();
          for (const context of handedTo(room, viewer)) {
            localDispatch(eventName, context, AUTHORITY_PEER_ID);
          }
          await settle();

          expect(written()).toEqual([]);
        });
      }
    }
  }

  it('shows a guest a die the server kept the face of as kept, and a memo as masked', () => {
    beViewer('guest', PeerRole.Guest);
    for (const room of ['dice', 'note'] as const) {
      for (const context of handedTo(room, 'guest')) {
        localDispatch(AuthorityEvent.AUTHORITATIVE, context, AUTHORITY_PEER_ID);
      }
    }
    const kept = visibility.cases.filter(
      (entry) => (entry.room === 'dice' || entry.room === 'note') && entry.expect.guest === 'masked'
    );

    expect(kept.length).toBeGreaterThan(0);
    for (const entry of kept) expect(ObjectStore.instance.get(entry.identifier)).not.toBeNull();
  });

  it('shows a player the back of a card whose face it was not handed', () => {
    for (const context of handedTo('faceDownCard', 'player')) {
      localDispatch('UPDATE_GAME_OBJECT', context, AUTHORITY_PEER_ID);
    }
    const card = ObjectStore.instance.get<Card>('card1')!;

    expect(card.frontImage).toBeNull();
    expect(card.name).toBe('');
    expect(card.isVisible).toBe(false);
  });

  it('keeps a secret line it was handed emptied as a secret', () => {
    for (const context of handedTo('chat', 'player')) {
      localDispatch('UPDATE_GAME_OBJECT', context, AUTHORITY_PEER_ID);
    }
    const secret = ObjectStore.instance.get<ChatMessage>('secret')!;

    expect(secret.isSecret).toBe(true);
    expect(secret.text).toBe('');
    expect(ObjectStore.instance.get('whisper')).not.toBeNull();
  });
});

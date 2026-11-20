import { TestBed } from '@angular/core/testing';
import { CardFlipCutInService } from '@axe/application/card/card-flip-cut-in.service';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { Network } from '@axe/core/network/network';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

type View = Record<string, unknown> & { id: string; name: string };

describe('AgentCardKinds', () => {
  let tools: AgentKindTools;
  let fogged: Set<TabletopObject>;
  let peerIds: string[];

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function get(kind: string, id: string): View {
    return call('get_object', { kind, id }) as View;
  }

  function listed(kind: string): string[] {
    return (call('list_objects', { kind }) as View[]).map((thing) => thing.id);
  }

  function act(kind: string, id: string, action: string, args: Record<string, unknown> = {}): unknown {
    return call('act_on_object', { kind, id, action, args });
  }

  function change(kind: string, id: string, fields: Record<string, unknown>): View {
    return call('change_object', { kind, id, fields }) as View;
  }

  function asPlayer(): void {
    PeerCursor.myCursor.role = PeerRole.Player;
  }

  function laid<T extends TabletopObject>(object: T, x = 0, y = 0): T {
    object.location.name = 'table';
    object.location.x = x;
    object.location.y = y;
    return object;
  }

  function cardOf(name: string, x = 0, y = 0): Card {
    return laid(Card.create(name, 'front', 'back'), x, y);
  }

  function deckOf(names: readonly string[]): CardStack {
    const stack = laid(CardStack.create('山札'), 200, 200);
    for (const name of names) stack.putOnBottom(Card.create(name, 'front', 'back'));
    return stack;
  }

  function dieOf(name: string, owner = ''): DiceSymbol {
    const die = laid(DiceSymbol.create(name, DiceType.D6, 1), 100, 100);
    die.face = '4';
    die.owner = owner;
    return die;
  }

  /** Has a copy read back as the thing given, as happy-dom reads no XML back. */
  function copiedAs(copy: TabletopObject): void {
    vi.spyOn(ObjectSerializer.instance, 'parseXml').mockReturnValue(copy);
  }

  function seatJoins(peerId: string, userId: string, role: PeerRole = PeerRole.Player): PeerCursor {
    const cursor = new PeerCursor();
    cursor.peerId = peerId;
    cursor.userId = userId;
    cursor.role = role;
    cursor.initialize();
    peerIds.push(peerId);
    return cursor;
  }

  beforeEach(() => {
    peerIds = [];
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      get peerIds() {
        return peerIds;
      },
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'ai-user';
    PeerCursor.myCursor.name = 'AI';
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    fogged = new Set();
    vi.spyOn(TestBed.inject(VisionService), 'isPieceHiddenByFog').mockImplementation((object) => fogged.has(object));
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  describe('card', () => {
    it('lists the loose cards on the table in sight and those in this seat’s hand, and no other', () => {
      const loose = cardOf('剣');
      const mine = cardOf('盾');
      mine.toHand('ai-user');
      const theirs = cardOf('槍');
      theirs.toHand('someone-else');
      const underFog = cardOf('弓');
      fogged.add(underFog);
      const stack = deckOf(['杖']);
      const graveyard = cardOf('斧');
      graveyard.location.name = 'graveyard';

      expect(listed('card').sort()).toEqual([loose.identifier, mine.identifier].sort());
      expect(listed('card-stack')).toEqual([stack.identifier]);
    });

    it('leaves out the face of a card this seat does not see, and gives it no name of its face', () => {
      const card = cardOf('秘密の鍵');
      card.faceText = '地下室を開ける';
      card.faceDown();
      const title = TestBed.inject(TRANSLATE_FN)('feature.card.title');
      asPlayer();

      const read = get('card', card.identifier);

      expect(read).toMatchObject({ name: title, face_up: false, face_shown_to_me: false, size: 2 });
      expect(read).not.toHaveProperty('text');
      expect(read).not.toHaveProperty('font_size');
      expect(call('list_objects', { kind: 'card', name: '秘密' })).toEqual([]);
      expect(() => get('card', '秘密の鍵')).toThrow(/There is no card named/);
      expect(() => change('card', card.identifier, { name: '偽物' })).toThrow(/face of this card is not shown/);
      expect(card.name).toBe('秘密の鍵');

      card.owner = 'someone-else';
      expect(get('card', card.identifier)).toMatchObject({ name: title, face_shown_to_me: false });

      act('card', card.identifier, 'peek');
      expect(get('card', card.identifier)).toMatchObject({
        name: '秘密の鍵',
        text: '地下室を開ける',
        face_up: false,
        face_shown_to_me: true,
        peeked_by: 'AI',
      });
    });

    it('shows the game master the face of a card face down, as its sheet does, and lets it change it', () => {
      const card = cardOf('秘密の鍵');
      card.faceText = '地下室を開ける';
      card.faceDown();
      card.owner = 'someone-else';

      expect(get('card', card.identifier)).toMatchObject({
        name: '秘密の鍵',
        text: '地下室を開ける',
        face_shown_to_me: true,
      });
      expect(change('card', card.identifier, { name: '偽物' })).toMatchObject({ name: '偽物' });
    });

    it('turns, peeks at and takes no card another seat connected now peeks at, the master no more than a player', () => {
      const them = { userId: 'someone-else', isOpen: true } as IPeerContext;
      setPeerContextProvider({
        peerContext: { userId: 'ai-user' } as IPeerContext,
        peerContexts: [them],
        get peerIds() {
          return peerIds;
        },
        peerId: 'ai-peer',
      });
      const card = cardOf('秘密の鍵');
      card.faceDown();
      card.owner = 'someone-else';

      for (const role of [PeerRole.GameMaster, PeerRole.Player]) {
        PeerCursor.myCursor.role = role;
        for (const action of ['face_up', 'face_down', 'peek', 'to_hand']) {
          expect(() => act('card', card.identifier, action)).toThrow(/Another seat connected now is peeking/);
        }
      }
      expect([card.isFront, card.owner, card.location.name]).toEqual([false, 'someone-else', 'table']);
    });

    it('lays a blank card in a square, changes it as the screen lets it and takes it away', () => {
      const made = call('create_object', {
        kind: 'card',
        options: { at: { col: 3, row: 2 } },
        fields: { name: '手紙', text: '明日の夜に' },
      }) as View;

      expect(made).toMatchObject({
        name: '手紙',
        text: '明日の夜に',
        square: { col: 3, row: 2 },
        face_up: true,
        in_my_hand: false,
      });
      expect(made).not.toHaveProperty('peeked_by');
      expect(change('card', made.id, { square: { col: 5, row: 4 }, rotate: 90, font_size: 30 })).toMatchObject({
        square: { col: 5, row: 4 },
        rotate: 90,
        font_size: 30,
      });
      change('card', made.id, { locked: true });
      expect(() => change('card', made.id, { square: { col: 1, row: 1 } })).toThrow(/locked in place/);
      expect(() => change('card', made.id, { rotate: 0 })).toThrow(/locked in place/);
      expect(call('remove_object', { kind: 'card', id: made.id })).toEqual({ removed: { id: made.id, name: '手紙' } });
      expect(ObjectStore.instance.getObjects(Card)).toEqual([]);
    });

    it('keeps the sheet of a card not disclosed to this seat from its writes', () => {
      const card = cardOf('呪いの札');
      card.disclosureMode = 'gm';
      asPlayer();

      expect(() => change('card', card.identifier, { size: 4 })).toThrow(/sheet is not shown/);
      expect(() => change('card', card.identifier, { name: '祝福の札' })).toThrow(/sheet is not shown/);
      expect(change('card', card.identifier, { rotate: 180 })).toMatchObject({ rotate: 180, size: 2 });
    });

    it('turns, peeks at, takes into the hand and plays a card through the screen’s own hands', () => {
      const card = cardOf('女王', GRID, GRID);
      const cutIn = vi.spyOn(TestBed.inject(CardFlipCutInService), 'playFor');

      expect(act('card', card.identifier, 'face_down')).toMatchObject({ face_up: false });
      expect(act('card', card.identifier, 'face_up')).toMatchObject({ face_up: true, name: '女王' });
      expect(cutIn).toHaveBeenCalledWith(card);
      expect(() => act('card', card.identifier, 'face_up')).toThrow(/already lies face up/);

      act('card', card.identifier, 'to_hand');
      expect(get('card', card.identifier)).toMatchObject({ in_my_hand: true, face_shown_to_me: true });
      expect(get('card', card.identifier)).not.toHaveProperty('square');
      expect(() => act('card', card.identifier, 'face_up')).toThrow(/hand; play it to the table first/);
      expect(() => change('card', card.identifier, { square: { col: 1, row: 1 } })).toThrow(/hand/);
      expect(() => call('remove_object', { kind: 'card', id: card.identifier })).toThrow(/hand/);

      expect(act('card', card.identifier, 'play', { face_up: false, at: { col: 4, row: 3 } }) as View).toMatchObject({
        in_my_hand: false,
        face_up: false,
        face_shown_to_me: true,
        square: { col: 4, row: 3 },
      });
      expect(card.location.name).toBe('table');
      expect(() => act('card', card.identifier, 'play', { face_up: true })).toThrow(/not in this seat's hand/);
    });

    it('copies a card only where no room server keeps its face from this seat', () => {
      const card = cardOf('王');
      const copied = cardOf('王');
      copiedAs(copied);

      const copy = act('card', card.identifier, 'copy') as View;
      expect(copy).toMatchObject({ id: copied.identifier, name: '王', square: { col: 2, row: 2 } });

      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('room-server');
      vi.spyOn(Card.prototype, 'isFaceWithheld', 'get').mockReturnValue(true);
      expect(() => act('card', card.identifier, 'copy')).toThrow(/room server keeps this card's face/);
    });
  });

  describe('card-stack', () => {
    it('lays a deck of playing cards and tells only of its top card while it lies face up', () => {
      const made = call('create_object', { kind: 'card-stack', options: { at: { col: 2, row: 2 } } }) as View;
      const title = TestBed.inject(TRANSLATE_FN)('feature.tabletop.action.defaultCardName');

      expect(made).toMatchObject({ count: 54, top_face_up: true, top_card: title, square: { col: 2, row: 2 } });

      const turned = act('card-stack', made.id, 'turn_all', { face: 'down' }) as View;
      expect(turned).toMatchObject({ count: 54, top_face_up: false });
      expect(turned).not.toHaveProperty('top_card');

      const hidden = change('card-stack', made.id, { show_count: false });
      expect(hidden).toMatchObject({ show_count: false });
      expect(hidden).not.toHaveProperty('count');
    });

    it('draws cards onto the table face as they lie, and into the hand face shown', () => {
      const stack = deckOf(['一', '二', '三', '四']);
      stack.faceDownAll();
      asPlayer();
      const title = TestBed.inject(TRANSLATE_FN)('feature.card.title');

      const { drawn } = act('card-stack', stack.identifier, 'draw', { count: 2 }) as { drawn: View[] };
      expect(drawn).toHaveLength(2);
      for (const card of drawn) {
        expect(card).toMatchObject({ name: title, face_up: false, in_my_hand: false });
        expect(card).not.toHaveProperty('text');
      }

      const { drawn: held } = act('card-stack', stack.identifier, 'draw', { to: 'hand' }) as { drawn: View[] };
      expect(held).toEqual([expect.objectContaining({ name: '三', in_my_hand: true, face_shown_to_me: true })]);
      expect(get('card-stack', stack.identifier)).toMatchObject({ count: 1 });

      act('card-stack', stack.identifier, 'draw', { count: 5 });
      expect(get('card-stack', stack.identifier)).toMatchObject({ count: 0 });
      expect(() => act('card-stack', stack.identifier, 'draw')).toThrow(/holds no cards/);
    });

    it('deals a deck into the hand of every seat playing, asking first where a room server keeps faces back', () => {
      const notice = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
      const stack = deckOf(['一', '二', '三']);
      seatJoins('peer-2', 'player-2');

      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('room-server');
      const withheld = vi.spyOn(Card.prototype, 'isFaceWithheld', 'get').mockReturnValue(true);
      expect(() => act('card-stack', stack.identifier, 'deal')).toThrow(/deal_anyway/);
      expect(stack.cards).toHaveLength(3);

      withheld.mockReturnValue(false);
      expect(act('card-stack', stack.identifier, 'deal')).toEqual({ dealt: 3, participants: 2 });
      expect(notice).toHaveBeenCalledWith('card', expect.any(String));
      const hands = ObjectStore.instance.getObjects<Card>(Card).map((card) => card.location.name);
      expect(new Set(hands)).toEqual(new Set([handLocationOf('ai-user'), handLocationOf('player-2')]));
    });

    it('takes in a loose card on top or at the bottom, but not one locked in place', () => {
      const stack = deckOf(['底']);
      const top = cardOf('天辺');
      const bottom = cardOf('奈落');
      const locked = cardOf('錨');
      locked.isLock = true;

      act('card-stack', stack.identifier, 'put_card', { card: top.identifier });
      act('card-stack', stack.identifier, 'put_card', { card: '奈落', at: 'bottom' });

      expect(stack.cards.map((card) => card.name)).toEqual(['天辺', '底', '奈落']);
      expect(listed('card')).toEqual([locked.identifier]);
      expect(() => act('card-stack', stack.identifier, 'put_card', { card: locked.identifier })).toThrow(
        /locked in place/
      );
      expect(bottom.parent).not.toBeNull();
    });

    it('takes in no loose card another seat connected now peeks at, the master no more than a player', () => {
      const them = { userId: 'someone-else', isOpen: true } as IPeerContext;
      setPeerContextProvider({
        peerContext: { userId: 'ai-user' } as IPeerContext,
        peerContexts: [them],
        get peerIds() {
          return peerIds;
        },
        peerId: 'ai-peer',
      });
      const stack = deckOf(['底']);
      const held = cardOf('秘密の鍵');
      held.faceDown();
      held.owner = 'someone-else';

      for (const role of [PeerRole.GameMaster, PeerRole.Player]) {
        PeerCursor.myCursor.role = role;
        for (const at of ['top', 'bottom']) {
          expect(() => act('card-stack', stack.identifier, 'put_card', { card: held.identifier, at })).toThrow(
            /That card: Another seat connected now is peeking/
          );
        }
      }
      expect([stack.cards.map((card) => card.name), held.owner, held.location.name]).toEqual([
        ['底'],
        'someone-else',
        'table',
      ]);
    });

    it('splits a deck for every seat playing and breaks one up, taking the old stack away', () => {
      const stack = deckOf(['一', '二', '三', '四']);
      expect(() => act('card-stack', stack.identifier, 'split')).toThrow(/Only one seat plays/);

      seatJoins('peer-2', 'player-2');
      seatJoins('peer-3', 'guest-3', PeerRole.Guest);
      const { stacks } = act('card-stack', stack.identifier, 'split') as { stacks: View[] };

      expect(stacks).toHaveLength(2);
      expect(ObjectStore.instance.get(stack.identifier)).toBeFalsy();
      const [first] = stacks.map((made) => ObjectStore.instance.get<CardStack>(made.id)!);
      const firstCards = first.cards.length;

      const { cards } = act('card-stack', first.identifier, 'break') as { cards: View[] };
      expect(cards).toHaveLength(firstCards);
      expect(ObjectStore.instance.get(first.identifier)).toBeFalsy();
      expect(listed('card')).toEqual(expect.arrayContaining(cards.map((card) => card.id)));
    });

    it('keeps a stack the master put out of sight from the players', () => {
      const stack = deckOf(['一']);
      stack.setLocation('concealed');

      expect(listed('card-stack')).toEqual([stack.identifier]);
      asPlayer();
      expect(listed('card-stack')).toEqual([]);
    });

    it('copies a stack only where no card in it is kept back, and takes one away with its cards', () => {
      const stack = deckOf(['一', '二']);
      const copied = deckOf(['一', '二']);
      copied.owner = 'someone-else';
      copiedAs(copied);

      const copy = act('card-stack', stack.identifier, 'copy') as View;
      expect(copy).toMatchObject({ id: copied.identifier, name: '山札', count: 2, square: { col: 6, row: 6 } });
      expect(copy).not.toHaveProperty('looked_through_by');

      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('room-server');
      vi.spyOn(Card.prototype, 'isFaceWithheld', 'get').mockReturnValue(true);
      expect(() => act('card-stack', stack.identifier, 'copy')).toThrow(/room server keeps the face of a card/);

      call('remove_object', { kind: 'card-stack', id: stack.identifier });
      expect(ObjectStore.instance.get(stack.identifier)).toBeFalsy();
      expect(ObjectStore.instance.getObjects<Card>(Card).map((card) => card.parent?.parent)).toEqual([copied, copied]);
    });
  });

  describe('dice-symbol', () => {
    it('leaves out the face and the name of a die another seat keeps, but not from the game master', () => {
      const die = dieOf('隠しダイス', 'someone-else');
      asPlayer();

      const read = get('dice-symbol', die.identifier);
      expect(read).toMatchObject({ name: '', faces: ['1', '2', '3', '4', '5', '6'] });
      expect(read).not.toHaveProperty('face');
      expect(call('list_objects', { kind: 'dice-symbol', name: '隠し' })).toEqual([]);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(get('dice-symbol', die.identifier)).toMatchObject({ name: '隠しダイス', face: '4' });
    });

    it('leaves out the name of a die whose name is hidden, but not its face', () => {
      const die = dieOf('名無し');
      die.hideName = true;
      asPlayer();

      const read = get('dice-symbol', die.identifier);
      expect(read).toMatchObject({ name: '', face: '4', hide_name: true });
    });

    it('rolls and sets the face only of a die this seat may see, saying the roll in the chat', () => {
      const said = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null!);
      const die = dieOf('D6');

      const rolled = act('dice-symbol', die.identifier, 'roll') as View;
      expect(die.faces).toContain(rolled['face']);
      expect(said).toHaveBeenCalledTimes(1);
      expect(act('dice-symbol', die.identifier, 'set_face', { face: '6' })).toMatchObject({ face: '6' });
      expect(() => act('dice-symbol', die.identifier, 'set_face', { face: '7' })).toThrow(/no face 7/);

      die.owner = 'someone-else';
      asPlayer();
      expect(() => act('dice-symbol', die.identifier, 'roll')).toThrow(/Another seat keeps this die/);
      expect(() => act('dice-symbol', die.identifier, 'set_face', { face: '1' })).toThrow(/Another seat keeps/);
      expect(die.face).toBe('6');

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(() => act('dice-symbol', die.identifier, 'roll')).toThrow(/Another seat keeps this die/);
      expect(() => act('dice-symbol', die.identifier, 'set_face', { face: '2' })).toThrow(/Another seat keeps/);
      expect([die.face, said.mock.calls.length]).toEqual(['6', 1]);
    });

    it('keeps a player from renaming, resizing or hiding the name of a die another seat keeps', () => {
      const die = dieOf('隠しダイス', 'someone-else');
      asPlayer();

      expect(() => change('dice-symbol', die.identifier, { name: '偽物' })).toThrow(/Another seat keeps/);
      expect(() => change('dice-symbol', die.identifier, { size: 3 })).toThrow(/Another seat keeps/);
      expect(() => change('dice-symbol', die.identifier, { hide_name: true })).toThrow(/Another seat keeps/);
      expect([die.name, die.size, die.hideName]).toEqual(['隠しダイス', 1, false]);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(change('dice-symbol', die.identifier, { hide_name: true })).toMatchObject({ hide_name: true });
    });

    it('shows a kept die only for its keeper or the master, and keeps one only where nobody does', () => {
      const notice = vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
      vi.spyOn(TestBed.inject(ChatLineEditService), 'discloseDieRolls').mockReturnValue(0);
      const kept = dieOf('秘密', 'someone-else');
      const free = dieOf('共有');
      asPlayer();

      expect(() => act('dice-symbol', kept.identifier, 'reveal')).toThrow(/Only the seat that keeps a die/);
      expect(() => act('dice-symbol', kept.identifier, 'keep')).toThrow(/only the game master may take it/);
      expect(act('dice-symbol', free.identifier, 'keep')).toMatchObject({ kept_by: 'AI', face: '4' });
      expect(() => act('dice-symbol', free.identifier, 'keep')).toThrow(/already keeps it/);

      PeerCursor.myCursor.role = PeerRole.GameMaster;
      act('dice-symbol', kept.identifier, 'reveal');
      expect(kept.owner).toBe('');
      expect(notice).toHaveBeenCalledWith('diceReveal', expect.any(String));
    });

    it('stands a die kept to this seat, and changes it as its sheet lets this seat', () => {
      const made = call('create_object', {
        kind: 'dice-symbol',
        options: { at: { col: 4, row: 4 }, type: 'D20', kept: true },
      }) as View;

      expect(made).toMatchObject({ name: 'D20', face: '1', kept_by: 'AI', square: { col: 4, row: 4 } });
      expect(made['faces']).toHaveLength(20);

      const die = ObjectStore.instance.get<DiceSymbol>(made.id)!;
      die.owner = '';
      die.disclosureMode = 'gm';
      asPlayer();
      expect(() => change('dice-symbol', made.id, { size: 2 })).toThrow(/sheet is not shown/);
      expect(change('dice-symbol', made.id, { used: true, hide_name: true })).toMatchObject({ used: true });
    });

    it('copies a die only where no room server keeps its face from this seat', () => {
      const die = dieOf('D6', 'someone-else');
      asPlayer();
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('room-server');

      expect(() => act('dice-symbol', die.identifier, 'copy')).toThrow(/room server keeps this die's face/);
      die.owner = '';
      const copied = dieOf('D6');
      copiedAs(copied);
      expect(act('dice-symbol', die.identifier, 'copy')).toMatchObject({
        id: copied.identifier,
        square: { col: 4, row: 4 },
      });
    });
  });

  describe('coin', () => {
    it('tosses a coin through the coin’s own toss, which says the face in the chat', () => {
      vi.useFakeTimers();
      const said = vi
        .spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage')
        .mockReturnValue(null as unknown as ChatMessage);
      const made = call('create_object', { kind: 'coin', options: { at: { col: 6, row: 6 } } }) as View;
      expect(made).toMatchObject({ face: 'front', square: { col: 6, row: 6 } });

      const tossed = act('coin', made.id, 'flip') as View;
      expect(['front', 'back']).toContain(tossed['face']);
      vi.advanceTimersByTime(1000);
      expect(said).toHaveBeenCalledTimes(1);

      expect(act('coin', made.id, 'set_face', { face: 'back' })).toMatchObject({ face: 'back' });
      expect(() => change('coin', made.id, { face: 'front' })).toThrow(AgentToolError);
    });

    it('leaves out a coin under the fog, and takes one away', () => {
      const shown = laid(Coin.create('金貨'));
      const hidden = laid(Coin.create('銀貨'));
      fogged.add(hidden);

      expect(listed('coin')).toEqual([shown.identifier]);
      expect(call('remove_object', { kind: 'coin', id: '金貨' })).toEqual({
        removed: { id: shown.identifier, name: '金貨' },
      });
    });
  });
});

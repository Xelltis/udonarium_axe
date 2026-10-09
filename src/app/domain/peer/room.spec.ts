import { TestBed } from '@angular/core/testing';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { createDefaultEffectPresets } from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { createDefaultCutIns } from '@axe/domain/media/builtin-cut-ins';
import { CutIn } from '@axe/domain/media/cut-in';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { Room } from '@axe/domain/peer/room';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';

describe('Room', () => {
  let store: ObjectStore;

  function loadRoom(inner: string): void {
    const reloadCheck = new ReloadCheck('ReloadCheck');
    reloadCheck.initialize();
    reloadCheck.reloadCheckStart(false);
    ObjectSerializer.instance.parseXml(`<room>${inner}</room>`);
  }

  /** Every deletion the others would be told about, out of the ones named. */
  function deletionsAmong(identifiers: Set<string>, load: () => void): string[] {
    const deleted: string[] = [];
    const off = networkMessage$.subscribe((message) => {
      if (message.eventName !== 'DELETE_GAME_OBJECT') return;
      const identifier = String((message.data as { identifier?: string }).identifier ?? '');
      if (identifiers.has(identifier)) deleted.push(identifier);
    });

    try {
      setNetworkIsolated(true);
      load();
    } finally {
      setNetworkIsolated(false);
      off();
    }
    return deleted;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  describe('creating one', () => {
    it('can be created', () => {
      const room = new Room();
      room.initialize();
      expect(room).toBeTruthy();
    });
  });

  describe('onStoreAdded', () => {
    it('takes itself out of the store', () => {
      const room = new Room();
      room.initialize();
      expect(store.get(room.identifier)).toBeFalsy();
    });
  });

  describe('innerXml()', () => {
    it('writes nothing while it is empty', () => {
      const room = new Room();
      room.initialize();
      expect(room.innerXml()).toBe('');
    });
  });

  describe('saving what stands on a table', () => {
    it('writes a light once, where the table it stands on has already written it', () => {
      const table = new GameTable();
      table.initialize();
      const light = LightSource.create('燭台');
      table.appendChild(light);

      const xml = new Room().innerXml();

      // The table writes everything standing on it, so a light written again beside the table
      // is a second light on the way back in.
      expect(xml.split('<light-source').length - 1).toBe(1);
    });

    it('writes a light nobody put on a table, which would otherwise be lost', () => {
      LightSource.create('浮いた光');

      const xml = new Room().innerXml();

      expect(xml.split('<light-source').length - 1).toBe(1);
    });

    it('reads a saved table back with the one light it was saved with', () => {
      loadRoom('<game-table><light-source name="燭台"></light-source></game-table>');

      expect(store.getObjects(LightSource)).toHaveLength(1);
    });
  });

  describe('saving who travels together', () => {
    function makeParty(identifier?: string): Party {
      const party = new Party(identifier);
      party.name = '本隊';
      party.color = '#fcd34d';
      party.initialize();
      return party;
    }

    it('writes the parties out with who belongs to each', () => {
      const party = makeParty();
      const character = GameCharacter.create('斥候', 1, '');
      character.partyIdentifier = party.identifier;

      const xml = new Room().innerXml();

      expect(xml).toContain(`<party name="本隊" color="#fcd34d" allies="" identifier="${party.identifier}">`);
      expect(xml).toContain(`partyIdentifier="${party.identifier}"`);
    });

    // A character written by the room carries dotted attributes, which the test DOM refuses to
    // parse, so what is read back here is written by hand in the same shape.
    it('reads them back with each member still in its party', () => {
      loadRoom(
        '<party name="本隊" color="#fcd34d" identifier="party-1"></party>' +
          '<character partyIdentifier="party-1"></character>'
      );

      const parties = store.getObjects(Party);
      expect(parties).toHaveLength(1);
      expect(parties[0].identifier).toBe('party-1');
      expect(parties[0].name).toBe('本隊');
      expect(parties[0].color).toBe('#fcd34d');
      expect(store.getObjects(GameCharacter)[0].partyIdentifier).toBe('party-1');
    });

    it('reads back who each party stands with', () => {
      loadRoom(
        '<party name="本隊" color="#fcd34d" allies="party-2" identifier="party-1"></party>' +
          '<party name="義勇軍" color="#bef264" identifier="party-2"></party>'
      );

      const parties = store.getObjects(Party);
      expect(parties.find((party) => party.identifier === 'party-1')!.alliedWith).toEqual(['party-2']);
      expect(parties.find((party) => party.identifier === 'party-2')!.alliedWith).toEqual([]);
    });

    it('brings a party back over the one it replaces in the room it was saved from', () => {
      makeParty('party-1');

      loadRoom(
        '<party name="本隊" color="#fcd34d" identifier="party-1"></party>' +
          '<character partyIdentifier="party-1"></character>'
      );

      expect(store.getObjects(Party).map((party) => party.identifier)).toEqual(['party-1']);
    });

    it('still reads a party saved before its identifier was written, in no one’s company', () => {
      loadRoom('<party name="本隊" color="#fcd34d"></party><character partyIdentifier="party-1"></character>');

      const parties = store.getObjects(Party);
      expect(parties).toHaveLength(1);
      expect(parties[0].name).toBe('本隊');
      expect(parties[0].identifier).not.toBe('party-1');
    });

    it('reads a party written with nothing at all as an unnamed one in the first colour', () => {
      loadRoom('<party></party>');

      const parties = store.getObjects(Party);
      expect(parties).toHaveLength(1);
      expect(parties[0].name).toBe('');
      expect(parties[0].color).toBe(PARTY_COLORS[0]);
    });
  });

  describe('what happens to the effect library as it reads', () => {
    it('sends no deletions to the others for room data that carries no effects', () => {
      // Deleted and put back under the same identifiers they return here, but the others refuse
      // them as the return of what was deleted, and only whoever loaded the room still has them.
      const before = createDefaultEffectPresets();
      const identifiers = new Set(before.map((preset) => preset.identifier));

      const deleted = deletionsAmong(identifiers, () => loadRoom('<card></card>'));

      expect(deleted).toEqual([]);
      expect(store.getObjects<EffectPreset>(EffectPreset)).toHaveLength(before.length);
    });

    it('replaces them with what the room data brings, where it brings any', () => {
      createDefaultEffectPresets();

      loadRoom('<effect-preset name="持ち込みの一撃" kind="bash"></effect-preset>');

      const after = store.getObjects<EffectPreset>(EffectPreset);
      expect(after).toHaveLength(1);
      expect(after[0].name).toBe('持ち込みの一撃');
    });

    it('makes the usual set when there are none anywhere', () => {
      loadRoom('<card></card>');

      expect(store.getObjects<EffectPreset>(EffectPreset).length).toBeGreaterThan(0);
    });
  });

  describe('what happens to the sample cut-ins as it reads', () => {
    afterEach(() => {
      ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
    });

    it('sends no deletions to the others for room data saved before there were any', () => {
      const before = createDefaultCutIns(ImageStorage.instance);
      const identifiers = new Set(before.map((cutIn) => cutIn.identifier));

      const deleted = deletionsAmong(identifiers, () => loadRoom('<card></card>'));

      expect(deleted).toEqual([]);
      expect(store.getObjects(CutIn)).toHaveLength(before.length);
    });

    it('replaces them with what the room data brings, where it brings any', () => {
      createDefaultCutIns(ImageStorage.instance);

      loadRoom('<cut-in name="持ち込みの一枚"></cut-in>');

      const after = store.getObjects(CutIn);
      expect(after).toHaveLength(1);
      expect(after[0].name).toBe('持ち込みの一枚');
    });
  });

  describe('letting go of ownership as it reads', () => {
    it('clears the owner of everything it restores', () => {
      const reloadCheck = new ReloadCheck('ReloadCheck');
      reloadCheck.initialize();
      reloadCheck.reloadCheckStart(false);

      ObjectSerializer.instance.parseXml('<room><card owner="past-session-user"></card></room>');

      const cards = store.getObjects(Card);
      expect(cards).toHaveLength(1);
      expect(cards[0].owner).toBe('');
    });
  });

  describe('saving the stamps put on lines of chat', () => {
    it('writes the stamps on a line still in the chat, and not those on a line gone with its tab', () => {
      const message = new ChatMessage();
      message.initialize();
      ChatReaction.create(message.identifier, 'noa', 'ノア').stamps = 'sfx:creepy seal:ok';
      ChatReaction.create('gone-line', 'noa', 'ノア').stamps = 'seal:ok';

      const xml = new Room().innerXml();

      expect(xml).toContain(`<chat-reaction messageIdentifier="${message.identifier}" userId="noa"`);
      expect(xml).toContain('stamps="sfx:creepy seal:ok"');
      expect(xml).not.toContain('gone-line');
    });

    it('reads them back in place of the ones there were', () => {
      ChatReaction.create('line-before', 'old', 'まえ').stamps = 'seal:ok';

      loadRoom(
        '<chat-reaction messageIdentifier="line-1" userId="noa" userName="ノア" stamps="motif:skull"></chat-reaction>'
      );

      expect(store.getObjects(ChatReaction).map((each) => [each.messageIdentifier, each.userId, each.stamps])).toEqual([
        ['line-1', 'noa', 'motif:skull'],
      ]);
    });

    it('starts with none from a room saved before there were any', () => {
      ChatReaction.create('line-before', 'old', 'まえ').stamps = 'seal:ok';

      loadRoom('<card></card>');

      expect(store.getObjects(ChatReaction)).toEqual([]);
      expect(store.getObjects(Card)).toHaveLength(1);
    });

    it('passes over a kind it does not know and reads the rest, as an older version does these', () => {
      loadRoom('<a-kind-from-a-newer-version stamps="x"></a-kind-from-a-newer-version><card></card>');

      expect(store.getObjects(Card)).toHaveLength(1);
    });
  });
});

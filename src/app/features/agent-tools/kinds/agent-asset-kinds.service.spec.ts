import { TestBed } from '@angular/core/testing';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { PartyService } from '@axe/application/party/party.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelFile } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemoval } from '@axe/domain/media/asset-removal';
import { writeAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { ModelTag } from '@axe/domain/media/model-tag';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;
const FOREST = 'a'.repeat(64);
const SECRET = 'b'.repeat(64);
const BOSS = 'c'.repeat(64);
const LOGO = 'd'.repeat(64);

describe('AgentAssetKinds', () => {
  let tools: AgentKindTools;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  function ids(kind: string): string[] {
    return (call('list_objects', { kind }) as { id: string }[]).map((listed) => listed.id);
  }

  function get(kind: string, id: string): Record<string, unknown> {
    return call('get_object', { kind, id }) as Record<string, unknown>;
  }

  function change(kind: string, id: string, fields: Record<string, unknown>): Record<string, unknown> {
    return call('change_object', { kind, id, fields }) as Record<string, unknown>;
  }

  function act(kind: string, id: string, action: string, args: Record<string, unknown> = {}): unknown {
    return call('act_on_object', { kind, id, action, args });
  }

  function playAs(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
  }

  /** Holds these pictures here, each named. */
  function holdPictures(...pictures: [string, string][]): void {
    const held = pictures.map(([identifier, name]) => ImageFile.createEmpty(identifier, name));
    vi.spyOn(TestBed.inject(ImageStorage), 'images', 'get').mockReturnValue(held);
  }

  /**
   * A forest picture anyone may pick, one the master keeps secret, one under a tag someone else locked,
   * and one the tool brought with it.
   */
  function holdFourPictures(): void {
    holdPictures([FOREST, '森.png'], [SECRET, '秘密.png'], [BOSS, 'ボス.png'], [LOGO, 'ロゴ.png']);
    ImageTag.create(SECRET).isSecret = true;
    ImageTag.create(BOSS).tag = 'ボス';
    ImageTagLock.lock('ボス', 'someone-else');
    ImageTag.create(LOGO).tag = SYSTEM_RESERVED_TAG;
  }

  function myKey(): string {
    return TestBed.inject(AssetOwnershipService).myOwnerKey();
  }

  function pieceAt(name: string, col: number, row: number): GameCharacter {
    const piece = GameCharacter.create(name, 1, '');
    piece.location = { name: 'table', x: (col - 1) * GRID, y: (row - 1) * GRID };
    piece.update();
    return piece;
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
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
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  describe('image-tag', () => {
    it('lists the pictures this seat may pick: a player is kept from the secret ones and a tag locked by someone else', () => {
      holdFourPictures();

      expect(ids('image-tag')).toEqual([FOREST, SECRET, BOSS]);
      playAs(PeerRole.Player);
      expect(ids('image-tag')).toEqual([FOREST]);
      expect(() => get('image-tag', SECRET)).toThrow(/no image-tag named/);
    });

    it('files a picture under a tag, but not under the reserved tag nor one someone else locked', () => {
      holdFourPictures();
      playAs(PeerRole.Player);

      expect(change('image-tag', FOREST, { tag: '森' })).toMatchObject({ id: FOREST, name: '森.png', tag: '森' });
      expect(() => change('image-tag', FOREST, { tag: SYSTEM_RESERVED_TAG })).toThrow(/keeps for itself/);
      expect(() => change('image-tag', FOREST, { tag: 'ボス' })).toThrow(/Someone else keeps the tag ボス locked/);
      expect(ImageTag.get(FOREST)?.tag).toBe('森');
    });

    it('lets the game master alone keep a picture secret', () => {
      holdFourPictures();
      playAs(PeerRole.Player);

      expect(() => change('image-tag', FOREST, { secret: true })).toThrow(/Only the game master's seat/);
      playAs(PeerRole.GameMaster);
      expect(change('image-tag', FOREST, { secret: true })).toMatchObject({ secret: true });
      expect(ImageTag.isSecret(FOREST)).toBe(true);
    });
  });

  describe('image-tag-lock', () => {
    it('locks a tag to this seat, keeps a tag someone else locked from a player, and lets the master unlock it', () => {
      holdFourPictures();
      ImageTag.create(FOREST).tag = '森';
      playAs(PeerRole.Player);

      expect(ids('image-tag-lock')).toEqual(['森']);
      expect(act('image-tag-lock', '森', 'toggle')).toEqual({ tag: '森', locked: true });
      expect(get('image-tag-lock', '森')).toMatchObject({ locked: true, locked_by_this_seat: true });

      playAs(PeerRole.GameMaster);
      expect(ids('image-tag-lock')).toEqual(['森', 'ボス']);
      expect(act('image-tag-lock', 'ボス', 'toggle')).toEqual({ tag: 'ボス', locked: false });
    });

    it('names no tag only the pictures the master keeps back carry, but to the master', () => {
      holdFourPictures();
      ImageTag.get(SECRET)!.tag = '黒幕';
      ImageTag.create(FOREST).tag = '森';
      playAs(PeerRole.Player);

      expect(ids('image-tag-lock')).toEqual(['森']);
      playAs(PeerRole.GameMaster);
      expect(ids('image-tag-lock')).toEqual(['森', '黒幕', 'ボス']);
    });

    it('lets a seat that only watches lock nothing', () => {
      holdFourPictures();
      ImageTag.create(FOREST).tag = '森';
      playAs(PeerRole.Guest);

      expect(() => act('image-tag-lock', '森', 'toggle')).toThrow(AgentToolError);
      expect(ImageTagLock.get('森')).toBeNull();
    });
  });

  describe('audio-tag', () => {
    function holdSounds(): AudioFile[] {
      const hidden = AudioFile.createEmpty('t3', '隠し');
      hidden.isHidden = true;
      const sounds = [AudioFile.createEmpty('t1', '戦闘'), AudioFile.createEmpty('t2', '雨'), hidden];
      vi.spyOn(TestBed.inject(AudioStorage), 'audios', 'get').mockReturnValue(sounds);
      return sounds;
    }

    it('files a track under a tag the jukebox offers, and reads what was read of it', () => {
      holdSounds();
      AudioTag.create('t2').tag = 'BGS';
      AudioTag.create('t1').analysis = writeAudioAnalysis({
        version: 1,
        duration: 90,
        lufs: -14,
        peak: -1,
        start: 0,
        end: 90,
        bpm: 120,
        bar: 0.5,
        confidence: 0.9,
      });

      expect(ids('audio-tag')).toEqual(['t1', 't2']);
      const [kind] = call('describe_kinds', { kind: 'audio-tag' }) as { fields: { name: string; schema: unknown }[] }[];
      expect(kind.fields.find((field) => field.name === 'tag')?.schema).toEqual({
        type: 'string',
        enum: ['BGM', 'BGS', 'SE'],
      });
      expect(get('audio-tag', 't1')).toMatchObject({ tag: 'BGM', analysis: { bpm: 120, duration: 90 } });
      expect(change('audio-tag', 't1', { tag: 'SE' })).toMatchObject({ tag: 'SE' });
      expect(() => change('audio-tag', 't1', { tag: 'ボス戦' })).toThrow(/fields.tag must be one of/);
      expect(() => change('audio-tag', 't1', { analysis: {} })).toThrow(/only read/);
    });

    it('keeps the tag of a track on a playlist', () => {
      holdSounds();
      Playlist.create('戦闘曲', ['t2']);

      expect(() => change('audio-tag', 't2', { tag: 'SE' })).toThrow(/on a playlist keeps its tag/);
      expect(AudioTag.get('t2')).toBeNull();
    });
  });

  describe('model-tag', () => {
    it('lists the models held and sorts one under a tag', () => {
      const oak = ModelFile.createEmpty('e'.repeat(64), 'oak.glb');
      vi.spyOn(TestBed.inject(ModelStorage), 'models', 'get').mockReturnValue([oak]);
      playAs(PeerRole.Player);

      expect(call('list_objects', { kind: 'model-tag' })).toEqual([{ id: oak.identifier, name: 'oak' }]);
      expect(change('model-tag', 'oak', { tag: ' 家具 ' })).toMatchObject({ tag: '家具' });
      expect(ModelTag.get(oak.identifier)?.tag).toBe('家具');
    });
  });

  describe('asset-owner', () => {
    it('says who added the assets this seat comes across, and nothing of one kept from it', () => {
      holdFourPictures();
      AssetOwner.claim(FOREST, 'image', myKey());
      AssetOwner.claim(SECRET, 'image', myKey());
      playAs(PeerRole.Player);

      expect(ids('asset-owner')).toEqual([FOREST]);
      expect(get('asset-owner', FOREST)).toMatchObject({ asset_kind: 'image', added_by_this_seat: true });
    });
  });

  describe('asset-removal', () => {
    it('lets a player take out what they added alone, and the master put it back', () => {
      holdPictures([FOREST, '森.png'], [BOSS, 'ボス.png'], ['none_icon', '同梱.png']);
      AssetOwner.claim(FOREST, 'image', myKey());
      AssetOwner.claim(BOSS, 'image', 'owner_someone-else');
      playAs(PeerRole.Player);

      expect(ids('asset-removal')).toEqual([FOREST]);
      expect(get('asset-removal', FOREST)).toMatchObject({ removed: false, added_by_this_seat: true, uses: 0 });
      expect(() => act('asset-removal', BOSS, 'remove')).toThrow(/no asset-removal named/);
      expect(act('asset-removal', FOREST, 'remove')).toEqual({ removed: { id: FOREST, name: '森.png' } });
      expect(AssetRemoval.get(FOREST)?.isRemoved).toBe(true);
      expect(AssetRemoval.get(BOSS)).toBeNull();
      expect(ids('asset-removal')).toEqual([]);

      playAs(PeerRole.GameMaster);
      expect(ids('asset-removal')).toEqual([BOSS, FOREST]);
      expect(act('asset-removal', FOREST, 'restore')).toEqual({ restored: { id: FOREST } });
      expect(AssetRemoval.get(FOREST)?.isRemoved).toBe(false);
    });

    it('lets only the master put back what was taken out', () => {
      holdPictures([FOREST, '森.png']);
      AssetRemoval.remove(FOREST, 'image');
      playAs(PeerRole.Player);

      expect(() => act('asset-removal', FOREST, 'restore')).toThrow(/Only the game master's seat may restore/);
      expect(AssetRemoval.get(FOREST)?.isRemoved).toBe(true);
    });
  });

  describe('character', () => {
    it('lists the pieces seen on the table and those in the inventory, and none in stealth from a player', () => {
      playAs(PeerRole.Player);
      const goblin = pieceAt('ゴブリン', 2, 2);
      const thief = pieceAt('盗賊', 3, 3);
      thief.owner = 'someone-else';
      thief.stealth = '1';
      const spare = GameCharacter.create('予備', 1, '');
      spare.setLocation('common');
      const fallen = GameCharacter.create('戦死者', 1, '');
      fallen.setLocation('graveyard');

      expect(ids('character')).toEqual([goblin.identifier, spare.identifier, fallen.identifier]);
      expect(get('character', '予備')).toMatchObject({ location: 'common', square: null });
      expect(get('character', 'ゴブリン')).toMatchObject({ location: 'table', square: { col: 2, row: 2 } });
    });

    it('changes how a piece looks and is kept, through what the screen sets', () => {
      const goblin = pieceAt('ゴブリン', 2, 2);
      holdPictures([FOREST, '森.png']);

      expect(
        change('character', goblin.identifier, {
          name: 'ゴブリン王',
          size: 2,
          locked: true,
          image: '森.png',
          chat_colours: ['#111111', '#222222', '#333333'],
          location: 'graveyard',
        })
      ).toMatchObject({
        name: 'ゴブリン王',
        size: 2,
        locked: true,
        image: FOREST,
        chat_colours: ['#111111', '#222222', '#333333'],
        location: 'graveyard',
      });
      expect(goblin.location.name).toBe('graveyard');
    });

    it('turns a light on with a lamp kind, and sets how far the piece sees', () => {
      const goblin = pieceAt('ゴブリン', 2, 2);

      expect(
        change('character', goblin.identifier, { light_preset: 'torch', vision_type: 'darkvision', vision_range: 6 })
      ).toMatchObject({ light: true, light_preset: 'torch', vision_type: 'darkvision', vision_range: 6 });
      expect(goblin.lightBrightRadius).toBeGreaterThan(0);
    });

    it('leaves out the settings of a piece this seat may not open, and lets it change none of the piece', () => {
      playAs(PeerRole.Player);
      const dragon = pieceAt('ドラゴン', 4, 4);
      dragon.owner = 'gm-user';
      dragon.disclosureMode = 'gm';

      const read = get('character', dragon.identifier);

      expect(read).toMatchObject({ name: 'ドラゴン', size: 1, shown_to: 'gm' });
      expect(read).not.toHaveProperty('vision_type');
      expect(read).not.toHaveProperty('chat_colours');
      expect(() => change('character', dragon.identifier, { size: 3 })).toThrow(/may not open this piece/);
      expect(dragon.size).toBe(1);
    });

    it('keeps a hidden name from a player who does not own the piece, and lets them not rename it', () => {
      playAs(PeerRole.Player);
      const boss = pieceAt('魔王', 4, 4);
      boss.owner = 'gm-user';
      boss.hideName = true;

      const read = get('character', boss.identifier);

      expect(read['name']).not.toBe('魔王');
      expect(JSON.stringify(read)).not.toContain('魔王');
      expect(() => change('character', boss.identifier, { name: '勇者' })).toThrow(/name is hidden/);
      expect(boss.name).toBe('魔王');
    });

    it('keeps the NPC flag, the hidden name and the party to the master', () => {
      const goblin = pieceAt('ゴブリン', 2, 2);
      const party = TestBed.inject(PartyService).create('魔物');
      playAs(PeerRole.Player);

      for (const fields of [{ npc: true }, { hide_name: true }, { party: '魔物' }]) {
        expect(() => change('character', goblin.identifier, fields)).toThrow(/Only the game master's seat/);
      }
      playAs(PeerRole.GameMaster);
      expect(change('character', goblin.identifier, { npc: true, party: '魔物' })).toMatchObject({
        npc: true,
        party: party.identifier,
      });
      expect(goblin.partyIdentifier).toBe(party.identifier);
    });

    it('lets only the master and the owner put a piece into stealth', () => {
      playAs(PeerRole.Player);
      const scout = pieceAt('斥候', 2, 2);
      scout.owner = 'someone-else';
      const mine = pieceAt('密偵', 3, 3);
      mine.owner = 'ai-user';

      expect(() => change('character', scout.identifier, { stealth: true })).toThrow(/owner put it into stealth/);
      expect(scout.stealth).toBe('');
      expect(change('character', mine.identifier, { stealth: true })).toMatchObject({ stealth: true });
    });

    it("lets a player take a piece nobody owns, and not one someone else owns, nor say who sees another's sheet", () => {
      playAs(PeerRole.Player);
      const stray = pieceAt('野良', 2, 2);
      const theirs = pieceAt('他人の', 3, 3);
      theirs.owner = 'someone-else';

      expect(change('character', stray.identifier, { owner: 'AI' })).toMatchObject({ owner: 'AI' });
      expect(stray.owner).toBe('ai-user');
      expect(() => change('character', theirs.identifier, { owner: 'AI' })).toThrow(/Whose a piece is/);
      expect(() => change('character', theirs.identifier, { shown_to: 'gm' })).toThrow(/owner's and the game master's/);
      expect(() => change('character', stray.identifier, { owner: '誰か' })).toThrow(/not a seat offered here/);
      expect(theirs.owner).toBe('someone-else');
    });

    it('lays a piece in a square, and deletes it only from the graveyard', () => {
      const made = call('create_object', {
        kind: 'character',
        options: { at: { col: 3, row: 2 } },
        fields: { name: 'スライム' },
      }) as { id: string };

      expect(get('character', made.id)).toMatchObject({ name: 'スライム', square: { col: 3, row: 2 }, shown_to: 'gm' });
      expect(() => call('remove_object', { kind: 'character', id: made.id })).toThrow(/Only a piece in the graveyard/);
      change('character', made.id, { location: 'graveyard' });
      expect(call('remove_object', { kind: 'character', id: made.id })).toEqual({
        removed: { id: made.id, name: 'スライム' },
      });
      expect(ObjectStore.instance.get(made.id)).toBeNull();
    });

    it('sets up a mount only once it is one, and gets nothing off a mount it does not ride', () => {
      const horse = pieceAt('馬', 2, 2);

      expect(() => change('character', horse.identifier, { mount_cargo: 2 })).toThrow(/It is no mount/);
      expect(change('character', horse.identifier, { mountable: true })).toMatchObject({ mountable: true });
      expect(change('character', horse.identifier, { mount_cargo: 2 })).toMatchObject({ mount_cargo: 2 });
      expect(() => act('character', horse.identifier, 'get_off')).toThrow(/rides nothing/);
    });
  });

  describe('a call with a refused field', () => {
    it('writes no field of it, the good ones written beside the refused one included', () => {
      holdFourPictures();
      const goblin = pieceAt('ゴブリン', 2, 2);

      expect(() => change('image-tag', FOREST, { secret: true, tag: SYSTEM_RESERVED_TAG })).toThrow(/keeps for itself/);
      expect(() => change('character', goblin.identifier, { size: 3, owner: '誰か' })).toThrow(/not a seat offered/);
      for (const named of [{ image: 'ない.png' }, { model: 'ない' }, { party: 'ない' }]) {
        expect(() => change('character', goblin.identifier, { size: 3, ...named })).toThrow(/There is no/);
      }

      expect(ImageTag.get(FOREST)).toBeNull();
      expect(goblin.size).toBe(1);
      expect(goblin.owner).toBe('');
    });

    it('leaves no piece made for a call refused while it is made', () => {
      const before = ObjectStore.instance.getObjects(GameCharacter).length;

      expect(() => call('create_object', { kind: 'character', fields: { name: 'スライム', mount_cargo: 2 } })).toThrow(
        /It is no mount/
      );

      expect(ObjectStore.instance.getObjects(GameCharacter)).toHaveLength(before);
    });
  });

  describe('range', () => {
    it('lays a range in a square, changes its shape, colour and facing, follows a piece and takes it away', () => {
      const goblin = pieceAt('ゴブリン', 5, 5);
      playAs(PeerRole.Player);
      const made = call('create_object', {
        kind: 'range',
        options: { shape: 'circle', at: { col: 3, row: 2 } },
        fields: { name: '火球' },
      }) as { id: string };

      expect(ids('range')).toEqual([made.id]);
      expect(get('range', made.id)).toMatchObject({
        name: '火球',
        shape: 'circle',
        solid: 'flat',
        square: { col: 3, row: 2 },
      });
      expect(
        change('range', made.id, { shape: 'cone', border_colour: '#ff0000', facing: 180, length: 6 })
      ).toMatchObject({ shape: 'cone', border_colour: '#ff0000', facing: 180, length: 6 });
      expect(() => change('range', made.id, { follow: 'ゴブリン' })).toThrow(/flat cone cannot follow/);
      change('range', made.id, { shape: 'square' });
      expect(change('range', made.id, { follow: 'ゴブリン' })).toMatchObject({ follow: goblin.identifier });
      expect(call('remove_object', { kind: 'range', id: made.id })).toEqual({ removed: { id: made.id, name: '火球' } });
      expect(ObjectStore.instance.getObjects(RangeArea)).toEqual([]);
    });

    it("lays a range made at a square with its middle on the square's middle, and reads that square back", () => {
      const made = call('create_object', { kind: 'range', options: { shape: 'circle', at: { col: 4, row: 3 } } }) as {
        id: string;
      };
      const range = ObjectStore.instance.get<RangeArea>(made.id)!;

      expect(get('range', made.id)).toMatchObject({ square: { col: 4, row: 3 } });
      expect([range.location.x, range.location.y]).toEqual([3.5 * GRID, 2.5 * GRID]);
      change('range', made.id, { square: { col: 6, row: 2 } });
      expect([range.location.x, range.location.y]).toEqual([5.5 * GRID, 1.5 * GRID]);
    });

    it('stands a range up only as a solid its shape can take', () => {
      expect(() => call('create_object', { kind: 'range', options: { shape: 'square', solid: 'sphere' } })).toThrow(
        /square cannot stand up as a sphere/
      );
      const made = call('create_object', { kind: 'range', options: { shape: 'line', solid: 'beam' } }) as {
        id: string;
        solid: string;
      };

      expect(made.solid).toBe('beam');
      expect(() => change('range', made.id, { solid: 'sphere' })).toThrow(/cannot stand up as a sphere/);
    });
  });
});

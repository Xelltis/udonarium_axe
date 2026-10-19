import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarSet } from '@axe/domain/hotbar/hotbar-set';

describe('carrying a hotbar between rooms', () => {
  const store = ObjectStore.instance;
  const serializer = ObjectSerializer.instance;

  function myHotbar(): Hotbar {
    return Hotbar.ensureMine()!;
  }

  beforeEach(() => {
    Hotbar.ownerId = 'me';
  });

  afterEach(() => {
    Hotbar.ownerId = '';
    store.clearDeleteHistory();
  });

  it('writes the slots down with where they sit', () => {
    const hotbar = myHotbar();
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    draft.label = '全力攻撃';
    draft.characterName = '術者';
    hotbar.put(1, 4, draft);

    const xml = serializer.toXml(HotbarSet.of(hotbar));

    expect(xml).toContain('hotbar-set');
    expect(xml).toContain('page="1"');
    expect(xml).toContain('slotIndex="4"');
    expect(xml).toContain('characterName="術者"');
    expect(xml).toContain('2d6+3 攻撃');
  });

  it('reads the slots into the reader’s own bar, whoever wrote them', () => {
    const theirs = new Hotbar('Hotbar_someone-else');
    theirs.ownerUserId = 'someone-else';
    theirs.initialize();
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    theirs.put(2, 5, draft);
    const xml = serializer.toXml(HotbarSet.of(theirs));

    serializer.parseXml(xml);

    const mine = myHotbar();
    expect(mine.ownerUserId).toBe('me');
    expect(mine.slotAt(2, 5)?.argument).toBe('2d6+3 攻撃');
  });

  it('carries a menu slot with the entry it presses and nothing for a chat line to send', () => {
    const theirs = new Hotbar('Hotbar_someone-else');
    theirs.ownerUserId = 'someone-else';
    theirs.initialize();
    const draft = emptyHotbarSlotDraft('menu');
    draft.payload = { kind: 'menu', command: 'jukebox' };
    theirs.put(0, 2, draft);
    const xml = serializer.toXml(HotbarSet.of(theirs));

    serializer.parseXml(xml);

    const slot = myHotbar().slotAt(0, 2);
    expect(slot?.slotKind).toBe('menu');
    expect(slot?.options).toEqual({ kind: 'menu', command: 'jukebox' });
    expect(slot?.argument).toBe('');
  });

  it('puts away what the bar held, so the file is what the reader gets', () => {
    const hotbar = myHotbar();
    const standing = emptyHotbarSlotDraft('chat');
    standing.value = '前の卓のマクロ';
    hotbar.put(0, 0, standing);
    const carried = emptyHotbarSlotDraft('chat');
    carried.value = '新しい卓のマクロ';
    const donor = new Hotbar('Hotbar_donor');
    donor.initialize();
    donor.put(0, 1, carried);
    const xml = serializer.toXml(HotbarSet.of(donor));

    serializer.parseXml(xml);

    expect(hotbar.slotAt(0, 0)).toBeNull();
    expect(hotbar.slotAt(0, 1)?.argument).toBe('新しい卓のマクロ');
  });

  it('reads the same file twice without asking for the same slots twice', () => {
    const donor = new Hotbar('Hotbar_donor');
    donor.initialize();
    const draft = emptyHotbarSlotDraft('sound');
    draft.value = 'dice-roll';
    donor.put(0, 3, draft);
    const xml = serializer.toXml(HotbarSet.of(donor));

    serializer.parseXml(xml);
    serializer.parseXml(xml);

    expect(myHotbar().slotsOn(0)).toHaveLength(1);
    expect(myHotbar().slotAt(0, 3)?.argument).toBe('dice-roll');
  });

  it('keeps what it displaced, so a file dropped by mistake can be taken back', () => {
    const hotbar = myHotbar();
    const standing = emptyHotbarSlotDraft('chat');
    standing.value = '前の卓のマクロ';
    hotbar.put(0, 0, standing);
    const donor = new Hotbar('Hotbar_donor');
    donor.initialize();
    const carried = emptyHotbarSlotDraft('chat');
    carried.value = '新しい卓のマクロ';
    donor.put(0, 1, carried);

    serializer.parseXml(serializer.toXml(HotbarSet.of(donor)));
    expect(hotbar.hasDisplaced).toBe(true);

    expect(hotbar.restoreDisplaced()).toBe(true);

    expect(hotbar.slotAt(0, 0)?.argument).toBe('前の卓のマクロ');
    expect(hotbar.slotAt(0, 1)).toBeNull();
    expect(hotbar.hasDisplaced).toBe(false);
  });

  it('keeps out of the store, being a wrapper for the journey alone', () => {
    const hotbar = myHotbar();
    serializer.parseXml(serializer.toXml(HotbarSet.of(hotbar)));

    expect(store.getObjects<HotbarSet>(HotbarSet)).toHaveLength(0);
  });

  it('leaves the bar alone for a file whose slots name no cell this bar has', () => {
    const hotbar = myHotbar();
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    hotbar.put(0, 0, draft);

    const parser = new DOMParser();
    const beyond = parser.parseFromString(
      '<hotbar-set identifier="x"><hotbar-slot page="7" slotIndex="3" kind="chat">遠い頁</hotbar-slot></hotbar-set>',
      'application/xml'
    );
    HotbarSet.of(hotbar).parseInnerXml(beyond.documentElement);

    expect(hotbar.slotAt(0, 0)?.value).toBe('2d6+3 攻撃');
    expect(hotbar.hasDisplaced).toBe(false);
  });

  it('leaves the bar alone for a file with nothing readable on it', () => {
    const hotbar = myHotbar();
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    hotbar.put(0, 0, draft);

    const parser = new DOMParser();
    const empty = parser.parseFromString('<hotbar-set identifier="x"></hotbar-set>', 'application/xml');
    HotbarSet.of(hotbar).parseInnerXml(empty.documentElement);

    expect(hotbar.slotAt(0, 0)?.value).toBe('2d6+3 攻撃');
    expect(hotbar.hasDisplaced).toBe(false);
  });

  it('keeps the reader’s own bar as the way back, however many files are read', () => {
    const hotbar = myHotbar();
    const mine = emptyHotbarSlotDraft('chat');
    mine.value = '自分の一撃';
    hotbar.put(0, 0, mine);

    const carried = new Hotbar('Hotbar_carried');
    carried.ownerUserId = 'someone-else';
    carried.initialize();
    const theirs = emptyHotbarSlotDraft('chat');
    theirs.value = '誰かの一撃';
    carried.put(0, 0, theirs);
    const xml = serializer.toXml(HotbarSet.of(carried));

    const parser = new DOMParser();
    const first = parser.parseFromString(xml, 'application/xml');
    HotbarSet.of(hotbar).parseInnerXml(first.documentElement);
    const second = parser.parseFromString(xml, 'application/xml');
    HotbarSet.of(hotbar).parseInnerXml(second.documentElement);

    expect(hotbar.restoreDisplaced()).toBe(true);
    expect(hotbar.slotAt(0, 0)?.value).toBe('自分の一撃');
  });
});

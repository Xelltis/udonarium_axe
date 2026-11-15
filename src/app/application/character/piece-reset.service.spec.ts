import { TestBed } from '@angular/core/testing';
import { PieceResetService } from '@axe/application/character/piece-reset.service';
import { ResetUndoService } from '@axe/application/character/reset-undo.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { encodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { resetCarriedOut$, type ResetCarriedOutEvent } from '@axe/core/event/domain-events';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { ResetRecord } from '@axe/domain/character/piece-reset';
import { newStatusAilment } from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DEFAULT_SYSTEM_NOTICES, NOTICE_OFF, withNoticeRoute } from '@axe/domain/chat/system-notices';
import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PieceResetService', () => {
  const originalCursor = PeerCursor.myCursor;
  let service: PieceResetService;
  let tab: ChatTab;
  let others: ChatTab[] = [];
  let systemTabIndex: number;
  let made: GameCharacter[] = [];
  let told: ResetCarriedOutEvent[];
  let stop: () => void;

  function beSeat(role: PeerRole): void {
    PeerCursor.myCursor = { role, userId: 'me', identifier: 'seat' } as PeerCursor;
  }

  function piece(name: string): { character: GameCharacter; hit: DataElement } {
    const character = GameCharacter.create(name, 1, '');
    character.addExtendData();
    const hit = DataElement.create('命中', 9, {
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.NUMBER,
      [DataElementAttribute.DEFAULT]: '3',
    });
    character.detailDataElement!.children[0].appendChild(hit);
    made.push(character);
    return { character, hit };
  }

  const buffsOf = (character: GameCharacter) => character.buffs.list().map((data) => data.name);
  const said = () => tab.chatMessages.map((message) => message.text);
  const everything = { rule: { kind: 'all' as const }, values: true };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(PieceResetService);
    systemTabIndex = ChatTabList.instance.systemMessageTabIndex;
    tab = ChatTabList.instance.addChatTab('リセットの確認');
    ChatTabList.instance.systemMessageTabIndex = ChatTabList.instance.chatTabs.indexOf(tab);
    told = [];
    stop = resetCarriedOut$.subscribe((event) => told.push(event));
    beSeat(PeerRole.Player);
  });

  afterEach(() => {
    stop();
    PeerCursor.myCursor = originalCursor;
    for (const character of made) character.destroy();
    made = [];
    ChatTabList.instance.systemMessageTabIndex = systemTabIndex;
    for (const each of [tab, ...others]) each.destroy();
    others = [];
    TestBed.inject(StatusAilmentService).save([]);
    StatusAilmentCatalog.forget();
  });

  it('resets the pieces, reports it, and tells this device what it did under the line of the report', () => {
    const { character, hit } = piece('騎士');
    character.buffs.addRound('盾', '防御+1', 3);

    const count = service.run([character], everything, (done) => `リセット ${done.buffs}/${done.items}`);

    expect(count).toEqual({ characters: 1, buffs: 1, items: 1 });
    expect([hit.value, buffsOf(character)]).toEqual([3, []]);
    const line = tab.chatMessages.at(-1)!;
    expect(line.text).toBe('リセット 1/1');
    expect(told).toHaveLength(1);
    expect(told[0].messageIdentifier).toBe(line.identifier);
    expect((told[0].record as ResetRecord).pieces.map((entry) => entry.piece)).toEqual([character.identifier]);
  });

  describe('in a room that sends notices of rounds nowhere', () => {
    beforeEach(() => {
      Config.instance.systemNotices = withNoticeRoute(DEFAULT_SYSTEM_NOTICES, 'round', NOTICE_OFF);
    });

    afterEach(() => {
      Config.instance.systemNotices = DEFAULT_SYSTEM_NOTICES;
    });

    it('still resets, and writes the report for this seat alone, with the way back under it', () => {
      const { character, hit } = piece('騎士');
      character.buffs.addRound('盾', '防御+1', 3);

      service.run([character], everything, (done) => `リセット ${done.buffs}/${done.items}`);

      expect([hit.value, buffsOf(character)]).toEqual([3, []]);
      const line = tab.chatMessages.at(-1)!;
      expect([line.text, line.to, line.isSystemToPL]).toEqual(['リセット 1/1', 'me', true]);
      expect(line.isDisplayableTo('another')).toBe(false);
      expect(told.map((event) => event.messageIdentifier)).toEqual([line.identifier]);
    });

    it('tells this seat alone that the reset was taken back as well', () => {
      const { character, hit } = piece('騎士');
      service.run([character], everything, () => 'リセット');
      const line = tab.chatMessages.at(-1)!;
      TestBed.inject(ResetUndoService).keep(line.identifier, told[0].record as ResetRecord);

      expect(service.takeBack(line)).toMatchObject({ restored: 1, skipped: 0 });

      expect(hit.value).toBe(9);
      const notice = tab.chatMessages.at(-1)!;
      expect(notice.text).toBe(encodeI18nMessage('feature.chat.reset.undoneNotice', { restored: 1 }));
      expect([notice.to, notice.isDisplayableTo('another')]).toEqual(['me', false]);
    });
  });

  it('tells nothing where no line reports the reset, or where the reset changed nothing', () => {
    const { character, hit } = piece('騎士');

    service.run([character], everything, () => null);
    expect(hit.value).toBe(3);
    service.run([character], everything, () => '何も変わらない');

    expect(told).toEqual([]);
  });

  it('tells a debuff from a buff by the states the room keeps', () => {
    TestBed.inject(StatusAilmentService).save([newStatusAilment('毒')]);
    const { character } = piece('騎士');
    character.buffs.addRound('盾', '防御+1', 3);
    character.buffs.addRound('毒', '', 3);

    expect(service.count([character], { rule: { kind: 'debuffs' }, values: false }).buffs).toBe(1);
    service.run([character], { rule: { kind: 'debuffs' }, values: false }, () => null);

    expect(buffsOf(character)).toEqual(['盾']);
  });

  it('counts a piece with the parts that go with it', () => {
    const body = piece('竜');
    const head = piece('竜の頭');
    head.character.ridingOn = body.character.identifier;
    head.character.rideSeat = 'part';

    expect(service.withParts(body.character)).toEqual([body.character, head.character]);
    expect(service.count(service.withParts(body.character), everything)).toEqual({ characters: 2, buffs: 0, items: 2 });
  });

  it('resets nothing, reports nothing and tells nothing for a seat that only watches', () => {
    const { character, hit } = piece('騎士');
    character.buffs.addRound('盾', '防御+1', 3);
    const lines = said().length;
    beSeat(PeerRole.Guest);

    expect(service.run([character], everything, () => 'リセット')).toBeNull();

    expect([hit.value, buffsOf(character)]).toEqual([9, ['盾']]);
    expect(said()).toHaveLength(lines);
    expect(told).toEqual([]);
  });

  it('takes a reset back from its line, once, and tells the room on the tab of that line', () => {
    const { character, hit } = piece('騎士');
    const other = ChatTabList.instance.addChatTab('別のタブ');
    others.push(other);
    const line = other.addMessage({ from: 'System', name: 'me', text: 'リセット', timestamp: 1, tag: 'system' });
    service.run([character], everything, () => 'リセット');
    TestBed.inject(ResetUndoService).keep(line.identifier, told[0].record as ResetRecord);

    expect(service.takeBack(line)).toMatchObject({ restored: 1, skipped: 0 });

    expect(hit.value).toBe(9);
    expect(other.chatMessages.at(-1)!.text).toBe(encodeI18nMessage('feature.chat.reset.undoneNotice', { restored: 1 }));
    const lines = other.chatMessages.length;
    expect(service.takeBack(line)).toBeNull();
    expect(other.chatMessages).toHaveLength(lines);
  });

  it('tells the room nothing where no piece could be put back', () => {
    const { character, hit } = piece('騎士');
    service.run([character], everything, () => 'リセット');
    const line = tab.chatMessages.at(-1)!;
    TestBed.inject(ResetUndoService).keep(line.identifier, told[0].record as ResetRecord);
    hit.value = 7;
    const lines = tab.chatMessages.length;

    expect(service.takeBack(line)).toMatchObject({ restored: 0, skipped: 1 });
    expect(tab.chatMessages).toHaveLength(lines);
  });
});

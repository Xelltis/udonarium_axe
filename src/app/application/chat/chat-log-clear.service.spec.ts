import { TestBed } from '@angular/core/testing';
import {
  type ChatLogClearReach,
  ChatLogClearService,
  clearedMomentText,
} from '@axe/application/chat/chat-log-clear.service';
import { decodeI18nMessage } from '@axe/application/i18n/i18n-message';
import { Network } from '@axe/core/network/network';
import { ObjectNode } from '@axe/core/sync/object-node';
import { formatLogMoment } from '@axe/domain/chat/chat-log-rich';
import type { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ChatLogClearService', () => {
  let service: ChatLogClearService;
  let tab: ChatTab;

  const beSeat = (role: PeerRole) => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = role;
    PeerCursor.myCursor.name = 'アリス';
  };
  const say = (text: string, timestamp: number) => tab.addMessage({ from: 'someone', name: '誰か', text, timestamp });
  /** What people said, the notices the tool posted left out. */
  const said = () => tab.chatMessages.filter((line) => !line.isSystemMessage).map((line) => line.text);
  const noticeKeys = () =>
    tab.chatMessages
      .filter((line) => line.isSystemMessage)
      .map((line) => decodeI18nMessage(line.text, (key, params) => `${key} ${JSON.stringify(params ?? {})}`));

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ChatLogClearService);
    tab = ChatTabList.instance.addChatTab('メイン');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ChatTabList.forget();
    PeerCursor.myCursor = null!;
  });

  it('clears the whole log, puts the portraits back and says who cleared it', () => {
    beSeat(PeerRole.Player);
    say('先週の発言', 1000);
    say('今日の発言', 5000);
    const stray = new ObjectNode();
    stray.initialize();
    tab.appendChild(stray);
    const reset = vi.spyOn(tab, 'portraitReset');

    service.clear(tab);

    expect(said()).toEqual([]);
    expect(reset).toHaveBeenCalledTimes(1);
    // Whatever else the tab held went with the whole log: only the notice of the clearing is left.
    expect(tab.children).toHaveLength(1);
    expect(noticeKeys()).toEqual(['common.chat.logClearedBy {"user":"アリス"}']);
  });

  describe('with whispers between others among the lines', () => {
    let last: ChatMessage;

    beforeEach(() => {
      beSeat(PeerRole.GameMaster);
      const me = beMyself('alice').userId;
      say('みんなへ', 1000);
      tab.addMessage({ from: 'bob', name: 'ボブ', text: 'ボブからキャロルへ', timestamp: 2000, to: 'carol' });
      tab.addMessage({ from: 'bob', name: 'ボブ', text: 'ボブから私へ', timestamp: 3000, to: me });
      tab.addMessage({ from: me, name: 'アリス', text: '私からボブへ', timestamp: 4000, to: 'bob' });
      last = say('区切り', 5000);
    });

    const reaches: [string, () => ChatLogClearReach | undefined, string[]][] = [
      ['the whole log', () => undefined, []],
      ['the lines before a moment', () => ({ before: 4500 }), ['区切り']],
      ['the lines before a line', () => ({ beforeLine: last }), ['区切り']],
    ];

    it.each(reaches)('takes and counts only what this seat may see when clearing %s', (_, reachOf, left) => {
      const reach = reachOf();

      expect(service.linesWithin(tab, reach).map((line) => line.text)).toEqual(
        ['みんなへ', 'ボブから私へ', '私からボブへ', '区切り'].filter((text) => !left.includes(text))
      );
      service.clear(tab, reach);

      // The whisper between the others stands where it stood, whoever cleared and however far.
      expect(said()).toEqual(['ボブからキャロルへ', ...left]);
    });
  });

  it('clears only the lines said before a moment, leaving the portraits, and names the moment', () => {
    beSeat(PeerRole.Player);
    const moment = new Date(2026, 10, 18, 21, 5).getTime();
    say('先週の発言', moment - 60_000);
    say('ちょうどその時刻の発言', moment);
    say('今日の発言', moment + 60_000);
    const reset = vi.spyOn(tab, 'portraitReset');

    service.clear(tab, { before: moment });

    expect(said()).toEqual(['ちょうどその時刻の発言', '今日の発言']);
    expect(reset).not.toHaveBeenCalled();
    expect(noticeKeys()).toEqual([
      `common.chat.logClearedBeforeBy {"user":"アリス","time":"${clearedMomentText(moment)}"}`,
    ]);
    expect(clearedMomentText(moment)).toContain('2026/11/18 21:05 (UTC');
  });

  it('cuts at where a line stands in the log, which for a line disclosed later is when it was disclosed', () => {
    beSeat(PeerRole.Player);
    say('先に言った発言', 1000);
    const kept = say('伏せて振った結果', 2000);
    kept.disclosedAt = 6000;
    say('あとの発言', 5000);

    service.clear(tab, { before: 4000 });
    expect(said()).toEqual(['あとの発言', '伏せて振った結果']);

    service.clear(tab, { beforeLine: kept });
    expect(said()).toEqual(['伏せて振った結果']);
    expect(noticeKeys().at(-1)).toContain(clearedMomentText(6000));
  });

  it('leaves a tab alone, with nothing posted, where no line of it is within reach', () => {
    beSeat(PeerRole.Player);
    say('今日の発言', 5000);

    service.clear(tab, { before: 4000 });

    expect(tab.chatMessages.map((line) => line.text)).toEqual(['今日の発言']);
  });

  it('clears the lines standing before a line, that line and those after it left', () => {
    beSeat(PeerRole.Player);
    say('先週の発言', 1000);
    say('先週の返事', 2000);
    const first = say('今日の最初の発言', 5000);
    say('今日の次の発言', 6000);

    expect(service.linesWithin(tab, { beforeLine: first }).map((line) => line.text)).toEqual([
      '先週の発言',
      '先週の返事',
    ]);
    service.clear(tab, { beforeLine: first });

    expect(said()).toEqual(['今日の最初の発言', '今日の次の発言']);
  });

  it('takes nothing before a line that is not in the tab', () => {
    beSeat(PeerRole.Player);
    say('残る発言', 1000);
    const other = ChatTabList.instance.addChatTab('雑談');
    const elsewhere = other.addMessage({ from: 'someone', name: '誰か', text: '別のタブ', timestamp: 2000 });

    expect(service.linesWithin(tab, { beforeLine: elsewhere })).toEqual([]);
  });

  it('clears nothing for a seat that is only watching', () => {
    beSeat(PeerRole.Guest);
    say('残る発言', 1000);

    expect(service.canClear).toBe(false);
    service.clear(tab);
    service.clear(tab, { before: 9000 });

    expect(tab.chatMessages.map((line) => line.text)).toEqual(['残る発言']);
  });

  it('leaves the dice a room server rolled to anyone but the game master', () => {
    vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
    beSeat(PeerRole.Player);
    say('先週の発言', 1000);
    const rolled = tab.addMessage({ from: 'System-BCDice', name: 'ダイス', text: '2D6 → 7', timestamp: 1500 });
    rolled.serverRoll = true;

    service.clear(tab, { before: 9000 });
    expect(said()).toEqual(['2D6 → 7']);

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    service.clear(tab, { before: 9000 });
    expect(tab.chatMessages).not.toContain(rolled);
  });

  it('writes a moment as the local date and time to the minute', () => {
    const moment = new Date(2026, 0, 2, 3, 4, 59).getTime();
    expect(formatLogMoment(moment)).toBe('2026/01/02 03:04');
    // The notice says how far the seat's time stands from UTC, for seats that keep another.
    expect(clearedMomentText(moment)).toMatch(/^2026\/01\/02 03:04 \(UTC[+-]\d{1,2}(:\d{2})?\)$/);
  });
});

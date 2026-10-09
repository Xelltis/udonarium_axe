import type { ImageFile } from '@axe/core/storage/image-file';
import type { ChatLogLine, ChatLogTab } from '@axe/domain/chat/chat-log-exporter';
import { renderPlainChatLog } from '@axe/domain/chat/chat-log-plain';

const BASE = new Date(2026, 9, 9, 20, 15).getTime();
const MINUTE = 60 * 1000;

function line(overrides: Partial<ChatLogLine> = {}): ChatLogLine {
  const timestamp = overrides.timestamp ?? BASE;
  return {
    name: 'アリア',
    text: 'こんばんは',
    messColor: '#aa3333',
    timestamp,
    placedAt: overrides.placedAt ?? timestamp,
    from: 'user-1',
    to: '',
    fixd: false,
    isSecret: false,
    isSendFromSelf: true,
    isDisplayable: true,
    isSentBy: () => false,
    image: null,
    attachmentImages: [],
    quoteOf: '',
    quoteOfMessage: null,
    replyTo: '',
    replyToMessage: null,
    vnEmote: '',
    isSystemMessage: false,
    isDicebot: false,
    rollDetail: null,
    isOutOfStory: false,
    isPseudoDeleted: false,
    ...overrides,
  };
}

function tab(name: string, lines: ChatLogLine[]): ChatLogTab {
  return { name, chatMessages: lines };
}

function bodyOf(log: string): string[] {
  return log.split('\n').slice(2);
}

describe('renderPlainChatLog', () => {
  it('heads the log with its tab and room, and when and with what it was written', () => {
    const log = renderPlainChatLog('tab', [tab('メイン', [])], { roomName: '卓', exportedAt: BASE });

    expect(log.split('\n').slice(0, 2)).toEqual(['メイン — 卓', 'Udonarium Axe · 2026/10/09 20:15']);
  });

  it('writes each line under its time and name, below a line for its day', () => {
    const log = renderPlainChatLog('tab', [tab('メイン', [line()])]);

    expect(bodyOf(log)).toEqual(['', '--- 2026/10/09 ---', '[20:15] アリア：こんばんは', '']);
  });

  it('indents the later lines of something said over several', () => {
    const log = renderPlainChatLog('tab', [tab('メイン', [line({ text: '一行目\n二行目' })])]);

    expect(log).toContain('[20:15] アリア：一行目\n    二行目\n');
  });

  it('keeps what a secret roll says to the one who rolled it', () => {
    const roll = line({ name: '<BCDice：ノア>', text: '(1D100) → 3', isSecret: true, isSentBy: (id) => id === 'noa' });

    expect(renderPlainChatLog('tab', [tab('メイン', [roll])], { userId: 'someone' })).toContain(
      '<BCDice：ノア>：（シークレットダイス）'
    );
    expect(renderPlainChatLog('tab', [tab('メイン', [roll])], { userId: 'noa' })).toContain('(1D100) → 3');
  });

  it('leaves out a whisper the reader had no part in', () => {
    const whisper = line({ text: '内緒の話', from: 'user-A', to: 'user-C' });

    expect(renderPlainChatLog('tab', [tab('メイン', [whisper])], { userId: 'user-B' })).not.toContain('内緒の話');
    expect(renderPlainChatLog('tab', [tab('メイン', [whisper])], { userId: 'user-C' })).toContain('内緒の話');
  });

  it('marks an edited line and a deleted one', () => {
    const log = renderPlainChatLog('tab', [
      tab('メイン', [line({ text: '直した', fixd: true }), line({ text: '消した', isPseudoDeleted: true })]),
    ]);

    expect(log).toContain('アリア：直した（編集済）');
    expect(log).toContain('アリア：消した（削除済）');
  });

  it('writes a ruby as the words with their reading after them', () => {
    const log = renderPlainChatLog('tab', [tab('メイン', [line({ text: '|火球《ファイアボール》を撃つ' })])]);

    expect(log).toContain('アリア：火球（ファイアボール）を撃つ');
  });

  it('writes the line replied to under the reply, and a secret one by what stands in for it', () => {
    const said = line({ name: 'GM', text: '扉の向こうから物音がする' });
    const secret = line({ name: '<BCDice：GM>', text: '(1D100) → 3', isSecret: true });
    const log = renderPlainChatLog(
      'tab',
      [
        tab('メイン', [
          line({ name: 'ノア', text: '開ける', replyTo: 'x', replyToMessage: said as never }),
          line({ name: 'ノア', text: 'どうだった？', quoteOf: 'y', quoteOfMessage: secret as never }),
        ]),
      ],
      { userId: 'noa' }
    );

    expect(log).toContain('ノア：開ける\n    ↩ 返信先 GM：扉の向こうから物音がする\n');
    expect(log).toContain('ノア：どうだった？\n    ❝ 引用 <BCDice：GM>：シークレットダイス\n');
  });

  it('names a picture sent with a line', () => {
    const picture = { identifier: 'a1', url: 'blob:a1', name: '地図.png' } as unknown as ImageFile;
    const log = renderPlainChatLog('tab', [tab('メイン', [line({ text: '見て', attachmentImages: [picture] })])]);

    expect(log).toContain('アリア：見て\n    [地図.png]\n');
  });

  it('puts every tab in one log by when lines were placed, each under its tab', () => {
    const log = renderPlainChatLog('all', [
      tab('メイン', [line({ text: '先', timestamp: BASE }), line({ text: '後', timestamp: BASE + 2 * MINUTE })]),
      tab('雑談', [line({ text: '間', timestamp: BASE + MINUTE })]),
    ]);

    expect(bodyOf(log).filter((each) => each.startsWith('['))).toEqual([
      '[20:15] [メイン] アリア：先',
      '[20:16] [雑談] アリア：間',
      '[20:17] [メイン] アリア：後',
    ]);
  });
});

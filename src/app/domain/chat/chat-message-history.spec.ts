import {
  appendChatMessageEdit,
  chatMessageVersions,
  parseChatMessageEdits,
} from '@axe/domain/chat/chat-message-history';

describe('the history of a chat line', () => {
  it('keeps each earlier wording, oldest first, with when it was replaced', () => {
    const once = appendChatMessageEdit('', '最初', 2000);
    const twice = appendChatMessageEdit(once, '二度目', 3000);

    expect(parseChatMessageEdits(twice)).toEqual([
      { text: '最初', at: 2000 },
      { text: '二度目', at: 3000 },
    ]);
  });

  it('keeps the first wording and the newest ones once there are too many', () => {
    let history = '';
    for (let i = 0; i < 6; i++) history = appendChatMessageEdit(history, `版${i}`, i, 4);

    expect(parseChatMessageEdits(history).map((edit) => edit.text)).toEqual(['版0', '版3', '版4', '版5']);
  });

  it('reads nothing from what is not a history, and passes over entries that cannot be read', () => {
    expect(parseChatMessageEdits(undefined)).toEqual([]);
    expect(parseChatMessageEdits('')).toEqual([]);
    expect(parseChatMessageEdits('{')).toEqual([]);
    expect(parseChatMessageEdits(42)).toEqual([]);
    expect(parseChatMessageEdits('[null, {"text":1,"at":2}, {"text":"ok","at":"5"}]')).toEqual([{ text: 'ok', at: 5 }]);
  });

  it('dates each wording from when it began: the first from when the line was said', () => {
    const edits = [
      { text: '最初', at: 2000 },
      { text: '二度目', at: 3000 },
    ];

    expect(chatMessageVersions(edits, '今', 1000)).toEqual([
      { text: '最初', at: 1000 },
      { text: '二度目', at: 2000 },
      { text: '今', at: 3000 },
    ]);
  });

  it('has no versions to show for a line with no earlier wordings kept', () => {
    expect(chatMessageVersions([], '今', 1000)).toEqual([]);
  });
});

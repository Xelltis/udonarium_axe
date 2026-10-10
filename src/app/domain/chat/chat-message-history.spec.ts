import { appendChatMessageEdit, chatMessageVersions, hasChatMessageEdits } from '@axe/domain/chat/chat-message-history';

describe('the history of a chat line', () => {
  const said = { saidAt: 1000, editedBeforeKept: false };

  it('dates each wording from when it began and counts the edit that gave it', () => {
    const once = appendChatMessageEdit('', '最初', 2000, said);
    const twice = appendChatMessageEdit(once, '二度目', 3000, said);

    expect(chatMessageVersions(twice, '今')).toEqual([
      { text: '最初', since: 1000, edit: 0 },
      { text: '二度目', since: 2000, edit: 1 },
      { text: '今', since: 3000, edit: 2 },
    ]);
  });

  it('knows neither when nor by which edit a line edited before anything was kept began', () => {
    const history = appendChatMessageEdit('', '記録前の文面', 2000, { saidAt: 1000, editedBeforeKept: true });
    const later = appendChatMessageEdit(history, '一度直した', 3000, said);

    expect(chatMessageVersions(later, '今')).toEqual([
      { text: '記録前の文面', since: null, edit: null },
      { text: '一度直した', since: 2000, edit: null },
      { text: '今', since: 3000, edit: null },
    ]);
  });

  it('keeps the first wording and the newest once there are too many, each still dated and counted truly', () => {
    let history = '';
    for (let i = 0; i < 6; i++) history = appendChatMessageEdit(history, `版${i}`, (i + 2) * 1000, said, 4);

    expect(chatMessageVersions(history, '今')).toEqual([
      { text: '版0', since: 1000, edit: 0 },
      { text: '版3', since: 4000, edit: 3 },
      { text: '版4', since: 5000, edit: 4 },
      { text: '版5', since: 6000, edit: 5 },
      { text: '今', since: 7000, edit: 6 },
    ]);
  });

  it('reads nothing from what is not a history, and passes over entries that cannot be read', () => {
    expect(chatMessageVersions(undefined, '今')).toEqual([]);
    expect(chatMessageVersions('{', '今')).toEqual([]);
    expect(chatMessageVersions(42, '今')).toEqual([]);
    expect(hasChatMessageEdits('')).toBe(false);

    const history = '[null, {"text":1,"until":2}, {"text":"ok","since":"5","until":"7","edit":"x"}]';

    expect(chatMessageVersions(history, '今')).toEqual([
      { text: 'ok', since: 5, edit: null },
      { text: '今', since: 7, edit: null },
    ]);
  });

  it('has no versions to show for a line with no earlier wording kept', () => {
    expect(chatMessageVersions('', '今')).toEqual([]);
  });
});

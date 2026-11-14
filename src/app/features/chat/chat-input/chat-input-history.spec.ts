import { ChatInputHistory } from '@axe/features/chat/chat-input/chat-input-history';

describe('ChatInputHistory', () => {
  function historyOf(...lines: string[]): ChatInputHistory {
    const history = new ChatInputHistory();
    for (const line of lines) history.push(line);
    return history;
  }

  it('gives the blank draft either way while nothing was sent', () => {
    const history = new ChatInputHistory();

    expect(history.navigate(-1)).toBe('');
    expect(history.navigate(1)).toBe('');
  });

  it('goes back from the newest line to the oldest', () => {
    const history = historyOf('一', '二', '三');

    expect([history.navigate(-1), history.navigate(-1), history.navigate(-1)]).toEqual(['三', '二', '一']);
  });

  it('goes forward again past the newest line to the blank draft, and back to the newest from there', () => {
    const history = historyOf('一', '二');
    history.navigate(-1);
    history.navigate(-1);

    expect(history.navigate(1)).toBe('二');
    expect(history.navigate(1)).toBe('');
    expect(history.navigate(-1)).toBe('二');
  });

  it('goes back past the oldest line to the blank draft, and round to the newest again', () => {
    const history = historyOf('一', '二');
    history.navigate(-1);
    history.navigate(-1);

    expect(history.navigate(-1)).toBe('');
    expect(history.navigate(-1)).toBe('二');
  });

  it('goes forward from the blank draft round to the oldest line', () => {
    const history = historyOf('一', '二');

    expect(history.navigate(1)).toBe('一');
    expect(history.navigate(1)).toBe('二');
    expect(history.navigate(1)).toBe('');
  });

  it('starts from the newest line again once another is sent', () => {
    const history = historyOf('一', '二');
    history.navigate(-1);
    history.navigate(-1);

    history.push('三');

    expect(history.navigate(-1)).toBe('三');
  });

  it('lets go of the oldest line past its limit', () => {
    const history = new ChatInputHistory();
    for (let index = 0; index <= ChatInputHistory.MAX; index++) history.push(`${index}`);

    let oldest = '';
    for (let step = 0; step < ChatInputHistory.MAX; step++) oldest = history.navigate(-1);

    expect(oldest).toBe('1');
  });
});

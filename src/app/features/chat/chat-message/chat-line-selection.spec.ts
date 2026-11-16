import { wordsPickedOutIn } from '@axe/features/chat/chat-message/chat-line-selection';

describe('wordsPickedOutIn', () => {
  let line: HTMLElement;
  let other: HTMLElement;

  function pickOut(...nodes: Node[]): void {
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    const range = document.createRange();
    range.setStart(nodes[0], 0);
    const last = nodes[nodes.length - 1];
    range.setEnd(last, last.childNodes.length);
    selection.addRange(range);
  }

  beforeEach(() => {
    line = document.createElement('div');
    line.textContent = 'こんにちは';
    other = document.createElement('div');
    other.textContent = 'ほかの行';
    document.body.append(line, other);
  });

  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    line.remove();
    other.remove();
  });

  it('says nothing reaches the line while nothing is picked out', () => {
    expect(wordsPickedOutIn(line)).toEqual({ reachesLine: false, inside: '' });
  });

  it('gives the words picked out where all of them lie inside the line', () => {
    pickOut(line);

    expect(wordsPickedOutIn(line)).toEqual({ reachesLine: true, inside: 'こんにちは' });
  });

  it('says words picked out in another line do not reach this one', () => {
    pickOut(other);

    expect(wordsPickedOutIn(line)).toEqual({ reachesLine: false, inside: '' });
  });

  it('gives no words where what is picked out runs past the line', () => {
    pickOut(line, other);

    expect(wordsPickedOutIn(line)).toEqual({ reachesLine: true, inside: '' });
  });
});

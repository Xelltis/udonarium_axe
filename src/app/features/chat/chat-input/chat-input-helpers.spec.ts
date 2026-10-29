import { Network } from '@axe/core/index';
import { GameCharacter } from '@axe/domain/character/game-character';
import { allowsChat, editsTextInPlace, lineStartOf } from '@axe/features/chat/chat-input/chat-input-helpers';

interface MutableCharacter {
  location: { name: string };
  nonTalkFlag: boolean;
}

function makeCharacter(locationName: string, nonTalkFlag = false): MutableCharacter {
  return { location: { name: locationName }, nonTalkFlag };
}

function setPeerContexts(contexts: Array<{ peerId: string; isOpen: boolean }>): void {
  vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue(contexts as never);
}

describe('allowsChat()', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is true for a piece on the table that may speak', () => {
    const c = makeCharacter('table');
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(true);
  });

  it('is false for one that may not', () => {
    const c = makeCharacter('table', true);
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(false);
  });

  it('is true for one that may not when that is ignored', () => {
    const c = makeCharacter('table', true);
    expect(allowsChat(c as unknown as GameCharacter, 'me', true)).toBe(true);
  });

  it('is true for a piece in your own hands', () => {
    const c = makeCharacter('me');
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(true);
  });

  it('is false for one there that may not speak', () => {
    const c = makeCharacter('me', true);
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(false);
  });

  it('is always false in the graveyard', () => {
    expect(allowsChat(makeCharacter('graveyard') as unknown as GameCharacter, 'me')).toBe(false);
    expect(allowsChat(makeCharacter('graveyard', true) as unknown as GameCharacter, 'me', true)).toBe(false);
  });

  it('is false in the open hands of another peer', () => {
    setPeerContexts([{ peerId: 'other', isOpen: true }]);
    const c = makeCharacter('other');
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(false);
  });

  it('is true in their closed ones', () => {
    setPeerContexts([{ peerId: 'other', isOpen: false }]);
    const c = makeCharacter('other');
    expect(allowsChat(c as unknown as GameCharacter, 'me')).toBe(true);
  });

  it('sees the swapped peer contexts through the real network reference', () => {
    setPeerContexts([{ peerId: 'p1', isOpen: true }]);
    expect(Network.peerContexts).toEqual([{ peerId: 'p1', isOpen: true }]);
  });
});

describe('editsTextInPlace', () => {
  function element(html: string): HTMLElement {
    const host = document.createElement('div');
    host.innerHTML = html;
    return host.firstElementChild as HTMLElement;
  }

  it('leaves the keys to the window from the box chat lines are typed into, whatever it is', () => {
    expect(editsTextInPlace(element('<textarea data-chat-input></textarea>'))).toBe(false);
    const editor = element('<div data-chat-input contenteditable="true"><div class="line">x</div></div>');
    expect(editsTextInPlace(editor)).toBe(false);
    expect(editsTextInPlace(editor.firstElementChild)).toBe(false);
  });

  it('keeps the keys in any other box text is written in', () => {
    expect(editsTextInPlace(element('<textarea></textarea>'))).toBe(true);
    expect(editsTextInPlace(element('<input type="text">'))).toBe(true);
    expect(editsTextInPlace(element('<input type="checkbox">'))).toBe(false);
  });
});

describe('lineStartOf', () => {
  it('finds the start of the line a place stands on, the first line too', () => {
    expect(lineStartOf('\n2d6', 0)).toBe(0);
    expect(lineStartOf('\n2d6', 1)).toBe(1);
    expect(lineStartOf('a\nbc', 3)).toBe(2);
    expect(lineStartOf('abc', 2)).toBe(0);
  });
});

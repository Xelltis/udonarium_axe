import {
  buildChatBookmarkMenu,
  buildChatMessageContextMenu,
  ChatMessageMenuCallbacks,
  ChatMessageMenuState,
} from '@axe/features/chat/chat-message/chat-message-context-menu';

const translate = (key: string) => key;

function state(partial: Partial<ChatMessageMenuState> = {}): ChatMessageMenuState {
  return {
    canInteract: true,
    canReact: false,
    canShareAsMemo: true,
    canChange: true,
    bookmarkKinds: [],
    afterWhisperTargets: null,
    canUndoAfterWhisper: false,
    canPseudoDelete: false,
    canShowInTicker: true,
    copyTargets: [{ identifier: 'tab-2', name: 'サブタブ' }],
    hasOriginal: true,
    hasHistory: false,
    isHistoryOpen: false,
    text: 'こんにちは',
    selectedText: '',
    isTouch: false,
    ...partial,
  };
}

function callbacks(): ChatMessageMenuCallbacks {
  return {
    reply: vi.fn(),
    quote: vi.fn(),
    react: vi.fn(),
    copyToTab: vi.fn(),
    shareAsMemo: vi.fn(),
    edit: vi.fn(),
    toggleBookmark: vi.fn(),
    whisperTo: vi.fn(),
    undoAfterWhisper: vi.fn(),
    pseudoDelete: vi.fn(),
    showInTicker: vi.fn(),
    toggleHistory: vi.fn(),
    jumpToOriginal: vi.fn(),
    copyText: vi.fn(),
    selectText: vi.fn(),
  };
}

describe('buildChatMessageContextMenu()', () => {
  it('offers to put a stamp on the line among the answers, to whoever may', () => {
    const handlers = callbacks();
    const names = (menu: { name: string }[]) => menu.map((entry) => entry.name);

    const menu = buildChatMessageContextMenu(state({ canReact: true }), handlers, translate);
    expect(names(menu).slice(0, 3)).toEqual([
      'feature.chat.message.reply',
      'feature.chat.message.quote',
      'feature.chat.message.react',
    ]);
    menu[2].action!();
    expect(handlers.react).toHaveBeenCalled();

    const guestMenu = buildChatMessageContextMenu(
      state({ canInteract: false, canReact: true }),
      callbacks(),
      translate
    );
    expect(names(guestMenu)[0]).toBe('feature.chat.message.react');
    expect(names(buildChatMessageContextMenu(state(), callbacks(), translate))).not.toContain(
      'feature.chat.message.react'
    );
  });

  it('groups everything by what it is for, from answering the line to deleting it, last and apart', () => {
    const menu = buildChatMessageContextMenu(
      state({
        bookmarkKinds: [
          { kind: 'shared', isBookmarked: false },
          { kind: 'personal', isBookmarked: true },
        ],
        afterWhisperTargets: [{ identifier: 'peer-noa', name: 'ノア' }],
        canUndoAfterWhisper: true,
        canPseudoDelete: true,
        hasHistory: true,
      }),
      callbacks(),
      translate
    );

    expect(menu.map((action) => action.name)).toEqual([
      'feature.chat.message.reply',
      'feature.chat.message.quote',
      '',
      'feature.chat.message.copyText',
      '',
      'feature.chat.message.bookmarks.shared.add',
      'feature.chat.message.bookmarks.personal.remove',
      'feature.chat.message.shareAsMemo',
      'feature.chat.message.copyToTab',
      'feature.chat.message.ticker',
      '',
      'feature.chat.message.jumpToOriginal',
      'feature.chat.message.history.open',
      '',
      'feature.chat.message.edit',
      'feature.chat.message.afterWhisper',
      'feature.chat.message.undoAfterWhisper',
      '',
      'feature.chat.message.deleteLine',
    ]);
  });

  it('parts only the groups that have something in them', () => {
    const menu = buildChatMessageContextMenu(
      state({
        canInteract: false,
        canChange: false,
        canShowInTicker: false,
        hasOriginal: false,
        canPseudoDelete: true,
      }),
      callbacks(),
      translate
    );

    expect(menu.map((action) => action.name)).toEqual([
      'feature.chat.message.copyText',
      '',
      'feature.chat.message.deleteLine',
    ]);
  });

  it('closes the history it opened, and calls back for both', () => {
    const calls = callbacks();
    const open = buildChatMessageContextMenu(state({ hasHistory: true, isHistoryOpen: true }), calls, translate);

    open.find((action) => action.name === 'feature.chat.message.history.close')!.action?.();

    expect(calls.toggleHistory).toHaveBeenCalledOnce();
  });

  it('calls back for the kind of mark chosen', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(
      state({ bookmarkKinds: [{ kind: 'personal', isBookmarked: false }] }),
      calls,
      translate
    );

    menu.find((action) => action.name === 'feature.chat.message.bookmarks.personal.add')!.action?.();

    expect(calls.toggleBookmark).toHaveBeenCalledWith('personal');
  });

  it('offers whispering the line afterwards to one of the room, after editing', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(
      state({ afterWhisperTargets: [{ identifier: 'peer-noa', name: 'ノア' }] }),
      calls,
      translate
    );
    const names = menu.map((action) => action.name);
    const whisper = menu.find((action) => action.name === 'feature.chat.message.afterWhisper')!;

    expect(names.indexOf('feature.chat.message.afterWhisper')).toBe(names.indexOf('feature.chat.message.edit') + 1);
    expect(whisper.subActions?.map((peer) => peer.name)).toEqual(['ノア']);
    whisper.subActions?.[0].action?.();
    expect(calls.whisperTo).toHaveBeenCalledWith('peer-noa');
  });

  it('says so, and offers nothing to press, when nobody else is in the room', () => {
    const menu = buildChatMessageContextMenu(state({ afterWhisperTargets: [] }), callbacks(), translate);
    const nobody = menu.find((action) => action.name === 'feature.chat.message.afterWhisperNobody');

    expect(nobody?.enabled).toBe(false);
    expect(menu.map((action) => action.name)).not.toContain('feature.chat.message.afterWhisper');
  });

  it('offers putting an after-the-fact whisper back for everyone', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state({ canUndoAfterWhisper: true }), calls, translate);

    menu.find((action) => action.name === 'feature.chat.message.undoAfterWhisper')!.action?.();

    expect(calls.undoAfterWhisper).toHaveBeenCalledOnce();
  });

  it('offers deleting a line the reader may delete, and nowhere else', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state({ canPseudoDelete: true }), calls, translate);
    menu.find((action) => action.name === 'feature.chat.message.deleteLine')!.action?.();
    expect(calls.pseudoDelete).toHaveBeenCalledOnce();

    const others = buildChatMessageContextMenu(state(), calls, translate);
    expect(others.map((action) => action.name)).not.toContain('feature.chat.message.deleteLine');
  });

  it('offers only the words of a line nothing else can be done with', () => {
    const menu = buildChatMessageContextMenu(
      state({ canInteract: false, canChange: false, canShowInTicker: false, hasOriginal: false }),
      callbacks(),
      translate
    );

    expect(menu.map((action) => action.name)).toEqual(['feature.chat.message.copyText']);
  });

  it('keeps a guest from making a note, and a line meant for one person from being copied', () => {
    const menu = buildChatMessageContextMenu(state({ canShareAsMemo: false, copyTargets: [] }), callbacks(), translate);
    const names = menu.map((action) => action.name);

    expect(names).not.toContain('feature.chat.message.shareAsMemo');
    expect(names).not.toContain('feature.chat.message.copyToTab');
  });

  it('lists the tabs to copy into under one item', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state(), calls, translate);
    const copy = menu.find((action) => action.name === 'feature.chat.message.copyToTab')!;

    expect(copy.subActions?.map((tab) => tab.name)).toEqual(['サブタブ']);
    copy.subActions?.[0].action?.();
    expect(calls.copyToTab).toHaveBeenCalledWith('tab-2');
  });

  it('leaves copying out where the words are kept from the reader', () => {
    const menu = buildChatMessageContextMenu(state({ text: '' }), callbacks(), translate);
    const names = menu.map((action) => action.name);

    expect(names).not.toContain('feature.chat.message.copyText');
    expect(names.at(-1)).not.toBe('');
  });

  it('copies the whole line where nothing in it is picked out', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state({ selectedText: ' \n' }), calls, translate);

    menu.find((action) => action.name === 'feature.chat.message.copyText')?.action?.();

    expect(calls.copyText).toHaveBeenCalledWith('こんにちは');
  });

  it('copies only the words picked out inside the line when there are some', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(
      state({ text: 'こんにちは、みなさん', selectedText: 'みなさん' }),
      calls,
      translate
    );

    menu.find((action) => action.name === 'feature.chat.message.copyText')?.action?.();

    expect(calls.copyText).toHaveBeenCalledWith('みなさん');
  });

  it('offers picking the words out on a touch screen, after copying them', () => {
    const menu = buildChatMessageContextMenu(state({ isTouch: true }), callbacks(), translate);
    const names = menu.map((action) => action.name);
    const copy = names.indexOf('feature.chat.message.copyText');

    expect(names[copy + 1]).toBe('feature.chat.message.selectText');
  });

  it('offers no picking out under a mouse, which picks words out by itself', () => {
    const menu = buildChatMessageContextMenu(state({ isTouch: false }), callbacks(), translate);

    expect(menu.map((action) => action.name)).not.toContain('feature.chat.message.selectText');
  });

  it('offers no picking out where the words are kept from the reader', () => {
    const menu = buildChatMessageContextMenu(state({ isTouch: true, text: '' }), callbacks(), translate);

    expect(menu.map((action) => action.name)).not.toContain('feature.chat.message.selectText');
  });

  it('calls back rather than acting on the line itself', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state({ isTouch: true }), calls, translate);

    menu.find((action) => action.name === 'feature.chat.message.reply')?.action?.();
    menu.find((action) => action.name === 'feature.chat.message.copyText')?.action?.();
    menu.find((action) => action.name === 'feature.chat.message.selectText')?.action?.();

    expect(calls.reply).toHaveBeenCalledTimes(1);
    expect(calls.copyText).toHaveBeenCalledTimes(1);
    expect(calls.selectText).toHaveBeenCalledTimes(1);
  });

  describe('buildChatBookmarkMenu()', () => {
    it('offers the room’s mark and then the reader’s own, each to put on or take off', () => {
      const toggle = vi.fn();
      const menu = buildChatBookmarkMenu(
        [
          { kind: 'shared', isBookmarked: true },
          { kind: 'personal', isBookmarked: false },
        ],
        toggle,
        translate
      );

      expect(menu.map((action) => action.name)).toEqual([
        'feature.chat.message.bookmarks.shared.remove',
        'feature.chat.message.bookmarks.personal.add',
      ]);
      menu[1].action?.();
      expect(toggle).toHaveBeenCalledWith('personal');
    });

    it('offers only the kinds the reader may change', () => {
      const menu = buildChatBookmarkMenu([{ kind: 'personal', isBookmarked: false }], vi.fn(), translate);

      expect(menu.map((action) => action.name)).toEqual(['feature.chat.message.bookmarks.personal.add']);
    });
  });
});

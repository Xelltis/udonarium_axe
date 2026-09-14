import {
  buildChatMessageContextMenu,
  ChatMessageMenuCallbacks,
  ChatMessageMenuState,
} from '@axe/features/chat/chat-message/chat-message-context-menu';

const translate = (key: string) => key;

function state(partial: Partial<ChatMessageMenuState> = {}): ChatMessageMenuState {
  return {
    canInteract: true,
    canShareAsMemo: true,
    canChange: true,
    canShowInTicker: true,
    copyTargets: [{ identifier: 'tab-2', name: 'サブタブ' }],
    hasOriginal: true,
    text: 'こんにちは',
    ...partial,
  };
}

function callbacks(): ChatMessageMenuCallbacks {
  return {
    reply: vi.fn(),
    quote: vi.fn(),
    copyToTab: vi.fn(),
    shareAsMemo: vi.fn(),
    edit: vi.fn(),
    showInTicker: vi.fn(),
    jumpToOriginal: vi.fn(),
    copyText: vi.fn(),
  };
}

describe('buildChatMessageContextMenu()', () => {
  it('offers what the buttons on the line offer, and copying its words last', () => {
    const menu = buildChatMessageContextMenu(state(), callbacks(), translate);

    expect(menu.map((action) => action.name)).toEqual([
      'feature.chat.message.reply',
      'feature.chat.message.quote',
      'feature.chat.message.copyToTab',
      'feature.chat.message.shareAsMemo',
      'feature.chat.messageFix.change',
      'feature.chat.message.ticker',
      'feature.chat.message.jumpToOriginal',
      '',
      'feature.chat.message.copyText',
    ]);
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

  it('calls back rather than acting on the line itself', () => {
    const calls = callbacks();
    const menu = buildChatMessageContextMenu(state(), calls, translate);

    menu.find((action) => action.name === 'feature.chat.message.reply')?.action?.();
    menu.find((action) => action.name === 'feature.chat.message.copyText')?.action?.();

    expect(calls.reply).toHaveBeenCalledTimes(1);
    expect(calls.copyText).toHaveBeenCalledTimes(1);
  });
});

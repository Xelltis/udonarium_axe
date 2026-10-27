import { ChatLine, chatLineAbilities, ChatLinePermissions } from '@axe/features/chat/chat-message/chat-line-abilities';

function line(more: Partial<NonNullable<ChatLine['message']>> = {}, readOnly = false): ChatLine {
  return {
    message: { isSystemMessage: false, isSystemToPL: false, isShownInChat: true, sentStamp: '', ...more },
    readOnly,
  };
}

function allowing(more: Partial<ChatLinePermissions> = {}): ChatLinePermissions {
  return {
    edit: () => true,
    makeAfterWhisper: () => true,
    undoAfterWhisper: () => true,
    pseudoDelete: () => true,
    react: () => true,
    editTable: () => true,
    ...more,
  };
}

describe('what a reader may do with a line', () => {
  it('lets a line said by a player be answered, stamped, edited and laid on the table', () => {
    const may = chatLineAbilities(line(), allowing());

    expect([may.interact, may.react, may.change, may.pseudoDelete, may.shareAsMemo]).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it('offers nothing on a line drawn only to be read', () => {
    const may = chatLineAbilities(line({}, true), allowing());

    expect([may.interact, may.react, may.change, may.makeAfterWhisper, may.pseudoDelete, may.shareAsMemo]).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it('answers no line the app posted and no notice addressed to a player', () => {
    expect(chatLineAbilities(line({ isSystemMessage: true }), allowing()).interact).toBe(false);
    expect(chatLineAbilities(line({ isSystemToPL: true }), allowing()).interact).toBe(false);
  });

  it('puts stamps only on a line the reader is shown, where the room lets them', () => {
    expect(chatLineAbilities(line({ isShownInChat: false }), allowing()).react).toBe(false);
    expect(chatLineAbilities(line(), allowing({ react: () => false })).react).toBe(false);
  });

  it('has no words to edit on a line sent as a stamp', () => {
    expect(chatLineAbilities(line({ sentStamp: 'seal:ok' }), allowing()).change).toBe(false);
  });

  it('leaves the table to whoever may put things on it', () => {
    expect(chatLineAbilities(line(), allowing({ editTable: () => false })).shareAsMemo).toBe(false);
  });

  it('asks the room only for what it is asked', () => {
    const editTable = vi.fn(() => true);
    const may = chatLineAbilities(line(), allowing({ editTable }));

    void may.change;
    expect(editTable).not.toHaveBeenCalled();

    void may.shareAsMemo;
    expect(editTable).toHaveBeenCalledOnce();
  });
});

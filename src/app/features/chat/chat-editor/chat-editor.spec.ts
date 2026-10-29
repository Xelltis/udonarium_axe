import { type ChatEditorHost, mountChatEditor } from '@axe/features/chat/chat-editor/chat-editor';

describe('the chat editor', () => {
  it('names the box again as what the empty box says changes, as with the language', () => {
    let says = '話す';
    const host = {
      mode: 'chat',
      placeholder: () => says,
      changed: () => undefined,
      session: () => null,
      completionWords: () => ({
        statuses: [],
        variables: [],
        portraits: [],
        effects: [],
        buffs: [],
        cutIns: [],
        diceExamples: [],
      }),
      language: () => 'ja',
      cutInNames: () => new Set<string>(),
      portraitImage: () => null,
      translate: (key: string) => key,
    } as unknown as ChatEditorHost;
    const parent = document.createElement('div');
    document.body.append(parent);
    const field = mountChatEditor(parent, { text: '', selection: { from: 0, to: 0 }, focused: false }, host);
    try {
      const box = parent.querySelector('[contenteditable]')!;
      expect(box.getAttribute('aria-label')).toBe('話す');

      says = 'Say';
      field.reconfigure();

      expect(box.getAttribute('aria-label')).toBe('Say');
    } finally {
      field.destroy();
      parent.remove();
    }
  });
});

import { withoutChatDecoration } from '@axe/domain/chat/chat-decoration';
import { type ChatEditorField, type ChatEditorHost, mountChatEditor } from '@axe/features/chat/chat-editor/chat-editor';

describe('the chat editor', () => {
  let parent: HTMLElement;
  let field: ChatEditorField | null = null;
  let says: string;

  const host = (): ChatEditorHost =>
    ({
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
    }) as unknown as ChatEditorHost;

  function mount(text: string): ChatEditorField {
    field = mountChatEditor(parent, { text, selection: { from: 0, to: 0 }, focused: false }, host());
    return field;
  }

  beforeEach(() => {
    says = '話す';
    parent = document.createElement('div');
    document.body.append(parent);
  });

  afterEach(() => {
    field?.destroy();
    field = null;
    parent.remove();
  });

  it('names the box again as what the empty box says changes, as with the language', () => {
    const editor = mount('');
    const box = parent.querySelector('[contenteditable]')!;
    expect(box.getAttribute('aria-label')).toBe('話す');

    says = 'Say';
    editor.reconfigure();

    expect(box.getAttribute('aria-label')).toBe('Say');
  });

  it('writes over a stretch across the edge of a decoration, leaving its marks where they stand', () => {
    const editor = mount('**abc**d');

    editor.replaceRange(4, 8, '2D6 ');

    expect(withoutChatDecoration(editor.text())).toBe('ab2D6 ');
    expect(editor.text().startsWith('**ab')).toBe(true);
  });

  it('puts the caret after what it wrote, and keeps a selection beyond it where it stood', () => {
    const editor = mount('x **y** z');

    editor.replaceRange(0, 0, 'S', { from: 4 + 1, to: 5 + 1 });

    expect(editor.text()).toBe('Sx **y** z');
    expect(editor.selection()).toEqual({ from: 5, to: 6 });
  });
});

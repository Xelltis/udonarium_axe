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

  /** Types letters one at a time, as the browser hands them over, the shortcuts typed as syntax and all. */
  function type(editor: ChatEditorField, letters: string): void {
    const view = editor.editor.view;
    for (const letter of letters) {
      const { from, to } = view.state.selection;
      const taken = view.someProp('handleTextInput', (handle) =>
        handle(view, from, to, letter, () => view.state.tr.insertText(letter, from, to))
      );
      if (!taken) view.dispatch(view.state.tr.insertText(letter, from, to));
    }
  }

  it('makes a decoration closed round a chip, as round any other text', () => {
    const editor = mount('');

    type(editor, '**{HP}**');

    expect(editor.text()).toBe('**{HP}**');
    expect(parent.querySelector('strong, .chat-deco-bold, b')).not.toBeNull();
  });

  it('splits a paragraph where a line break comes into it, so that each line is a paragraph', () => {
    const editor = mount('ab');
    const view = editor.editor.view;

    editor.select({ from: 1, to: 1 });
    view.dispatch(view.state.tr.insertText('x\ny'));

    expect(view.state.doc.childCount).toBe(2);
    expect(editor.text()).toBe('ax\nyb');
    expect(editor.selection()).toEqual({ from: 4, to: 4 });
  });

  it('puts a portrait in at the end plain, whatever the caret stands in', () => {
    const editor = mount('**ab**');
    editor.select({ from: 3, to: 3 });

    editor.insertChip({ kind: 'portrait', command: { type: 'name', name: 'face' }, raw: '@face' }, 'end');

    expect(editor.text()).toBe('**ab** @face');
    expect(editor.editor.state.doc.lastChild!.lastChild!.marks).toEqual([]);
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

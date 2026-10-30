import { withoutChatDecoration } from '@axe/domain/chat/chat-decoration';
import { type ChatEditorField, type ChatEditorHost, mountChatEditor } from '@axe/features/chat/chat-editor/chat-editor';
import { closeHistory } from '@tiptap/pm/history';

describe('the chat editor', () => {
  let parent: HTMLElement;
  let field: ChatEditorField | null = null;
  let says: string;
  let language: 'ja' | 'en';

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
      }),
      language: () => language,
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
    language = 'ja';
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

  it('makes the name picked after an at mark the chip the line is read back as, a cut-in’s name too', async () => {
    const editor = mountChatEditor(parent, { text: '', selection: { from: 0, to: 0 }, focused: false }, {
      ...host(),
      completionWords: () => ({ ...host().completionWords(), cutIns: ['bgm'] }),
      cutInNames: () => new Set(['bgm']),
    } as ChatEditorHost);
    field = editor;
    const view = editor.editor.view;
    type(editor, 'hi @bg');
    await new Promise((resolve) => setTimeout(resolve));
    view.someProp('handleKeyDown', (handle) => handle(view, new KeyboardEvent('keydown', { key: 'Enter' })));
    const picked = parent.querySelector('[data-chip]')?.getAttribute('data-chip');
    expect(editor.text()).toBe('hi @bgm');

    editor.replaceRange(0, 0, '> ');

    expect(editor.text()).toBe('> hi @bgm');
    expect(parent.querySelector('[data-chip]')?.getAttribute('data-chip')).toBe(picked);
  });

  it('puts the caret at a chip’s edge when asked for a caret inside it, selecting nothing', () => {
    const editor = mount('a{HP}b');

    editor.select({ from: 3, to: 3 });

    const { from, to } = editor.selection();
    expect(from).toBe(to);
  });

  it('keeps the bar over a selection clear of the toolbar above it, and close under it where it opens below', () => {
    const toolbar = { getBoundingClientRect: () => ({ top: 60, bottom: 96, height: 36 }) };
    const editor = mountChatEditor(parent, { text: 'words', selection: { from: 0, to: 0 }, focused: false }, {
      ...host(),
      toolbarElement: () => toolbar,
    } as unknown as ChatEditorHost);
    field = editor;
    const gap = (placement: string) =>
      (editor as unknown as { bubbleGap(placement: string, top: number, height: number): number }).bubbleGap(
        placement,
        100,
        30
      );

    expect(gap('top')).toBeGreaterThan(40);
    expect(gap('bottom')).toBe(8);
  });

  it('pastes the letters as they are with their blank lines kept, where asked to paste them plain', () => {
    const editor = mount('');

    editor.editor.view.pasteText('line1\n\n**line2**');

    expect(editor.text()).toBe('line1\n\n\\**line2\\**');
  });

  it('reads a text dropped in as the chat’s syntax, as a paste is read', () => {
    const editor = mount('');
    const view = editor.editor.view;

    const slice = view.someProp('clipboardTextParser', (parse) =>
      parse('**強打** {HP}', view.state.selection.$from, false, view)
    );

    expect(slice).toBeDefined();
    view.dispatch(view.state.tr.replaceSelection(slice!));
    expect(editor.text()).toBe('**強打** {HP}');
  });

  it('draws a stamp again as it is checked again, once its picture has arrived', () => {
    let picture: string | null = null;
    const keys = new Set<string | undefined>();
    const editor = mountChatEditor(
      parent,
      { text: '見て［絵:image:abc］', selection: { from: 0, to: 0 }, focused: false },
      {
        ...host(),
        stampHtml: (_id: string, key?: string) => {
          keys.add(key);
          return picture;
        },
      } as ChatEditorHost
    );
    field = editor;
    expect(parent.querySelector('[data-chip="stamp"]')?.textContent).toBe('［絵］');

    picture = '<img alt="絵">';
    editor.refresh(false);

    expect(parent.querySelector('[data-chip="stamp"] img')).not.toBeNull();
    expect(keys.size).toBe(1);
    expect([...keys][0]).toBeTruthy();
  });

  it('names the buttons of the bar over a selection again as the language changes', () => {
    let tongue = 'ja';
    const editor = mountChatEditor(parent, { text: '', selection: { from: 0, to: 0 }, focused: false }, {
      ...host(),
      translate: (key: string) => `${tongue}:${key}`,
    } as unknown as ChatEditorHost);
    field = editor;
    const bar = (editor as unknown as { bubble: { element: HTMLElement } }).bubble.element;
    expect(bar.querySelector('button')?.getAttribute('aria-label')).toBe('ja:feature.chat.decoration.bold');

    tongue = 'en';
    editor.reconfigure();

    expect(bar.querySelector('button')?.getAttribute('aria-label')).toBe('en:feature.chat.decoration.bold');
    expect(bar.querySelector('.chat-rich-bubble-clear')?.getAttribute('title')).toBe(
      'en:feature.chat.toolbar.clearColor'
    );
  });

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

  it('keeps a line written as it was when the reader switches the language, until it is touched again', () => {
    const editor = mount('[赤]x[/赤]');
    editor.select({ from: 5, to: 5 });
    type(editor, 'y');
    expect(editor.text()).toBe('[赤]xy[/赤]');

    language = 'en';
    expect(editor.text()).toBe('[赤]xy[/赤]');

    type(editor, 'z');
    expect(editor.text()).toBe('[red]xyz[/red]');
  });

  it('brings back no line cleared as sent with an undo', () => {
    const editor = mount('');
    type(editor, 'sent');
    const view = editor.editor.view;
    view.dispatch(closeHistory(view.state.tr));

    editor.setText('', undefined, false);
    editor.editor.commands.undo();

    expect(editor.text()).toBe('');
  });

  it('brings back nothing of what was written before a line cleared as sent, however many times undone', () => {
    const editor = mount('');
    type(editor, 'hello');
    const view = editor.editor.view;
    view.dispatch(closeHistory(view.state.tr));
    view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
    expect(editor.text()).toBe('hell');

    editor.setText('', undefined, false);
    for (let undo = 0; undo < 3; undo++) editor.editor.commands.undo();

    expect(editor.text()).toBe('');
  });

  it('puts a text that waited on a word being made in as asked, and tells the holder what it then holds', () => {
    const told: string[] = [];
    const editor = mountChatEditor(parent, { text: '', selection: { from: 0, to: 0 }, focused: false }, {
      ...host(),
      changed: (text: string) => told.push(text),
    } as ChatEditorHost);
    field = editor;
    type(editor, 'sent');
    const view = editor.editor.view;
    view.dispatch(closeHistory(view.state.tr));
    const input = (view as unknown as { input: { composing: boolean } }).input;

    input.composing = true;
    editor.setText('', undefined, false);
    view.dispatch(view.state.tr.insertText('語'));
    input.composing = false;
    (editor as unknown as { afterComposition(): void }).afterComposition();

    expect(editor.text()).toBe('');
    expect(told.at(-1)).toBe('');
    editor.editor.commands.undo();
    expect(editor.text()).not.toContain('sent');
  });

  it('puts in nothing that waited on a word being made once the editor is taken down', () => {
    const told: string[] = [];
    const editor = mountChatEditor(parent, { text: 'sent', selection: { from: 0, to: 0 }, focused: false }, {
      ...host(),
      changed: (text: string) => told.push(text),
    } as ChatEditorHost);
    const input = (editor.editor.view as unknown as { input: { composing: boolean } }).input;
    input.composing = true;
    editor.setText('');
    input.composing = false;

    editor.destroy();

    expect(() => (editor as unknown as { afterComposition(): void }).afterComposition()).not.toThrow();
    expect(told).toEqual([]);
  });

  it('writes over a stretch across the edge of a decoration, leaving its marks where they stand', () => {
    const editor = mount('**abc**d');

    editor.replaceRange(4, 8, '2D6 ');

    expect(withoutChatDecoration(editor.text())).toBe('ab2D6 ');
    expect(editor.text().startsWith('**ab')).toBe(true);
  });

  it('reads what it writes as syntax, as typed syntax is read', () => {
    const editor = mount('ab');

    editor.replaceRange(1, 1, '**x**');

    expect(editor.text()).toBe('a**x**b');
    expect(editor.editor.state.doc.firstChild!.child(1).marks.map((mark) => mark.type.name)).toContain('chatBold');
  });

  it('writes what begins a line before the decoration the line starts with', () => {
    const editor = mount('**大事な話**');

    editor.replaceRange(0, 0, '> ');

    expect(editor.text()).toBe('> **大事な話**');
  });

  it('puts what it writes where it was written, a letter like its stand-in elsewhere in the line or not', () => {
    const editor = mount('\ue000a');

    editor.replaceRange(2, 2, 'b');

    expect(editor.text()).toBe('\ue000ab');
  });

  it('puts the caret after what it wrote, and keeps a selection beyond it where it stood', () => {
    const editor = mount('x **y** z');

    editor.replaceRange(0, 0, 'S', { from: 4 + 1, to: 5 + 1 });

    expect(editor.text()).toBe('Sx **y** z');
    expect(editor.selection()).toEqual({ from: 5, to: 6 });
  });
});

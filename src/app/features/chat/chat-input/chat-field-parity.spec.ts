import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';
import { type ChatEditorHost, mountChatEditor } from '@axe/features/chat/chat-editor/chat-editor';
import {
  type ChatFieldSelection,
  type ChatTextField,
  TextareaChatField,
} from '@axe/features/chat/chat-input/chat-text-field';

const STAMP = '［了解:seal:ok］';
const CUT_INS = new Set(['登場', '退場']);

const host = (): ChatEditorHost =>
  ({
    mode: 'chat',
    placeholder: () => '',
    changed: () => undefined,
    session: () => null,
    completionWords: () => ({ statuses: [], variables: [], portraits: [], effects: [], buffs: [], cutIns: [] }),
    language: () => 'ja',
    cutInNames: () => CUT_INS,
    portraitImage: () => null,
    translate: (key: string) => key,
  }) as unknown as ChatEditorHost;

const chips: Record<string, ChatRichChip> = {
  face: { kind: 'portrait', raw: '@face', command: { type: 'name', name: 'face' } },
  cutIn: { kind: 'cutIn', raw: '退場', name: '退場', soundOnly: false },
  stamp: { kind: 'stamp', raw: STAMP, id: 'seal:ok', label: '了解' },
};

interface Case {
  readonly name: string;
  readonly text: string;
  readonly selection: ChatFieldSelection;
  readonly act: (field: ChatTextField) => void;
}

const cases: Case[] = [
  ...['', 'hello', 'hello ', 'hello @hide', 'hello @hide ', `hello @hide${STAMP}`, `hello ${STAMP}`, 'a\nb'].flatMap(
    (text): Case[] => [
      {
        name: `puts a portrait at the end of ${JSON.stringify(text)}`,
        text,
        selection: { from: 0, to: 0 },
        act: (field) => field.insertChip(chips['face'], 'end'),
      },
      {
        name: `puts a stamp at the caret in ${JSON.stringify(text)}`,
        text,
        selection: { from: Math.min(2, text.length), to: Math.min(2, text.length) },
        act: (field) => field.insertChip(chips['stamp'], 'caret'),
      },
    ]
  ),
  ...['hello 登場', 'hello @face', 'hello 登場 @face', `hello 登場${STAMP} @face`, '@face', 'hello world'].flatMap(
    (text): Case[] => [
      {
        name: `puts a portrait at the end of ${JSON.stringify(text)}`,
        text,
        selection: { from: 0, to: 0 },
        act: (field) => field.insertChip(chips['face'], 'end'),
      },
      {
        name: `puts a cut-in at the end of ${JSON.stringify(text)}`,
        text,
        selection: { from: 0, to: 0 },
        act: (field) => field.insertChip(chips['cutIn'], 'end'),
      },
    ]
  ),
  {
    name: 'puts a stamp over what is selected',
    text: 'hello world',
    selection: { from: 6, to: 11 },
    act: (field) => field.insertChip(chips['stamp'], 'caret'),
  },
  {
    name: 'writes a word over what is selected',
    text: 'hello world',
    selection: { from: 0, to: 5 },
    act: (field) => field.replaceRange(0, 5, 'bye'),
  },
  {
    name: 'writes a word inside a bold one',
    text: '**hello**',
    selection: { from: 4, to: 4 },
    act: (field) => field.replaceRange(4, 4, 'X'),
  },
  {
    name: 'writes a command plain inside a bold word, outside the bold',
    text: '**abcd**',
    selection: { from: 4, to: 4 },
    act: (field) => field.replaceRange(4, 4, ' :HP-1', undefined, true),
  },
  {
    name: 'writes a command plain over coloured words, selecting part of it',
    text: '[赤]abcd[/赤] e',
    selection: { from: 4, to: 6 },
    act: (field) => field.replaceRange(4, 6, ':MP-2', { from: 5, to: 7 }, true),
  },
  {
    name: 'writes a command after a stamp',
    text: `hello${STAMP}`,
    selection: { from: 5 + STAMP.length, to: 5 + STAMP.length },
    act: (field) => field.replaceRange(5 + STAMP.length, 5 + STAMP.length, ':HP-1'),
  },
  {
    name: 'writes a word before a stamp, selecting it',
    text: `${STAMP}hello`,
    selection: { from: 0, to: 0 },
    act: (field) => field.replaceRange(0, 0, 'say ', { from: 0, to: 3 }),
  },
  {
    name: 'puts the text in whole with a selection',
    text: '',
    selection: { from: 0, to: 0 },
    act: (field) => field.setText(`a ${STAMP} b`, { from: 2, to: 2 + STAMP.length }),
  },
  {
    name: 'puts bold on what is selected',
    text: 'hello world',
    selection: { from: 0, to: 5 },
    act: (field) => field.applyMark({ kind: 'bold' }),
  },
  {
    name: 'writes a mark at the start of the second line',
    text: 'one\ntwo',
    selection: { from: 6, to: 6 },
    act: (field) => field.replaceRange(4, 4, '> ', { from: 8, to: 8 }, true),
  },
  {
    name: 'puts a ruby at the caret',
    text: 'hello world',
    selection: { from: 6, to: 6 },
    act: (field) => field.insertChip({ kind: 'ruby', base: '漢字', reading: 'かんじ', raw: '|漢字《かんじ》' }),
  },
  {
    name: 'puts a reference over what is selected',
    text: 'HP is X',
    selection: { from: 6, to: 7 },
    act: (field) => field.insertChip({ kind: 'reference', name: 'HP', targeted: false, useMax: false, raw: '{HP}' }),
  },
  {
    name: 'puts an effect at the caret',
    text: 'fire ',
    selection: { from: 5, to: 5 },
    act: (field) => field.insertChip({ kind: 'effect', name: 'fire', battle: false, raw: '《fire》' }),
  },
  {
    name: 'selects a stamp and the words round it',
    text: `a${STAMP}b`,
    selection: { from: 0, to: 2 + STAMP.length },
    act: () => undefined,
  },
  {
    name: 'puts a colour on what is selected',
    text: 'hello world',
    selection: { from: 6, to: 11 },
    act: (field) => field.applyMark({ kind: 'color', value: '#ff0000' }),
  },
];

describe('the plain box and the editor', () => {
  let parent: HTMLElement;
  let editor: { destroy(): void } | null = null;

  beforeEach(() => {
    parent = document.createElement('div');
    document.body.append(parent);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    parent.remove();
  });

  function plainBox(text: string, selection: ChatFieldSelection): ChatTextField {
    const box = document.createElement('textarea');
    parent.append(box);
    const field = new TextareaChatField(
      box,
      () => 'ja',
      () => CUT_INS
    );
    field.setText(text, selection);
    return field;
  }

  function richBox(text: string, selection: ChatFieldSelection): ChatTextField {
    const field = mountChatEditor(parent, { text, selection, focused: false }, host());
    editor = field;
    return field;
  }

  const outcome = (field: ChatTextField) => ({
    text: field.text(),
    selection: field.selection(),
    selected: field.selectedText(),
  });

  for (const { name, text, selection, act } of cases) {
    it(`agree as either ${name}`, () => {
      const plain = plainBox(text, selection);
      const rich = richBox(text, selection);
      act(plain);
      act(rich);
      expect(outcome(rich)).toEqual(outcome(plain));
    });
  }
});

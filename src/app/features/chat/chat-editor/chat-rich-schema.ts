import { chatColorHalo, type ChatFontKey, type ChatSizeKey } from '@axe/domain/chat/chat-decoration';
import { rubyRunsOf } from '@axe/domain/chat/chat-ruby-notation';
import { type AnyExtension, Mark, Node } from '@tiptap/core';
import type { DOMOutputSpec, Node as ProseMirrorNode } from '@tiptap/pm/model';

/** The names the editor's marks and chips go by in its document. */
export const CHAT_MARK = {
  bold: 'chatBold',
  italic: 'chatItalic',
  strike: 'chatStrike',
  size: 'chatSize',
  font: 'chatFont',
  color: 'chatColor',
} as const;

export const CHAT_CHIP = {
  ruby: 'chatRuby',
  reference: 'chatReference',
  effect: 'chatEffect',
  portrait: 'chatPortrait',
  cutIn: 'chatCutIn',
} as const;

export type ChatChipNodeName = (typeof CHAT_CHIP)[keyof typeof CHAT_CHIP];

/** The whole text: one paragraph to a line, so a line's rules (stars pair within it) stay its own. */
const ChatDocument = Node.create({ name: 'doc', topNode: true, content: 'paragraph+' });

/**
 * A line. It keeps the text it was read from, for a line nobody touched to be written back to the
 * letter; a line split off from it starts with none.
 */
const ChatParagraph = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  whitespace: 'pre',
  addAttributes() {
    return { source: { default: null, rendered: false, keepOnSplit: false } };
  },
  parseHTML() {
    return [{ tag: 'p' }];
  },
  renderHTML() {
    return ['p', { class: 'chat-rich-line' }, 0];
  },
});

const ChatText = Node.create({ name: 'text', group: 'inline' });

/** A mark that is either on or off: bold, italic or a line through. */
function switchMark(name: string, className: string, shortcut: string) {
  return Mark.create({
    name,
    parseHTML() {
      return [{ tag: `span.${className}` }];
    },
    renderHTML() {
      return ['span', { class: `chat-deco ${className}` }, 0];
    },
    addKeyboardShortcuts() {
      return { [shortcut]: () => this.editor.commands.toggleMark(this.name) };
    },
  });
}

/** A mark that sets one value of a kind: a size, a font or a colour; another value takes its place. */
function valueMark(name: string, attributes: (value: string) => Record<string, string>) {
  return Mark.create({
    name,
    addAttributes() {
      return { value: { default: null, rendered: false } };
    },
    renderHTML({ mark }) {
      return ['span', attributes(String(mark.attrs['value'])), 0];
    },
  });
}

const ChatBold = switchMark(CHAT_MARK.bold, 'chat-deco-bold', 'Mod-b');
const ChatItalic = switchMark(CHAT_MARK.italic, 'chat-rich-italic', 'Mod-i');
const ChatStrike = switchMark(CHAT_MARK.strike, 'chat-deco-strike', 'Mod-Shift-s');
const ChatSize = valueMark(CHAT_MARK.size, (value) => ({ class: `chat-deco chat-size-${value as ChatSizeKey}` }));
const ChatFont = valueMark(CHAT_MARK.font, (value) => ({ class: `chat-deco chat-font-${value as ChatFontKey}` }));
const ChatColor = valueMark(CHAT_MARK.color, (value) => {
  const halo = chatColorHalo(value);
  return { class: 'chat-deco', style: `color: ${value}${halo ? `; text-shadow: ${halo}` : ''}` };
});

/** What a chip counts as where text is read letter by letter, as the input rules read it: one letter that is none. */
export const CHIP_LETTER = '\ufffc';

/** What every chip holds: the text it was written with, which it is written back as. */
const RAW = { raw: { default: '', rendered: false } };

/** A piece of syntax shown whole, which is selected, deleted and moved as one. */
function chipNode(
  name: string,
  attributes: Record<string, { default: unknown; rendered: false }>,
  render: (props: { node: ProseMirrorNode }) => DOMOutputSpec
) {
  return Node.create({
    name,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    marks: '_',
    addAttributes() {
      return { ...RAW, ...attributes };
    },
    renderText() {
      return CHIP_LETTER;
    },
    renderHTML({ node }) {
      return render({ node });
    },
  });
}

/** An icon from the tool's own icon font, for a chip to show what kind it is. */
function icon(name: string): [string, Record<string, string>, string] {
  return ['i', { class: 'material-icons chat-chip-icon', 'aria-hidden': 'true' }, name];
}

const ChatRuby = chipNode(
  CHAT_CHIP.ruby,
  { base: { default: '', rendered: false }, reading: { default: '', rendered: false } },
  ({ node }) => [
    'ruby',
    { class: 'chat-ruby chat-chip-ruby', 'data-chip': 'ruby' },
    ...rubyRunsOf(String(node.attrs['base']), String(node.attrs['reading'])).flatMap((run) => [
      ['rb', run.base],
      ['rt', run.reading],
    ]),
  ]
);

const ChatReference = chipNode(
  CHAT_CHIP.reference,
  {
    name: { default: '', rendered: false },
    targeted: { default: false, rendered: false },
    useMax: { default: false, rendered: false },
  },
  ({ node }) => [
    'span',
    { class: 'chat-chip chat-chip-reference', 'data-chip': 'reference' },
    ...(node.attrs['targeted'] ? [['span', { class: 'chat-chip-badge' }, 'T']] : []),
    String(node.attrs['name']),
    ...(node.attrs['useMax'] ? [['span', { class: 'chat-chip-badge' }, 'MAX']] : []),
  ]
);

const ChatEffect = chipNode(
  CHAT_CHIP.effect,
  { name: { default: '', rendered: false }, battle: { default: false, rendered: false } },
  ({ node }) => [
    'span',
    { class: 'chat-chip chat-chip-effect', 'data-chip': 'effect' },
    icon(node.attrs['battle'] ? 'bolt' : 'auto_awesome'),
    String(node.attrs['name']),
  ]
);

const ChatPortrait = chipNode(CHAT_CHIP.portrait, {}, ({ node }) => [
  'span',
  { class: 'chat-chip chat-chip-portrait', 'data-chip': 'portrait' },
  ['span', { class: 'chat-chip-thumb' }],
  icon('portrait'),
  String(node.attrs['raw']).replace(/^[@＠]/, ''),
]);

const ChatCutIn = chipNode(
  CHAT_CHIP.cutIn,
  { name: { default: '', rendered: false }, soundOnly: { default: false, rendered: false } },
  ({ node }) => [
    'span',
    { class: 'chat-chip chat-chip-cut-in', 'data-chip': 'cut-in' },
    icon(node.attrs['soundOnly'] ? 'volume_up' : 'movie'),
    String(node.attrs['name']),
  ]
);

/** Everything a chat line's document is made of. */
export const CHAT_RICH_EXTENSIONS: AnyExtension[] = [
  ChatDocument,
  ChatParagraph,
  ChatText,
  ChatBold,
  ChatItalic,
  ChatStrike,
  ChatSize,
  ChatFont,
  ChatColor,
  ChatRuby,
  ChatReference,
  ChatEffect,
  ChatPortrait,
  ChatCutIn,
];

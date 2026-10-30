import type { ChatRichChip } from '@axe/domain/chat/chat-rich-text';
import { isBattleChatTokenName } from '@axe/domain/effect/effect-chat-token';
import {
  type ChatCompletionWords,
  chatTriggerOptions,
  findChatTrigger,
} from '@axe/features/chat/chat-editor/chat-editor-complete';
import { nodeOfChip } from '@axe/features/chat/chat-editor/chat-rich-convert';
import { CHIP_LETTER } from '@axe/features/chat/chat-editor/chat-rich-schema';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { Extension } from '@tiptap/core';
import { type EditorState, PluginKey } from '@tiptap/pm/state';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';

/** How many names are offered at once. */
const MOST_OFFERED = 30;

/** What the list of names asks of the editor. */
export interface ChatSuggestHost {
  completionWords(): ChatCompletionWords;
}

/**
 * The chip a name picked after an at mark becomes: the portrait command the line is read back as,
 * a cut-in's name among them, as the line is sent as one too, its sound playing where the speaker
 * has no such portrait.
 */
function tailChip(name: string): ChatRichChip {
  return { kind: 'portrait', raw: `@${name}`, command: { type: 'name', name } };
}

/**
 * The list of names offered where the syntax being written takes one: statuses and variables after
 * `{`, effects after `《`, portraits and cut-ins after an at mark, statuses after a colon and buffs
 * after an ampersand that start a word. A reference, an effect, a portrait and a cut-in become chips,
 * a reference taking in its closing brace where one stands after the caret already;
 * a status and a buff are written as text after their mark. It opens over the caret, as the chat
 * sits at the foot of the screen. Up and Down move through it, Enter or Tab take the name, and
 * Escape puts it away; while it is open, Enter does not send. Where no name is offered, it does not
 * open, and takes no key.
 */
export function chatSuggestExtension(host: ChatSuggestHost): Extension {
  const offered = new WeakMap<EditorState, string[]>();
  const offeredNow = (state: EditorState): string[] => {
    const known = offered.get(state);
    if (known) return known;
    const names = offeredAt(state, host);
    offered.set(state, names);
    return names;
  };
  return Extension.create({
    name: 'chatSuggest',
    priority: 1100,
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        Suggestion<string, string>({
          editor,
          pluginKey: new PluginKey('chatSuggest'),
          char: '{',
          findSuggestionMatch: ({ $position }) => {
            const before = $position.parent.textBetween(0, $position.parentOffset, undefined, CHIP_LETTER);
            const trigger = findChatTrigger(before);
            if (!trigger) return null;
            const start = $position.start() + trigger.from;
            return {
              range: { from: start, to: $position.pos },
              query: trigger.query,
              text: before.slice(trigger.from),
            };
          },
          allow: ({ state }) => offeredNow(state).length > 0,
          items: ({ editor: current }) => offeredNow(current.state),
          command: ({ editor: current, range, props: name }) => {
            const written = current.state.doc.textBetween(range.from, range.to, undefined, CHIP_LETTER);
            const trigger = findChatTrigger(written);
            if (!trigger) return;
            const marks = current.state.storedMarks ?? current.state.selection.$from.marks();
            const schema = current.schema;
            const tr = current.state.tr;
            if (trigger.kind === 'status' || trigger.kind === 'buff') {
              const mark = written.slice(0, written.length - trigger.query.length);
              tr.replaceWith(range.from, range.to, schema.text(mark + name, marks));
            } else {
              const chip: ChatRichChip =
                trigger.kind === 'reference'
                  ? {
                      kind: 'reference',
                      raw: `${/^[tTｔＴ]/.test(written) ? 't' : ''}{${name}}`,
                      name,
                      targeted: /^[tTｔＴ]/.test(written),
                      useMax: false,
                    }
                  : trigger.kind === 'effect'
                    ? { kind: 'effect', raw: `《${name}》`, name, battle: isBattleChatTokenName(name) }
                    : tailChip(name);
              const kept = trigger.kind === 'tail' ? [] : marks;
              const lineEnd = current.state.doc.resolve(range.to).end();
              const after = current.state.doc.textBetween(
                range.to,
                Math.min(range.to + 1, lineEnd),
                undefined,
                CHIP_LETTER
              );
              const to = trigger.kind === 'reference' && /^[}｝]$/.test(after) ? range.to + 1 : range.to;
              tr.replaceWith(range.from, to, nodeOfChip(schema, chip, kept));
            }
            current.view.dispatch(tr.scrollIntoView());
            current.view.focus();
          },
          render: () => suggestionList(),
        }),
      ];
    },
  });
}

/**
 * The names offered where the caret stands. Where none is, the list is not taken up at all, so
 * that Escape and Enter are left to the box, as they are in an editor that offers no names. They
 * are worked out once for each state of the editor, which asks first whether to offer and then what.
 */
function offeredAt(state: EditorState, host: ChatSuggestHost): string[] {
  const $position = state.selection.$from;
  const before = $position.parent.textBetween(0, $position.parentOffset, undefined, CHIP_LETTER);
  const trigger = findChatTrigger(before);
  return trigger ? chatTriggerOptions(trigger, host.completionWords()).slice(0, MOST_OFFERED) : [];
}

/**
 * Scrolls a list just far enough for an entry in it to be seen whole, as the keys move through
 * entries past what it shows.
 */
export function keepInView(
  list: { scrollTop: number; readonly clientHeight: number },
  entry: { readonly offsetTop: number; readonly offsetHeight: number }
): void {
  if (entry.offsetTop < list.scrollTop) list.scrollTop = entry.offsetTop;
  else if (entry.offsetTop + entry.offsetHeight > list.scrollTop + list.clientHeight) {
    list.scrollTop = entry.offsetTop + entry.offsetHeight - list.clientHeight;
  }
}

/** The list the names are shown in, drawn over the caret and moved through by the keys. */
function suggestionList() {
  let element: HTMLElement | null = null;
  let props: SuggestionProps<string, string> | null = null;
  let picked = 0;

  const draw = () => {
    if (!element || !props) return;
    element.replaceChildren();
    element.hidden = props.items.length < 1;
    props.items.forEach((name, index) => {
      const button = element!.ownerDocument.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === picked));
      button.textContent = name;
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => props?.command(name));
      element!.append(button);
    });
    const chosen = element.children[picked];
    if (chosen instanceof HTMLElement) keepInView(element, chosen);
    const rect = props.clientRect?.();
    if (!rect || element.hidden) return;
    const reference = { getBoundingClientRect: () => rect };
    void computePosition(reference, element, {
      strategy: 'fixed',
      placement: 'top-start',
      middleware: [offset(6), flip({ fallbackPlacements: ['bottom-start'] }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (!element) return;
      element.style.left = `${x}px`;
      element.style.top = `${y}px`;
    });
  };

  return {
    onStart(start: SuggestionProps<string, string>) {
      props = start;
      picked = 0;
      element = start.editor.view.dom.ownerDocument.createElement('div');
      element.className = 'chat-rich-menu';
      element.setAttribute('role', 'listbox');
      element.setAttribute('data-testid', 'chat-suggestions');
      start.editor.view.dom.ownerDocument.body.append(element);
      draw();
    },
    onUpdate(update: SuggestionProps<string, string>) {
      props = update;
      picked = Math.min(picked, Math.max(0, update.items.length - 1));
      draw();
    },
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (!props || props.items.length < 1 || event.isComposing) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        picked = (picked + step + props.items.length) % props.items.length;
        draw();
        return true;
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        props.command(props.items[picked]);
        return true;
      }
      if (event.key === 'Escape') {
        element?.remove();
        element = null;
        return true;
      }
      return false;
    },
    onExit() {
      element?.remove();
      element = null;
      props = null;
    },
  };
}

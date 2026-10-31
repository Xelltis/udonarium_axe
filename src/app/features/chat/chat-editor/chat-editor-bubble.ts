import type { TranslateFn } from '@axe/application/i18n/translate.token';
import { CHAT_COLORS, type ChatColorKey, type ChatDecoration } from '@axe/domain/chat/chat-decoration';
import type { ChatMarkChange } from '@axe/features/chat/chat-input/chat-text-field';

/** What the bar over a selection does, and reads. */
export interface ChatBubbleActions {
  apply(change: ChatMarkChange): void;
  active(): ChatDecoration | null;
  openRuby?(): void;
  readonly translate: TranslateFn;
}

/** The bar over a selection, and the way to light its buttons up as the selection changes. */
export interface ChatBubble {
  readonly element: HTMLElement;
  refresh(): void;
  /** Names its buttons again, in the language the tool is now read in. */
  relabel(): void;
}

/**
 * The bar that opens over the words selected: bold, italic, a line through, the colours, and a
 * ruby over them. A press on it keeps the selection where it is, so what it does falls on it.
 */
export function buildChatBubble(document: Document, actions: ChatBubbleActions): ChatBubble {
  const element = document.createElement('div');
  element.className = 'chat-rich-bubble';
  element.setAttribute('role', 'toolbar');
  element.setAttribute('data-testid', 'chat-bubble');
  element.addEventListener('mousedown', (event) => event.preventDefault());

  const t = actions.translate;
  const namings: (() => void)[] = [];
  const name = (made: HTMLElement, titleKey: string, wordsKey?: string) => {
    const naming = () => {
      made.title = t(titleKey);
      made.setAttribute('aria-label', made.title);
      if (wordsKey) made.textContent = t(wordsKey);
    };
    naming();
    namings.push(naming);
  };
  const button = (glyphName: string | null, titleKey: string, run: () => void, wordsKey?: string) => {
    const made = document.createElement('button');
    made.type = 'button';
    if (glyphName) {
      const glyph = document.createElement('i');
      glyph.className = 'material-icons';
      glyph.textContent = glyphName;
      made.append(glyph);
    }
    name(made, titleKey, wordsKey);
    made.addEventListener('click', run);
    element.append(made);
    return made;
  };
  const bold = button('format_bold', 'feature.chat.decoration.bold', () => actions.apply({ kind: 'bold' }));
  const italic = button('format_italic', 'feature.chat.decoration.italic', () => actions.apply({ kind: 'italic' }));
  const strike = button('format_strikethrough', 'feature.chat.decoration.strike', () =>
    actions.apply({ kind: 'strike' })
  );
  bold.dataset['mark'] = 'bold';
  italic.dataset['mark'] = 'italic';
  strike.dataset['mark'] = 'strike';

  const swatches = document.createElement('div');
  swatches.className = 'chat-rich-bubble-swatches';
  swatches.hidden = true;
  for (const key of Object.keys(CHAT_COLORS) as ChatColorKey[]) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'chat-rich-bubble-swatch';
    swatch.style.backgroundColor = CHAT_COLORS[key];
    name(swatch, `feature.chat.decoration.${key}`);
    swatch.addEventListener('click', () => actions.apply({ kind: 'color', value: CHAT_COLORS[key] }));
    swatches.append(swatch);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chat-rich-bubble-swatch chat-rich-bubble-clear';
  name(clear, 'feature.chat.toolbar.clearColor');
  clear.addEventListener('click', () => actions.apply({ kind: 'color', value: null }));
  swatches.append(clear);
  const color = button('format_color_text', 'feature.chat.decoration.color', () => {
    swatches.hidden = !swatches.hidden;
  });
  if (actions.openRuby) {
    const openRuby = actions.openRuby.bind(actions);
    button(null, 'feature.chat.syntax.rubyWrap', () => openRuby(), 'feature.chat.syntax.ruby');
  }
  element.append(swatches);

  return {
    element,
    refresh() {
      const active = actions.active();
      bold.setAttribute('aria-pressed', String(!!active?.bold));
      italic.setAttribute('aria-pressed', String(!!active?.italic));
      strike.setAttribute('aria-pressed', String(!!active?.strike));
      color.style.color = active?.color ?? '';
      if (element.style.visibility === 'hidden' || !element.isConnected) swatches.hidden = true;
    },
    relabel() {
      for (const naming of namings) naming();
    },
  };
}

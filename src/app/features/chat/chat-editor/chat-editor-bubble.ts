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

  const button = (label: string, title: string, run: () => void, icon = true) => {
    const made = document.createElement('button');
    made.type = 'button';
    made.title = title;
    made.setAttribute('aria-label', title);
    if (icon) {
      const glyph = document.createElement('i');
      glyph.className = 'material-icons';
      glyph.textContent = label;
      made.append(glyph);
    } else {
      made.textContent = label;
    }
    made.addEventListener('click', run);
    element.append(made);
    return made;
  };
  const t = actions.translate;
  const bold = button('format_bold', t('feature.chat.decoration.bold'), () => actions.apply({ kind: 'bold' }));
  const italic = button('format_italic', t('feature.chat.decoration.italic'), () => actions.apply({ kind: 'italic' }));
  const strike = button('format_strikethrough', t('feature.chat.decoration.strike'), () =>
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
    swatch.title = t(`feature.chat.decoration.${key}`);
    swatch.setAttribute('aria-label', swatch.title);
    swatch.addEventListener('click', () => actions.apply({ kind: 'color', value: CHAT_COLORS[key] }));
    swatches.append(swatch);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chat-rich-bubble-swatch chat-rich-bubble-clear';
  clear.title = t('feature.chat.toolbar.clearColor');
  clear.setAttribute('aria-label', clear.title);
  clear.addEventListener('click', () => actions.apply({ kind: 'color', value: null }));
  swatches.append(clear);
  const color = button('format_color_text', t('feature.chat.decoration.color'), () => {
    swatches.hidden = !swatches.hidden;
  });
  if (actions.openRuby) {
    const openRuby = actions.openRuby.bind(actions);
    button(t('feature.chat.syntax.ruby'), t('feature.chat.syntax.rubyWrap'), () => openRuby(), false);
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
  };
}

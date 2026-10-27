import { TranslateFn } from '@axe/application/i18n/translate.token';
import { ContextMenuAction, ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import {
  CHAT_COLORS,
  CHAT_FONT_KEYS,
  CHAT_SIZE_KEYS,
  chatDecorationMarks,
  ChatTagKey,
  ChatTagLanguage,
} from '@axe/domain/chat/chat-decoration';

/** The marks a menu item writes round what is selected in the box. */
export interface ChatDecorationMarks {
  open: string;
  close: string;
}

/**
 * The decorations the chat input's button offers: bold, italics and a line through, then the sizes,
 * the fonts and the colours each under a heading of their own.
 *
 * Each item is named with the marks it writes, in the reader's language, so that a reader who picks
 * from it learns how to write the same by hand.
 */
export function buildChatDecorationMenu(
  language: ChatTagLanguage,
  apply: (marks: ChatDecorationMarks) => void,
  t: TranslateFn
): ContextMenuAction[] {
  const item = (key: ChatTagKey, label: string): ContextMenuAction => {
    const marks = chatDecorationMarks(key, language);
    return {
      name: `${t(`feature.chat.decoration.${label}`)}　${marks.open}…${marks.close}`,
      action: () => apply(marks),
    };
  };
  return [
    item('bold', 'bold'),
    item('italic', 'italic'),
    item('strike', 'strike'),
    ContextMenuSeparator,
    { name: t('feature.chat.decoration.size'), subActions: CHAT_SIZE_KEYS.map((size) => item(size, size)) },
    { name: t('feature.chat.decoration.font'), subActions: CHAT_FONT_KEYS.map((font) => item(`font:${font}`, font)) },
    {
      name: t('feature.chat.decoration.color'),
      subActions: (Object.keys(CHAT_COLORS) as (keyof typeof CHAT_COLORS)[]).map((color) =>
        item(`color:${color}`, color)
      ),
    },
  ];
}

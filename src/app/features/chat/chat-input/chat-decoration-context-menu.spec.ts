import { ContextMenuSeparator } from '@axe/application/ui/context-menu.service';
import { buildChatDecorationMenu } from '@axe/features/chat/chat-input/chat-decoration-context-menu';

const translate = (key: string) => key;

describe('buildChatDecorationMenu', () => {
  it('offers the three marks, then the sizes, the fonts and the colours each under a heading', () => {
    const menu = buildChatDecorationMenu('ja', vi.fn(), translate);

    expect(menu.map((item) => item.name)).toEqual([
      'feature.chat.decoration.bold　**…**',
      'feature.chat.decoration.italic　[斜体]…[/斜体]',
      'feature.chat.decoration.strike　[取消線]…[/取消線]',
      ContextMenuSeparator.name,
      'feature.chat.decoration.size',
      'feature.chat.decoration.font',
      'feature.chat.decoration.color',
    ]);
    expect(menu[4].subActions).toHaveLength(3);
    expect(menu[5].subActions?.map((item) => item.name)).toContain('feature.chat.decoration.mincho　[明朝]…[/明朝]');
    expect(menu[6].subActions).toHaveLength(11);
  });

  it('writes the marks in the reader’s language', () => {
    const apply = vi.fn();
    const fonts = buildChatDecorationMenu('en', apply, translate)[5].subActions!;

    fonts.find((item) => item.name.startsWith('feature.chat.decoration.hand'))!.action!();

    expect(apply).toHaveBeenCalledWith({ open: '[handwriting]', close: '[/handwriting]' });
  });

  it('writes stars for bold whatever the language', () => {
    const apply = vi.fn();

    buildChatDecorationMenu('ko', apply, translate)[0].action!();

    expect(apply).toHaveBeenCalledWith({ open: '**', close: '**' });
  });
});

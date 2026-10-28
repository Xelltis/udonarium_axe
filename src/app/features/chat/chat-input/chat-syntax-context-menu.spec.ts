import type { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import {
  buildChatSyntaxMenu,
  type ChatSyntaxMenuSource,
  type ChatSyntaxWriter,
} from '@axe/features/chat/chat-input/chat-syntax-context-menu';

describe('buildChatSyntaxMenu', () => {
  const t = (key: string) => key.replace('feature.chat.syntax.', '').replace('feature.chat.decoration.', '');
  let written: string[];
  const writer: ChatSyntaxWriter = {
    wrap: (marks) => written.push(`wrap ${marks.open}…${marks.close}`),
    insert: (text, select) => written.push(`insert ${text}${select ? ` [${text.slice(select.from, select.to)}]` : ''}`),
    append: (text) => written.push(`append ${text}`),
    prefix: (text) => written.push(`prefix ${text}`),
  };

  function source(overrides: Partial<ChatSyntaxMenuSource> = {}): ChatSyntaxMenuSource {
    return {
      language: 'ja',
      statuses: [
        { name: 'HP', isResource: true },
        { name: '職業', isResource: false },
      ],
      variables: ['攻撃'],
      portraits: ['通常', '笑顔'],
      effects: ['爆炎'],
      cutIns: ['登場'],
      diceExamples: ['CC<=50'],
      isGameMaster: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    written = [];
  });

  function find(menu: ContextMenuAction[], ...path: string[]): ContextMenuAction {
    let items = menu;
    let found: ContextMenuAction | undefined;
    for (const name of path) {
      found = items.find((item) => item.name === name || item.name.endsWith(`　${name}`));
      if (!found) throw new Error(`no ${name} among ${items.map((item) => item.name).join(', ')}`);
      items = found.subActions ?? [];
    }
    return found!;
  }

  it('groups what it offers by kind', () => {
    expect(buildChatSyntaxMenu(source(), writer, t).map((item) => item.name)).toEqual([
      'decoration',
      'ruby',
      'dice',
      'reference',
      'resource',
      'buff',
      'portrait',
      'effect',
      'quote',
    ]);
  });

  it('writes a command of the game system where the caret is', () => {
    find(buildChatSyntaxMenu(source(), writer, t), 'dice', 'CC<=50').action!();
    find(buildChatSyntaxMenu(source(), writer, t), 'dice', 'S2D6').action!();
    expect(written).toEqual(['insert CC<=50 ', 'prefix S']);
  });

  it('references the statuses and the variables of the speaker', () => {
    find(buildChatSyntaxMenu(source(), writer, t), 'reference', '{攻撃}').action!();
    expect(written).toEqual(['insert {攻撃}']);
  });

  it('changes a status with an amount selected to be typed over', () => {
    find(buildChatSyntaxMenu(source(), writer, t), 'resource', 'HP', ':HP-').action!();
    find(buildChatSyntaxMenu(source(), writer, t), 'resource', '職業', ':職業>').action!();
    expect(written).toEqual(['insert :HP-1 [1]', 'insert :職業>text [text]']);
  });

  it('writes a portrait or a cut-in at the end of the line, where it is read', () => {
    find(buildChatSyntaxMenu(source(), writer, t), 'portrait', '@笑顔').action!();
    find(buildChatSyntaxMenu(source(), writer, t), 'effect', '登場').action!();
    expect(written).toEqual(['append @笑顔', 'append 登場']);
  });

  it('offers the sweep only to the game master', () => {
    const sweeps = (gm: boolean) =>
      find(buildChatSyntaxMenu(source({ isGameMaster: gm }), writer, t), 'buff').subActions!.filter((item) =>
        item.name.includes('&&')
      ).length;
    expect(sweeps(false)).toBe(0);
    expect(sweeps(true)).toBe(1);
  });

  it('wraps what is selected in a decoration', () => {
    find(buildChatSyntaxMenu(source(), writer, t), 'decoration').subActions![0].action!();
    expect(written).toEqual(['wrap **…**']);
  });
});

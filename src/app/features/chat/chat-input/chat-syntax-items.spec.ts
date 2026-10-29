import {
  type ChatSyntaxGroup,
  chatSyntaxGroups,
  type ChatSyntaxMenuSource,
  type ChatSyntaxWriter,
} from '@axe/features/chat/chat-input/chat-syntax-items';

describe('chatSyntaxGroups', () => {
  const t = (key: string) => key.replace('feature.chat.syntax.', '');
  let written: string[];
  const writer: ChatSyntaxWriter = {
    insert: (text, select) => written.push(`insert ${text}${select ? ` [${text.slice(select.from, select.to)}]` : ''}`),
    prefix: (text) => written.push(`prefix ${text}`),
    chip: (chip, place) => written.push(`chip ${chip.kind} ${chip.raw} ${place}`),
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

  function run(groups: ChatSyntaxGroup[], key: string, label: string, item = 0): void {
    const row = groups.find((group) => group.key === key)!.rows.find((each) => each.label === label)!;
    row.items[item].run();
  }

  beforeEach(() => {
    written = [];
  });

  it('groups what it offers by kind, and names each row with what it writes', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    expect(groups.map((group) => group.key)).toEqual([
      'dice',
      'reference',
      'resource',
      'buff',
      'portrait',
      'effect',
      'quote',
    ]);
    expect(groups[0].rows.map((row) => row.items[0].written)).toContain('CC<=50');
  });

  it('writes commands at the caret, and a secret roll at the start of the line', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'dice', 'CC<=50');
    run(groups, 'dice', 'secretRoll');
    expect(written).toEqual(['insert CC<=50 ', 'prefix S']);
  });

  it('puts references in as chips, and changes a status with its amount selected to be typed over', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'reference', '攻撃');
    run(groups, 'resource', 'HP', 0);
    run(groups, 'resource', '職業', 3);
    expect(written).toEqual(['chip reference {攻撃} caret', 'insert :HP-1 [1]', 'insert :職業>text [text]']);
  });

  it('puts a reference to the target in as a chip too, and leaves an unknown name to type between the braces', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'reference', 'HP', 1);
    run(groups, 'reference', 'targetReference');
    expect(written).toEqual(['chip reference t{HP} caret', 'insert t{} []']);
  });

  it('puts a portrait or a cut-in at the end of the message, where it is read', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'portrait', '笑顔');
    run(groups, 'effect', '登場');
    run(groups, 'effect', 'battle');
    expect(written).toEqual(['chip portrait @笑顔 end', 'chip cutIn 登場 end', 'chip effect 《vs》 caret']);
  });

  it('offers the sweep only to the game master', () => {
    const sweeps = (gm: boolean) =>
      chatSyntaxGroups(source({ isGameMaster: gm }), writer, t)
        .find((group) => group.key === 'buff')!
        .rows.filter((row) => row.items[0].written.startsWith('&&')).length;
    expect(sweeps(false)).toBe(0);
    expect(sweeps(true)).toBe(1);
  });
});

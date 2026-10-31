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
    word: (text, select) => written.push(`word ${text}${select ? ` [${text.slice(select.from, select.to)}]` : ''}`),
    prefix: (text, line = 'caret') => written.push(`prefix ${text} ${line}`),
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

  it('writes a dice command and a secret roll at the start of the roll on the first line, where it is read', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'dice', 'CC<=50');
    run(groups, 'dice', 'secretRoll');
    run(groups, 'dice', 'repeat');
    expect(written).toEqual(['prefix CC<=50  roll', 'prefix S roll', 'prefix x3  first']);
  });

  it('puts references in as chips, and changes a status with its amount selected to be typed over', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'reference', '攻撃');
    run(groups, 'resource', 'HP', 0);
    run(groups, 'resource', '職業', 3);
    expect(written).toEqual(['chip reference {攻撃} caret', 'word :HP-1 [1]', 'word :職業>text [text]']);
  });

  it('writes a resource or buff change as a word of its own, as it is read only where it starts a word', () => {
    const groups = chatSyntaxGroups(source(), writer, t);
    run(groups, 'resource', 'secret');
    run(groups, 'buff', 'buffPlain');
    run(groups, 'buff', 'buffRoundsDown');
    expect(written).toEqual(['word s:HP-1 [HP]', 'word &name/buffEffect/3 [name]', 'word &R- ']);
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

  it('offers a change only for a status a change can name, a name with a space or a mark kept to references', () => {
    const groups = chatSyntaxGroups(
      source({
        statuses: [
          { name: 'HP', isResource: true },
          { name: 'Max HP', isResource: true },
          { name: 'HP-max', isResource: true },
        ],
      }),
      writer,
      t
    );
    const labels = (key: string) => groups.find((group) => group.key === key)!.rows.map((row) => row.label);
    expect(labels('resource')).toContain('HP');
    expect(labels('resource')).not.toContain('Max HP');
    expect(labels('resource')).not.toContain('HP-max');
    expect(labels('reference')).toContain('Max HP');
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

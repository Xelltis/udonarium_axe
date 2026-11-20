import { TestBed } from '@angular/core/testing';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { AgentKindTools } from '@axe/features/agent-tools/agent-kind-tools.service';
import { type AgentKind, anyKind, numberField, objectInput } from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentKinds } from '@axe/features/agent-tools/kinds/agent-kinds.service';
import { AgentSquares } from '@axe/features/agent-tools/kinds/agent-squares.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;
const signal = new AbortController().signal;

describe('AgentKindTools', () => {
  let tools: AgentKindTools;

  function call(tool: string, args: Record<string, unknown> = {}): unknown {
    return tools.handlers[tool](args, { signal });
  }

  beforeEach(() => {
    setPeerContextProvider({
      peerContext: { userId: 'ai-user' } as IPeerContext,
      peerContexts: [],
      peerIds: [],
      peerId: 'ai-peer',
    });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'ai-user';
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 20;
    table.height = 15;
    table.gridSize = GRID;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    tools = TestBed.inject(AgentKindTools);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    resetPeerContextProvider();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  it('describes every kind with its fields, who writes each, and what may be done to it', () => {
    const [table] = call('describe_kinds', { kind: 'dice-table' }) as Record<string, unknown>[];

    expect(table).toMatchObject({
      kind: 'dice-table',
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'dice', schema: { type: 'string', maxLength: 50 }, written_by: 'write' }),
      ]),
      create: { by: 'write' },
      remove: { by: 'write' },
      actions: [],
    });
    expect((call('describe_kinds') as { kind: string }[]).map((kind) => kind.kind)).toEqual(
      TestBed.inject(AgentKinds)
        .all()
        .map((kind) => kind.kind)
    );
    expect(() => call('describe_kinds', { kind: 'weather' })).toThrow(/There is no kind called weather/);
  });

  it('makes, lists, reads, changes and takes away a thing, as its kind lets it', () => {
    const made = call('create_object', {
      kind: 'dice-table',
      fields: { name: '天気表', dice: '1d6', entries: '1:晴れ\n2:雨' },
    }) as { id: string };

    expect(call('list_objects', { kind: 'dice-table', name: '天気' })).toEqual([{ id: made.id, name: '天気表' }]);
    expect(call('get_object', { kind: 'dice-table', id: '天気表' })).toMatchObject({
      id: made.id,
      name: '天気表',
      dice: '1d6',
      entries: '1:晴れ\n2:雨',
    });
    expect(call('change_object', { kind: 'dice-table', id: made.id, fields: { dice: '2d6' } })).toMatchObject({
      dice: '2d6',
    });
    expect(call('remove_object', { kind: 'dice-table', id: made.id })).toEqual({
      removed: { id: made.id, name: '天気表' },
    });
    expect(ObjectStore.instance.getObjects(DiceTable)).toEqual([]);
  });

  it('writes no field of a call that names one wrongly, nor one that does not fit its shape', () => {
    const table = DiceTable.create();

    expect(() =>
      call('change_object', { kind: 'dice-table', id: table.identifier, fields: { name: '新', colour: 'red' } })
    ).toThrow(/has no field called colour/);
    expect(() => call('change_object', { kind: 'dice-table', id: table.identifier, fields: { dice: 6 } })).toThrow(
      /fields.dice must be a string/
    );
    expect(table.name).toBe('白紙のダイス表');
  });

  it('leaves out the words of a note not shown to this seat, and lets it change none of the note', () => {
    const note = TextNote.create('伏線', '犯人は執事', 16, 2, 2);
    note.location.name = 'table';
    note.owner = 'gm-user';
    note.disclosureMode = 'gm';
    PeerCursor.myCursor.role = PeerRole.Player;

    const [listed] = call('list_objects', { kind: 'text-note' }) as { id: string }[];
    const read = call('get_object', { kind: 'text-note', id: note.identifier }) as Record<string, unknown>;

    expect(listed.id).toBe(note.identifier);
    expect(read).not.toHaveProperty('title');
    expect(read).not.toHaveProperty('text');
    expect(read).toMatchObject({ width: 2, height: 2, shown_to: 'gm' });
    expect(() => call('change_object', { kind: 'text-note', id: note.identifier, fields: { width: 3 } })).toThrow(
      AgentToolError
    );
    expect(note.width).toBe(2);
  });

  it('lays a note in a square, owned by this seat, and moves it to another', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    const made = call('create_object', {
      kind: 'text-note',
      options: { at: { col: 3, row: 2 } },
      fields: { title: 'メモ', text: '扉は東' },
    }) as { id: string; square: unknown };

    expect(made).toMatchObject({ title: 'メモ', text: '扉は東', square: { col: 3, row: 2 }, shown_to: 'all' });
    expect(
      call('change_object', { kind: 'text-note', id: made.id, fields: { square: { col: 5, row: 4 } } })
    ).toMatchObject({ square: { col: 5, row: 4 } });
  });

  it('lets only the owner and the game master say who a note is shown to', () => {
    const note = TextNote.create('共有', '全員へ', 16, 2, 2);
    note.location.name = 'table';
    note.owner = 'someone-else';
    PeerCursor.myCursor.role = PeerRole.Player;

    expect(() =>
      call('change_object', { kind: 'text-note', id: note.identifier, fields: { shown_to: 'gm', title: '秘密' } })
    ).toThrow(/owner's and the game master's to say/);
    expect([note.disclosureMode, note.title]).toEqual(['', '共有']);
  });

  it('writes nothing of a call one of whose values a field refuses, and takes back a thing just made', () => {
    const kinds = TestBed.inject(AgentKinds);
    const things: { level: number; label: string; destroyed?: boolean }[] = [];
    const kind: AgentKind<(typeof things)[number]> = {
      kind: 'probe',
      description: '',
      list: () => things.filter((thing) => !thing.destroyed),
      idOf: (thing) => `probe-${things.indexOf(thing)}`,
      nameOf: (thing) => thing.label,
      fields: [
        numberField(
          'level',
          '',
          'write',
          { minimum: 0 },
          (thing) => thing.level,
          (thing, value) => {
            thing.level = value;
          }
        ),
        {
          ...numberField(
            'odd',
            '',
            'write',
            {},
            () => 0,
            () => undefined
          ),
          refuse: (_thing, value) => ((value as number) % 2 === 1 ? null : 'Only odd numbers.'),
        },
      ],
      create: {
        access: 'write',
        description: '',
        input: objectInput(),
        make: () => {
          const made = { level: 0, label: 'made', destroy: () => (made.destroyed = true), destroyed: false };
          things.push(made);
          return made;
        },
      },
    };
    things.push({ level: 1, label: 'kept' });
    vi.spyOn(kinds, 'of').mockReturnValue(anyKind(kind));

    expect(() => call('change_object', { kind: 'probe', id: 'kept', fields: { level: 5, odd: 2 } })).toThrow(
      /Only odd numbers/
    );
    expect(things[0].level).toBe(1);
    expect(() => call('create_object', { kind: 'probe', fields: { level: 5, odd: 4 } })).toThrow(/Only odd numbers/);
    expect(kind.list().map((thing) => thing.label)).toEqual(['kept']);
  });

  it('tells which fields were written before one that fails, writing none back, and takes back a thing just made', () => {
    const kinds = TestBed.inject(AgentKinds);
    const things: { level: number; label: string; destroyed?: boolean }[] = [{ level: 1, label: 'kept' }];
    const kind: AgentKind<(typeof things)[number]> = {
      kind: 'probe',
      description: '',
      list: () => things.filter((thing) => !thing.destroyed),
      idOf: (thing) => `probe-${things.indexOf(thing)}`,
      nameOf: (thing) => thing.label,
      fields: [
        numberField(
          'level',
          '',
          'write',
          {},
          (thing) => thing.level,
          (thing, value) => {
            thing.level = value;
          }
        ),
        numberField(
          'broken',
          '',
          'write',
          {},
          () => 0,
          () => {
            throw new Error('cannot write it');
          }
        ),
      ],
      create: {
        access: 'write',
        description: '',
        input: objectInput(),
        make: () => {
          const made = { level: 0, label: 'made', destroy: () => (made.destroyed = true), destroyed: false };
          things.push(made);
          return made;
        },
      },
    };
    vi.spyOn(kinds, 'of').mockReturnValue(anyKind(kind));

    expect(() => call('change_object', { kind: 'probe', id: 'kept', fields: { level: 5, broken: 1 } })).toThrow(
      /level was written; broken could not be written: cannot write it/
    );
    expect(things[0].level).toBe(5);
    expect(() => call('create_object', { kind: 'probe', fields: { level: 5, broken: 1 } })).toThrow(
      /^Nothing was made: broken could not be written: cannot write it$/
    );
    expect(kind.list().map((thing) => thing.label)).toEqual(['kept']);
  });

  it('reads and puts a thing laid from its corner and one kept by its middle in the same square', () => {
    const squares = TestBed.inject(AgentSquares);
    const corner = { location: { x: 0, y: 0 }, update: () => undefined } as unknown as TextNote;
    const middle = { location: { x: 0, y: 0 }, update: () => undefined } as unknown as TextNote;

    squares.field<TextNote>().put!(corner, { col: 3, row: 2 });
    squares.field<TextNote>(undefined, 'middle').put!(middle, { col: 3, row: 2 });

    expect([corner.location.x, corner.location.y]).toEqual([2 * GRID, GRID]);
    expect([middle.location.x, middle.location.y]).toEqual([2.5 * GRID, 1.5 * GRID]);
    expect(squares.field<TextNote>().read(corner)).toEqual({ col: 3, row: 2 });
    expect(squares.field<TextNote>(undefined, 'middle').read(middle)).toEqual({ col: 3, row: 2 });
    expect(squares.field<TextNote>().refuse!(corner, { col: 99, row: 2 })).toMatch(/off the table/);
  });

  it('holds a field kept for the game master to the master’s seat', () => {
    const kinds = TestBed.inject(AgentKinds);
    const held = { level: 1 };
    const kind: AgentKind<typeof held> = {
      kind: 'probe',
      description: '',
      list: () => [held],
      idOf: () => 'probe-1',
      nameOf: () => 'probe',
      fields: [
        numberField<typeof held>(
          'level',
          '',
          'gm',
          { minimum: 0 },
          (thing) => thing.level,
          (thing, value) => {
            thing.level = value;
          }
        ),
      ],
    };
    vi.spyOn(kinds, 'of').mockReturnValue(anyKind(kind));
    PeerCursor.myCursor.role = PeerRole.Player;

    expect(() => call('change_object', { kind: 'probe', fields: { level: 3 } })).toThrow(
      /Only the game master's seat may write the level/
    );
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(call('change_object', { kind: 'probe', fields: { level: 3 } })).toEqual({
      id: 'probe-1',
      name: 'probe',
      level: 3,
    });
  });
});

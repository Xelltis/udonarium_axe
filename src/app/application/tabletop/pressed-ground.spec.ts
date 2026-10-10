import { TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { defaultSwitchDefinition, encodeSwitchDefinition } from '@axe/domain/tabletop/board-switch/switch-definition';
import {
  blockKey,
  DEFAULT_FUNCTION_SPEC,
  FunctionPaintPlan,
  sanitizeFunctionSpec,
  TriggerPaintSpec,
} from '@axe/domain/tabletop/function-paint';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger, triggersOn } from '@axe/domain/tabletop/table-trigger';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

/** Painting ground that is pressed rather than walked on, and pressing it. */
describe('pressed ground', () => {
  let paint: FunctionalPaintService;
  let table: GameTable;
  let said: string[];

  const lever = encodeSwitchDefinition({
    ...defaultSwitchDefinition(),
    label: 'レバー',
    actions: [{ kind: 'say', text: 'ガコン', delayMs: 0, extra: {} }],
  });

  function planWith(over: Partial<FunctionPaintPlan> = {}): FunctionPaintPlan {
    return {
      blocked: [],
      terrain: { add: [], remove: [] },
      mask: { add: [], remove: [] },
      moveCost: { add: [], remove: [] },
      ambience: { add: [], remove: [] },
      trigger: { add: [], remove: [] },
      ...over,
    };
  }

  /** A brush for pressed ground, as the map editor hands it over. */
  function pressBrush(change: Partial<TriggerPaintSpec> = {}): TriggerPaintSpec {
    return sanitizeFunctionSpec({
      ...DEFAULT_FUNCTION_SPEC,
      trigger: { ...DEFAULT_FUNCTION_SPEC.trigger, moment: 'press', press: lever, shownTo: 'room', ...change },
    }).trigger;
  }

  function lay(spec: TriggerPaintSpec): TableTrigger {
    paint.apply(planWith({ trigger: { add: [{ col: 5, row: 5, width: 2, height: 1, spec }], remove: [] } }));
    return triggersOn(table)[0];
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor().role = PeerRole.Player;
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    paint = TestBed.inject(FunctionalPaintService);
    said = [];
    const macro = TestBed.inject(CharacterMacroService);
    vi.spyOn(macro, 'currentTab').mockReturnValue({ plCanSpeak: true } as unknown as ChatTab);
    vi.spyOn(macro, 'sendAsSelf').mockImplementation(async (line) => {
      said.push(line);
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('lays the ground with a switch under it saying what pressing it does', () => {
    const ground = lay(pressBrush());

    expect(ground.firesOn).toBe('press');
    expect(ground.pressSwitch?.def.label).toBe('レバー');
    expect(ground.isArmed).toBe(true);
  });

  it('is spent for a version that has never heard of pressing, so it never goes off underfoot there', () => {
    const ground = lay(pressBrush());
    const olderIsArmed = !(
      (ground.repeat.length > 0 ? ground.repeat : ground.once ? 'once' : 'always') === 'once' && ground.spent
    );

    expect(olderIsArmed).toBe(false);
  });

  it('springs nothing under a piece that walks onto it, even left unguarded', () => {
    const ground = lay(pressBrush());
    ground.spent = false;
    ground.once = false;
    ground.repeat = '';
    const fire = TestBed.inject(TriggerFireService);
    const hero = GameCharacter.create('英雄', 1, '');
    hero.location = { name: 'table', x: 4 * GRID, y: 5 * GRID };

    fire.pickedUp(hero);
    hero.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };

    expect(fire.putDown(hero)).toEqual([]);
  });

  it('reads back as the painting it was, so laying the same scene again keeps it and what it has been through', () => {
    const brush = pressBrush({ once: true, repeat: 'oncePerPiece' });
    lay(brush);

    const read = paint.snapshot()!.triggerBlocks[0];

    expect(blockKey(read, read.spec)).toBe(blockKey({ col: 5, row: 5, width: 2, height: 1 }, brush));
  });

  it('is pressed by a click on any cell it covers, and gives itself away where it is told to', async () => {
    const ground = lay(pressBrush({ shownTo: 'master', reveals: true }));
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const presses = TestBed.inject(SwitchPressService);

    expect(await presses.pressGroundAt(6.5 * GRID, 5.5 * GRID)).toBe('pressed');
    expect(said).toEqual(['ガコン']);
    expect(ground.found).toBe(true);
    expect(await presses.pressGroundAt(8.5 * GRID, 5.5 * GRID)).toBeNull();
  });

  it('is not pressed by a player it is not shown to, nor once the master has put it away', async () => {
    const hidden = lay(pressBrush({ shownTo: 'master' }));
    const presses = TestBed.inject(SwitchPressService);

    expect(await presses.pressGroundAt(5.5 * GRID, 5.5 * GRID)).toBeNull();

    hidden.shownTo = 'room';
    hidden.open = true;
    hidden.pressSwitch!.retired = true;
    expect(await presses.pressGroundAt(5.5 * GRID, 5.5 * GRID)).toBeNull();
    expect(said).toEqual([]);
  });

  it('is listed for the master once pressed, and set back as it was painted when its presses are cleared', async () => {
    const ground = lay(pressBrush({ shownTo: 'master', reveals: true }));
    ground.pressSwitch!.write({
      ...ground.pressSwitch!.def,
      actions: [...ground.pressSwitch!.def.actions, { kind: 'removeSelf', delayMs: 0, extra: {} }],
    });
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const switches = TestBed.inject(BoardSwitchService);
    expect(switches.pressedGround()).toEqual([]);

    await TestBed.inject(SwitchPressService).pressGroundAt(5.5 * GRID, 5.5 * GRID);
    expect(ground.pressSwitch!.retired).toBe(true);
    expect(ground.found).toBe(true);
    expect(switches.pressedGround()).toEqual([ground]);

    switches.reset(ground);

    expect(ground.pressSwitch!.retired).toBe(false);
    expect(ground.found).toBe(false);
    expect(ground.isArmed).toBe(true);
    expect(switches.pressedGround()).toEqual([]);
  });

  it('lists no pressed ground for a player, who cannot clear it either', async () => {
    const ground = lay(pressBrush());
    ground.pressSwitch!.retired = true;
    const switches = TestBed.inject(BoardSwitchService);

    expect(switches.pressedGround()).toEqual([]);
    switches.reset(ground);
    expect(ground.pressSwitch!.retired).toBe(true);
  });
});

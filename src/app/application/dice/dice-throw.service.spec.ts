import { TestBed } from '@angular/core/testing';
import {
  DiceThrow,
  DiceThrowService,
  JUST_ROLLED_MS,
  KEPT_IN_FULL,
  KEPT_THROWS,
  LINE_WAIT_MS,
  LITE_TUMBLING_DICE,
  MAX_TUMBLING,
  MAX_TUMBLING_DICE,
} from '@axe/application/dice/dice-throw.service';
import { DiceTrayPlacementService, TablePlacement } from '@axe/application/dice/dice-tray-placement.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { callDiceThrow } from '@axe/core/event/domain-events';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';
import { DiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { MAX_THROWN_DICE } from '@axe/domain/dice/dice-3d/dice-throw-plan';
import { Quat, quatRotate } from '@axe/domain/dice/dice-3d/rotation';
import { DiceRollOutcome, encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';
import { simulateThrow } from '@axe/infrastructure/dice-3d/dice-physics';
import { releaseWorker, useDicePhysicsWorkerFactory } from '@axe/infrastructure/dice-3d/dice-physics-client';
import { DicePhysicsJob, FRAME_STRIDE } from '@axe/infrastructure/dice-3d/dice-physics-message';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const ME = 'me';
const SOMEONE = 'someone-else';

describe('DiceThrowService', () => {
  let tab: ChatTab;
  let service: DiceThrowService;
  let stageBefore: DiceStage;
  let placement: TablePlacement | null;
  let placedFor: string[];
  let placedCounts: number[][];

  function fixPeerContext(): void {
    const self = {
      peerId: 'peer-self',
      userId: ME,
      session: { grade: PeerSessionGrade.UNSPECIFIED, name: '', isVisitor: false },
    } as unknown as IPeerContext;
    setPeerContextProvider({ peerContext: self, peerContexts: [self], peerIds: [self.peerId], peerId: self.peerId });
  }

  interface Answer {
    faces?: { sides: number; value: number }[];
    from?: string;
    secret?: boolean;
    to?: string;
    timestamp?: number;
    color?: string;
    outcome?: DiceRollOutcome;
    diceLook?: string;
  }

  /** The dice bot's answer to a roll, put in the tab. */
  function answer(options: Answer = {}): ChatMessage {
    const from = options.from ?? ME;
    return tab.addMessage({
      from: 'System-BCDice',
      originFrom: from,
      text: '→ 8',
      timestamp: options.timestamp ?? Date.now(),
      imageIdentifier: '',
      tag: options.secret ? 'system secret' : 'system',
      name: '<BCDice>',
      to: options.to,
      messColor: options.color ?? '#3b5bdb',
      diceLook: options.diceLook,
      dicebot: encodeDiceRollDetail({
        system: 'DiceBot',
        outcome: options.outcome ?? '',
        faces: (options.faces ?? [{ sides: 20, value: 17 }]).map((face) => ({ ...face, kind: 'normal' })),
      }),
    });
  }

  function thrown(message: ChatMessage) {
    return service.throws().get(message.identifier);
  }

  function thrownOnTable(message: ChatMessage) {
    return service.throws().get(`${message.identifier}:table`);
  }

  /** A roll's throws in one place, a tray after another. */
  function thrownOn(message: ChatMessage, stage: 'frame' | 'table'): DiceThrow[] {
    return [...service.throws().values()]
      .filter((diceThrow) => diceThrow.messageIdentifier === message.identifier && diceThrow.stage === stage)
      .sort((a, b) => a.part - b.part);
  }

  /** Throws a roll's dice and has them come to rest at once, as though their recording had played. */
  async function throwToRest(line: ChatMessage): Promise<void> {
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'), { timeout: 10_000 });
    service.played(line.identifier, performance.now() - 60_000);
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'), { timeout: 10_000 });
  }

  /** A worker that takes every throw and answers none, so the dice thrown stay on the move. */
  function heldWorker(): Worker {
    return Object.assign(new EventTarget(), {
      postMessage: () => undefined,
      terminate: () => undefined,
    }) as unknown as Worker;
  }

  /** Faces of so many d6, each showing 1 to 6 in turn. */
  function d6s(count: number) {
    return Array.from({ length: count }, (_, i) => ({ sides: 6, value: (i % 6) + 1 }));
  }

  beforeEach(() => {
    fixPeerContext();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = ME;
    PeerCursor.myCursor.role = PeerRole.Player;
    stageBefore = Config.instance.diceStage;
    Config.instance.diceStage = 'frame';
    useDicePhysicsWorkerFactory(() => null);
    placedFor = [];
    placedCounts = [];
    placement = {
      model: [20, 0, 0, 0, 0, -20, 0, 0, 0, 0, 20, 0, 400, 300, 0, 1],
      tray: { halfWidth: 4, halfDepth: 3 },
    };
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: DiceTrayPlacementService,
          useValue: {
            placementsFor: (speaker: string, counts: number[]) => {
              placedFor.push(speaker);
              placedCounts.push(counts);
              return placement && counts.map(() => placement!);
            },
          },
        },
      ],
    });
    service = TestBed.inject(DiceThrowService);
    TestBed.inject(MotionService).setting.set('on');

    tab = new ChatTab();
    tab.initialize();
  });

  afterEach(() => {
    vi.useRealTimers();
    setNetworkIsolated(false);
    useDicePhysicsWorkerFactory(null);
    Config.instance.diceStage = stageBefore;
    resetPeerContextProvider();
    tab.destroy();
    for (const message of ObjectStore.instance.getObjects<ChatMessage>(ChatMessage)) message.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
  });

  it('throws the dice of a roll just answered, landing them on the numbers it came to', async () => {
    const line = answer({
      faces: [
        { sides: 20, value: 17 },
        { sides: 6, value: 2 },
      ],
    });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
    expect(thrown(line)?.shown).toEqual(['17', '2']);
    expect(thrown(line)?.dice.map((die) => die.shape)).toEqual(['d20', 'd6']);
    expect(thrown(line)?.color).toBe('#3b5bdb');
  });

  describe('in the look the one who rolled chose', () => {
    it('throws the dice in the body colour and material the line carries', async () => {
      const line = answer({ diceLook: '{"material":"marble","body":"#1e6b52","ink":"#f6f3ec"}' });

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');

      await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
      expect(thrown(line)?.look).toEqual({ ...PLAIN_DICE_LOOK, material: 'marble', body: '#1e6b52', ink: '#f6f3ec' });
      expect(thrown(line)?.color).toBe('#1e6b52');
    });

    it('throws the dice in the colour of the roll where the look leaves the body to it', async () => {
      const line = answer({ color: '#c92a2a', diceLook: '{"material":"metal"}' });

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');

      await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
      expect(thrown(line)?.look.material).toBe('metal');
      expect(thrown(line)?.color).toBe('#c92a2a');
    });

    it('lays the dice of a line said before looks were offered down plain, in the colour of the roll', () => {
      const line = answer({ timestamp: Date.now() - JUST_ROLLED_MS - 1000, color: '#2b8a3e' });

      service.showStill(line.identifier);

      expect(thrown(line)?.look).toEqual(PLAIN_DICE_LOOK);
      expect(thrown(line)?.color).toBe('#2b8a3e');
    });

    it('lays the dice of a line from a later version down in resin, keeping the colours it can read', () => {
      const line = answer({
        timestamp: Date.now() - JUST_ROLLED_MS - 1000,
        diceLook: '{"material":"stardust","body":"#5f3dc4","glow":3}',
      });

      service.showStill(line.identifier);

      expect(thrown(line)?.look).toEqual({ ...PLAIN_DICE_LOOK, material: 'resin', body: '#5f3dc4', ink: '' });
      expect(thrown(line)?.color).toBe('#5f3dc4');
    });
  });

  it('throws one of each die to try a look out on, in place of the try before', async () => {
    const first = service.tryOut({ ...PLAIN_DICE_LOOK, material: 'marble', body: '#5f3dc4', ink: '' }, '#000000');

    await vi.waitFor(() => expect(service.throws().get(first)?.phase).toBe('rolling'));
    expect(
      service
        .throws()
        .get(first)
        ?.dice.map((die) => die.shape)
    ).toEqual(['d4', 'd6', 'd8', 'd10', 'd12', 'd20']);
    expect(service.throws().get(first)?.color).toBe('#5f3dc4');
    expect(service.throws().get(first)?.look.material).toBe('marble');

    const second = service.tryOut(PLAIN_DICE_LOOK, '#2b8a3e');

    expect(service.throws().has(first)).toBe(false);
    expect(service.throws().get(second)?.color).toBe('#2b8a3e');
  });

  it('throws the dice to try a look out on as they wear it, resin under a picture', () => {
    const key = service.tryOut({ ...PLAIN_DICE_LOOK, material: 'metal', picture: 'ab'.repeat(32) }, '#2b8a3e');

    expect(service.throws().get(key)?.look.material).toBe('resin');
  });

  it('lets the dice thrown to try a look out go when asked', async () => {
    const key = service.tryOut(PLAIN_DICE_LOOK, '#2b8a3e');
    expect(service.throws().has(key)).toBe(true);

    service.endTryOut();

    expect(service.throws().has(key)).toBe(false);
  });

  it('counts the dice thrown to try a look out as no roll among those kept', async () => {
    TestBed.inject(MotionService).setting.set('off');
    const lines = Array.from({ length: KEPT_THROWS }, () => answer());
    const last = lines[lines.length - 1];
    for (const line of lines.slice(0, -1)) callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(lines[lines.length - 2])?.phase).toBe('settled'));

    service.tryOut(PLAIN_DICE_LOOK, '#2b8a3e');
    callDiceThrow({ messageIdentifier: last.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(last)?.phase).toBe('settled'));
    expect(thrown(lines[0])).toBeDefined();
  });

  it('lets the dice come to rest once their recording has played', async () => {
    const line = answer();
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));

    const result = thrown(line)!.result!;
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'), {
      timeout: (result.frameCount / 60) * 1000 + 2000,
    });
  });

  it('carries whether the roll was a critical or a fumble, for the dice to flash', async () => {
    const line = answer({ outcome: 'critical' });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
    expect(thrown(line)?.outcome).toBe('critical');
  });

  it('comes to rest as long after it began to play on the screen as its dice take, not after it was worked out', async () => {
    const line = answer();
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
    const total = ((thrown(line)!.result!.frameCount - 1) / 60) * 1000;

    service.played(line.identifier, performance.now() + 1500);
    await new Promise((resolve) => setTimeout(resolve, total + 300));
    expect(thrown(line)?.phase).toBe('rolling');

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'), { timeout: 3000 });
  });

  it('starts the physics in a quiet moment once the room shows its dice, before any roll', async () => {
    let started = 0;
    useDicePhysicsWorkerFactory(() => {
      started++;
      return Object.assign(new EventTarget(), {
        postMessage: () => undefined,
        terminate: () => undefined,
      }) as unknown as Worker;
    });
    try {
      Config.instance.diceStage = 'off';
      TestBed.tick();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(started).toBe(0);

      Config.instance.diceStage = 'table';
      TestBed.tick();

      await vi.waitFor(() => expect(started).toBe(1));
    } finally {
      releaseWorker();
    }
  });

  it('throws nothing while the room shows no dice', async () => {
    Config.instance.diceStage = 'off';
    const line = answer();

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)).toBeUndefined();
  });

  it('waits for a line that arrives after the call to throw it', async () => {
    const line = answer();
    ObjectStore.instance.remove(line);
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(thrown(line)).toBeUndefined();

    ObjectStore.instance.add(line);
    tab.appendChild(line);

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
  });

  it('stops waiting for a line that never comes', async () => {
    vi.useFakeTimers();
    const id = 'never-comes';
    callDiceThrow({ messageIdentifier: id }, 'here');
    await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 1);
    vi.useRealTimers();

    expect(service.throws().has(id)).toBe(false);
  });

  it('throws the same line once, however often it is called', async () => {
    const line = answer();
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
    const first = thrown(line);

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)).toBe(first);
  });

  it('throws nothing for a line said long enough ago, as one handed over on coming back to the room', async () => {
    const line = answer({ timestamp: Date.now() - JUST_ROLLED_MS - 1000 });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)).toBeUndefined();
  });

  it('throws nothing while a replay plays the room back', async () => {
    setNetworkIsolated(true);
    const line = answer();

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)).toBeUndefined();
  });

  it('throws a secret roll for the one who rolled it alone', async () => {
    const mine = answer({ secret: true });
    const theirs = answer({ secret: true, from: SOMEONE });

    callDiceThrow({ messageIdentifier: mine.identifier }, 'here');
    callDiceThrow({ messageIdentifier: theirs.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(mine)?.phase).toBe('rolling'));
    expect(thrown(theirs)).toBeUndefined();
  });

  it('throws nothing for a line whispered between others, or in a tab this reader may not read', async () => {
    const whispered = answer({ from: SOMEONE, to: 'a-third-user' });
    const hiddenTab = new ChatTab();
    hiddenTab.initialize();
    hiddenTab.plCanView = false;
    const inHiddenTab = hiddenTab.addMessage({
      from: 'System-BCDice',
      originFrom: SOMEONE,
      text: '→ 3',
      timestamp: Date.now(),
      imageIdentifier: '',
      tag: 'system',
      name: '<BCDice>',
      dicebot: encodeDiceRollDetail({
        system: 'DiceBot',
        outcome: '',
        faces: [{ sides: 6, value: 3, kind: 'normal' }],
      }),
    });

    callDiceThrow({ messageIdentifier: whispered.identifier }, 'here');
    callDiceThrow({ messageIdentifier: inHiddenTab.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(whispered)).toBeUndefined();
    expect(thrown(inHiddenTab)).toBeUndefined();
    hiddenTab.destroy();
  });

  it('throws a large roll on as many trays as hold it, each landing its share of the numbers', async () => {
    const faces = d6s(120);
    const line = answer({ faces });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrownOn(line, 'frame').map((t) => t.phase)).toEqual(Array(3).fill('rolling')), {
      timeout: 15000,
    });
    const trays = thrownOn(line, 'frame');
    expect(trays.map((t) => t.key)).toEqual([line.identifier, `${line.identifier}#1`, `${line.identifier}#2`]);
    expect(trays.map((t) => t.dice.length)).toEqual([40, 40, 40]);
    expect(trays.flatMap((t) => t.shown)).toEqual(faces.map((face) => String(face.value)));
    expect(new Set(trays.map((t) => t.tray.halfWidth)).size).toBe(1);
    expect(trays[1].result?.frames).not.toEqual(trays[0].result?.frames);
  }, 20000);

  it('throws nothing for a roll with no dice it can draw', async () => {
    const line = answer({ faces: [{ sides: 7, value: 3 }] });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)).toBeUndefined();
  });

  it('lays the dice down still, showing their numbers, for a reader who keeps the screen still', async () => {
    TestBed.inject(MotionService).setting.set('off');
    const line = answer({
      faces: [
        { sides: 6, value: 5 },
        { sides: 10, value: 10 },
      ],
    });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'));
    expect(thrown(line)?.still).toBe(true);
    expect(thrown(line)?.shown).toEqual(['5', '0']);
  });

  it('lays each die down with its number near enough upright to the reader', async () => {
    TestBed.inject(MotionService).setting.set('off');
    const line = answer({ faces: [6, 8, 10, 12, 20].map((sides) => ({ sides, value: 3 })) });

    callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'));
    const { dice, result } = thrown(line)!;
    dice.forEach((die, index) => {
      const at = index * 7 + 3;
      const rest: Quat = [result!.frames[at], result!.frames[at + 1], result!.frames[at + 2], result!.frames[at + 3]];
      const [x, y] = quatRotate(rest, faceFramesOf(die.shape)[die.target].up);
      expect(Math.abs(Math.atan2(-x, y))).toBeLessThan(0.2);
    });
  });

  it(`tumbles no more than ${MAX_TUMBLING} rolls at once and lays the rest down still`, async () => {
    const lines = Array.from({ length: MAX_TUMBLING + 1 }, () => answer());

    for (const line of lines) callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(lines.every((line) => thrown(line)?.result)).toBe(true));
    expect(lines.map((line) => thrown(line)?.still)).toEqual([...Array(MAX_TUMBLING).fill(false), true]);
  });

  describe('with the physics held, so every roll thrown stays on the move', () => {
    beforeEach(() => {
      useDicePhysicsWorkerFactory(heldWorker);
    });

    async function throwAll(lines: ChatMessage[]): Promise<void> {
      for (const line of lines) {
        callDiceThrow({ messageIdentifier: line.identifier }, 'here');
        await vi.waitFor(() => expect(thrownOn(line, 'frame').length).toBeGreaterThan(0));
      }
    }

    it(`tumbles ${MAX_TUMBLING} rolls beside dice thrown to try a look out, which no line said`, async () => {
      service.tryOut(PLAIN_DICE_LOOK, '#2b8a3e');
      const lines = Array.from({ length: MAX_TUMBLING }, () => answer());

      await throwAll(lines);

      expect(lines.map((line) => thrownOn(line, 'frame')[0].still)).toEqual(Array(MAX_TUMBLING).fill(false));
    });

    it(`tumbles a roll of ${MAX_TUMBLING_DICE / 2} dice with nothing else on the move`, async () => {
      const big = answer({ faces: d6s(200) });

      await throwAll([big]);

      expect(thrownOn(big, 'frame').map((t) => t.still)).toEqual([false, false, false, false]);
    });

    it(`lays a roll down still once more than ${MAX_TUMBLING_DICE} dice would be on the move`, async () => {
      const lines = [answer({ faces: d6s(200) }), answer({ faces: d6s(200) }), answer({ faces: d6s(1) })];

      await throwAll(lines);

      expect(lines.map((line) => thrownOn(line, 'frame')[0].still)).toEqual([false, false, true]);
    });

    it(`keeps no more than ${LITE_TUMBLING_DICE} dice on the move on a device drawn lightly`, async () => {
      TestBed.inject(RenderLiteService).setting.set('on');
      const lines = [answer({ faces: d6s(150) }), answer({ faces: d6s(50) }), answer({ faces: d6s(1) })];

      await throwAll(lines);

      expect(lines.map((line) => thrownOn(line, 'frame')[0].still)).toEqual([false, false, true]);
    });

    it('counts the dice a roll already has on the move in its other place', async () => {
      Config.instance.diceStage = 'both';
      const lines = [answer({ faces: d6s(100) }), answer({ faces: d6s(150) })];

      await throwAll(lines);
      await vi.waitFor(() => expect(thrownOn(lines[1], 'table').length).toBeGreaterThan(0));

      expect(thrownOn(lines[1], 'frame').every((t) => !t.still)).toBe(true);
      expect(thrownOn(lines[1], 'table').every((t) => t.still)).toBe(true);
    });
  });

  it(`keeps the throws of the last ${KEPT_THROWS} rolls and lets older ones go`, async () => {
    TestBed.inject(MotionService).setting.set('off');
    const lines = Array.from({ length: KEPT_THROWS + 2 }, () => answer());

    for (const line of lines) callDiceThrow({ messageIdentifier: line.identifier }, 'here');

    await vi.waitFor(() => expect(thrown(lines[lines.length - 1])?.phase).toBe('settled'));
    expect(service.throws().size).toBe(KEPT_THROWS);
    expect(thrown(lines[0])).toBeUndefined();
  });

  it(`keeps only where the dice came to rest for a throw older than the last ${KEPT_IN_FULL} rolls thrown`, async () => {
    const first = answer({
      faces: [
        { sides: 20, value: 17 },
        { sides: 6, value: 2 },
      ],
    });
    await throwToRest(first);
    const whole = thrown(first)!.result!;
    const stride = 2 * FRAME_STRIDE;
    const rest = whole.frames.slice((whole.frameCount - 1) * stride, whole.frameCount * stride);

    const later = Array.from({ length: KEPT_IN_FULL - 1 }, () => answer());
    for (const line of later) await throwToRest(line);
    expect(thrown(first)?.result).toBe(whole);

    await throwToRest(answer());

    const folded = thrown(first)!.result!;
    expect(folded.frameCount).toBe(1);
    expect(folded.restFrame).toBe(0);
    expect(Array.from(folded.frames)).toEqual(Array.from(rest));
    expect(folded.corrections).toEqual(whole.corrections);
    expect(thrown(first)?.shown).toEqual(['17', '2']);
  });

  it('hands a line the same frames while another line’s throw changes, and new ones once its own does', async () => {
    const line = answer();
    await throwToRest(line);
    const before = service.framesOf(line.identifier);

    await throwToRest(answer());
    expect(service.framesOf(line.identifier)).toBe(before);

    service.fail(line.identifier);
    expect(service.framesOf(line.identifier)).not.toBe(before);
  });

  it('lets lines scrolled back over go before a roll that tumbled, keeping that one whole', async () => {
    const roll = answer();
    await throwToRest(roll);
    const old = Array.from({ length: KEPT_THROWS }, () => answer({ timestamp: Date.now() - JUST_ROLLED_MS - 1000 }));

    for (const line of old) service.showStill(line.identifier);

    expect(thrown(old[old.length - 1])?.still).toBe(true);
    expect(thrown(old[0])).toBeUndefined();
    expect(thrown(roll)?.result?.frameCount).toBeGreaterThan(1);
  });

  it('keeps a throw put away while its dice are worked out, when they are worked out after', async () => {
    const held: DicePhysicsJob[] = [];
    const worker = Object.assign(new EventTarget(), {
      postMessage: (job: DicePhysicsJob) => held.push(job),
      terminate: () => undefined,
    });
    useDicePhysicsWorkerFactory(() => worker as unknown as Worker);
    const line = answer();
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(held.some((job) => job.request.key === line.identifier)).toBe(true));

    service.fail(line.identifier);
    const job = held.find((held) => held.request.key === line.identifier)!;
    worker.dispatchEvent(new MessageEvent('message', { data: { id: job.id, result: simulateThrow(job.request) } }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(thrown(line)?.phase).toBe('failed');
    expect(thrown(line)?.result).toBeNull();
  });

  it('puts a throw away when its dice cannot be drawn', async () => {
    const line = answer();
    callDiceThrow({ messageIdentifier: line.identifier }, 'here');
    await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));

    service.fail(line.identifier);

    expect(thrown(line)?.phase).toBe('failed');
  });

  describe('for a line said before', () => {
    const LONG_AGO = () => Date.now() - JUST_ROLLED_MS - 1000;

    it('keeps a frame of the shape of its dice for a line in a room that shows dice in frames', () => {
      const line = answer({ timestamp: LONG_AGO(), faces: [{ sides: 6, value: 4 }] });

      const frames = service.framesOf(line.identifier);

      expect(frames).toHaveLength(1);
      expect(frames[0].key).toBe(line.identifier);
      expect(frames[0].diceThrow).toBeNull();
      expect(frames[0].aspect).toBe(4);
    });

    it('keeps no frame where the room shows no dice in frames, or in a replay', () => {
      const line = answer({ timestamp: LONG_AGO() });

      Config.instance.diceStage = 'table';
      TestBed.tick();
      expect(service.framesOf(line.identifier)).toEqual([]);

      Config.instance.diceStage = 'frame';
      TestBed.tick();
      setNetworkIsolated(true);
      expect(service.framesOf(line.identifier)).toEqual([]);
    });

    it('keeps no frame for a secret roll that was someone else’s, nor for a roll with no dice it can draw', () => {
      const theirs = answer({ timestamp: LONG_AGO(), secret: true, from: SOMEONE });
      const odd = answer({ timestamp: LONG_AGO(), faces: [{ sides: 7, value: 3 }] });

      expect(service.framesOf(theirs.identifier)).toEqual([]);
      expect(service.framesOf(odd.identifier)).toEqual([]);
    });

    it('lays its dice down at rest, showing the numbers it came to', () => {
      const line = answer({
        timestamp: LONG_AGO(),
        faces: [
          { sides: 6, value: 5 },
          { sides: 10, value: 10 },
        ],
        color: '#2b8a3e',
        outcome: 'fumble',
      });

      service.showStill(line.identifier);

      expect(thrown(line)?.phase).toBe('settled');
      expect(thrown(line)?.still).toBe(true);
      expect(thrown(line)?.shown).toEqual(['5', '0']);
      expect(thrown(line)?.color).toBe('#2b8a3e');
      expect(thrown(line)?.outcome).toBe('fumble');
      expect(service.framesOf(line.identifier)[0].diceThrow).toBe(thrown(line));
    });

    it('keeps a frame for each tray of a large roll, the dice it could not hold told on the last', () => {
      const line = answer({ timestamp: LONG_AGO(), faces: d6s(MAX_THROWN_DICE + 7) });

      const frames = service.framesOf(line.identifier);

      expect(frames.map((frame) => frame.key)).toEqual([
        line.identifier,
        `${line.identifier}#1`,
        `${line.identifier}#2`,
        `${line.identifier}#3`,
      ]);
      expect(frames.map((frame) => frame.overflow)).toEqual([0, 0, 0, 7]);
    });

    it('lays the dice of a large roll down on all its trays, each showing its share of the numbers', () => {
      const faces = d6s(120);
      const line = answer({ timestamp: LONG_AGO(), faces });

      service.showStill(line.identifier);

      const trays = thrownOn(line, 'frame');
      expect(trays.map((diceThrow) => diceThrow.dice.length)).toEqual([40, 40, 40]);
      expect(trays.every((diceThrow) => diceThrow.still && diceThrow.phase === 'settled')).toBe(true);
      expect(trays.flatMap((diceThrow) => diceThrow.shown)).toEqual(faces.map((face) => String(face.value)));
    });

    it('lays down nothing for a secret roll that was someone else’s', () => {
      const theirs = answer({ timestamp: LONG_AGO(), secret: true, from: SOMEONE });

      service.showStill(theirs.identifier);

      expect(thrown(theirs)).toBeUndefined();
    });

    it('gives a line just said a moment for its call to throw, and lays its dice down if none comes', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const line = answer();

      service.showStill(line.identifier);
      expect(thrown(line)).toBeUndefined();

      await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 1);
      expect(thrown(line)?.still).toBe(true);
    });

    it('throws a line just said whose call comes in that moment, rather than laying it down', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const line = answer();

      service.showStill(line.identifier);
      callDiceThrow({ messageIdentifier: line.identifier }, 'here');
      await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
      await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 1);

      expect(thrown(line)?.still).toBe(false);
    });

    it('leaves a line laid down still as it lies when its call to throw comes late', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const line = answer();
      service.showStill(line.identifier);
      await vi.advanceTimersByTimeAsync(LINE_WAIT_MS + 1);
      const laid = thrown(line);

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');
      await vi.advanceTimersByTimeAsync(20);

      expect(thrown(line)).toBe(laid);
    });
  });

  describe('on the table', () => {
    beforeEach(() => {
      Config.instance.diceStage = 'table';
    });

    it('throws the dice on the tray the table gives them, before the piece that spoke', async () => {
      const line = answer({ faces: [{ sides: 6, value: 4 }] });

      callDiceThrow({ messageIdentifier: line.identifier, speakerIdentifier: 'goblin' }, 'here');

      await vi.waitFor(() => expect(thrownOnTable(line)?.phase).toBe('rolling'));
      expect(thrownOnTable(line)?.stage).toBe('table');
      expect(thrownOnTable(line)?.placement).toBe(placement);
      expect(thrownOnTable(line)?.tray).toEqual(placement!.tray);
      expect(thrownOnTable(line)?.shown).toEqual(['4']);
      expect(thrown(line)).toBeUndefined();
      expect(placedFor).toEqual(['goblin']);
    });

    it('lays the trays of a large roll on the table where the table puts them, all at once', async () => {
      useDicePhysicsWorkerFactory(heldWorker);
      TestBed.inject(MotionService).setting.set('on');
      const line = answer({ faces: d6s(60) });

      callDiceThrow({ messageIdentifier: line.identifier, speakerIdentifier: 'goblin' }, 'here');

      await vi.waitFor(() => expect(thrownOn(line, 'table')).toHaveLength(2));
      expect(placedCounts).toEqual([[30, 30]]);
      expect(thrownOn(line, 'table').map((t) => t.key)).toEqual([
        `${line.identifier}:table`,
        `${line.identifier}#1:table`,
      ]);
    });

    it('puts nothing on the table for a reader who keeps the screen still', async () => {
      TestBed.inject(MotionService).setting.set('off');
      const line = answer();

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.throws().size).toBe(0);
    });

    it('throws nothing when no table is on show', async () => {
      placement = null;
      const line = answer();

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.throws().size).toBe(0);
    });
  });

  describe('in both places', () => {
    beforeEach(() => {
      Config.instance.diceStage = 'both';
    });

    it('throws the dice in the frame and on the table, each its own way, to the same numbers', async () => {
      const line = answer({
        faces: [
          { sides: 20, value: 17 },
          { sides: 6, value: 2 },
        ],
      });

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');

      await vi.waitFor(() => expect(thrown(line)?.phase).toBe('rolling'));
      await vi.waitFor(() => expect(thrownOnTable(line)?.phase).toBe('rolling'));
      expect(thrown(line)?.stage).toBe('frame');
      expect(thrownOnTable(line)?.stage).toBe('table');
      expect(thrown(line)?.shown).toEqual(['17', '2']);
      expect(thrownOnTable(line)?.shown).toEqual(['17', '2']);
      expect(thrownOnTable(line)?.result?.frames).not.toEqual(thrown(line)?.result?.frames);
    });

    it('counts a roll shown in both places as one roll tumbling', async () => {
      const lines = Array.from({ length: MAX_TUMBLING }, () => answer());

      for (const line of lines) callDiceThrow({ messageIdentifier: line.identifier }, 'here');

      await vi.waitFor(() => expect(lines.every((line) => thrownOnTable(line)?.result)).toBe(true));
      expect(lines.map((line) => thrownOnTable(line)?.still)).toEqual(Array(MAX_TUMBLING).fill(false));
    });

    it('lays the dice down in the frame alone for a reader who keeps the screen still', async () => {
      TestBed.inject(MotionService).setting.set('off');
      const line = answer();

      callDiceThrow({ messageIdentifier: line.identifier }, 'here');

      await vi.waitFor(() => expect(thrown(line)?.phase).toBe('settled'));
      expect(thrownOnTable(line)).toBeUndefined();
    });
  });
});

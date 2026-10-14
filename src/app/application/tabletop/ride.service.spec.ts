import { TestBed } from '@angular/core/testing';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TurnState } from '@axe/domain/tabletop/turn-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('RideService', () => {
  let service: RideService;
  let said: string[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 30;
    table.height = 30;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    service = TestBed.inject(RideService);
    said = [];
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockImplementation((text: string) => {
      said.push(text);
      return null as never;
    });
  });

  afterEach(() => {
    TestBed.inject(MovePlanService).cancel();
    Config.instance.rideSkillField = null;
    Config.instance.rideRequireField = null;
    Config.instance.fallMinM = null;
    Config.instance.fallDamage = null;
    Config.instance.twoUpBuff = null;
    Config.instance.zoneEnabled = null;
    const turns = TestBed.inject(TurnState);
    turns.round = 0;
    turns.phase = 'idle';
    turns.currentIdentifier = '';
    turns.actedIdentifiers = [];
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(name: string, col: number, row: number, size = 1, walk = 3): GameCharacter {
    const piece = GameCharacter.create(name, size, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = walk;
    return piece;
  }

  function horseAt(col: number, row: number, more: Partial<GameCharacter> = {}): GameCharacter {
    const horse = pieceAt('馬', col, row, 1, 6);
    horse.mountable = '1';
    Object.assign(horse, more);
    return horse;
  }

  function withSkill(piece: GameCharacter, value: number): GameCharacter {
    piece.rootDataElement!.appendChild(DataElement.create('騎乗術', value, {}, '騎乗術' + piece.identifier));
    return piece;
  }

  it("seats a mount's riders on top of its picture by default, as its menu says, and at a part of it when set", () => {
    const robot = horseAt(5, 5, { mountSeatHeight: 'waist', specifyKomaImageFlag: true, komaImageHeight: 200 });
    const horse = horseAt(9, 9);

    expect(service.seatHeight(robot)).toBe(4);
    expect(service.menuOf(robot).mount).toMatchObject({ seatHeight: '', seatDefault: 'top' });
    expect(service.menuOf(horse).mount).toMatchObject({ seatHeight: '', seatDefault: 'half' });

    service.setSeatHeight(robot, '75%');
    expect(robot.mountSeatHeight).toBe('75%');
    expect(service.seatHeight(robot)).toBe(3);
    expect(service.menuOf(robot).mount?.seatHeight).toBe('75%');

    service.convertSeatHeight(robot, 'px');
    expect(robot.mountSeatHeight).toBe('150px');
    expect(service.seatHeight(robot)).toBe(3);
  });

  it('offers the mounts at the same point and the seats free on them, and none further off', () => {
    const horse = horseAt(5, 5, { mountPassenger: '1' });
    horseAt(9, 9);
    const rider = pieceAt('騎士', 5, 5);

    expect(service.menuOf(rider).offers).toEqual([
      { id: horse.identifier, name: '馬', seats: [{ seat: 'rider', refusal: null, getsUp: false }] },
    ]);
    expect(service.mount(rider, horse, 'rider')).toBe(true);
    const friend = pieceAt('従者', 5, 5);
    expect(service.menuOf(friend).offers[0].seats.map((one) => one.seat)).toEqual(['passenger']);
  });

  it('gets a piece on in front, stands its middle on the mount, and says it took no action where it steers', () => {
    const horse = horseAt(5, 5, { size: 2 } as Partial<GameCharacter>);
    const rider = pieceAt('騎士', 5, 5);

    service.mount(rider, horse, 'rider');

    expect(rider.ridingOn).toBe(horse.identifier);
    expect(service.seatOf(rider)).toBe('rider');
    expect(rider.location.x).toBe(5 * GRID + GRID / 2);
    expect(said).toEqual(['騎士 が 馬 に乗りました（手番の行動を使わない）']);
  });

  it('keeps one who cannot steer off a mount that asks for the skill, and the skilled off one beyond them', () => {
    Config.instance.rideSkillField = '騎乗術';
    Config.instance.rideRequireField = '要求';
    const horse = horseAt(5, 5);
    horse.rootDataElement!.appendChild(DataElement.create('要求', 3, {}, '要求' + horse.identifier));
    const plain = pieceAt('村人', 5, 5);
    const novice = withSkill(pieceAt('見習い', 5, 5), 2);
    const expert = withSkill(pieceAt('達人', 5, 5), 4);

    expect(service.menuOf(plain).offers[0].seats[0].refusal).toBe('needsSkill');
    expect(service.menuOf(novice).offers[0].seats[0].refusal).toBe('tooHard');
    expect(service.mount(plain, horse, 'rider')).toBe(false);
    expect(service.mount(expert, horse, 'rider')).toBe(true);

    horse.mountAnyone = '1';
    service.dismount(expert);
    expect(service.menuOf(plain).offers[0].seats[0].refusal).toBeNull();
  });

  it('moves a piece riding in front by its mount, one riding behind by nothing, and a mount nobody rides only for a game master', () => {
    const horse = horseAt(5, 5, { mountPassenger: '1' });
    const rider = pieceAt('騎士', 5, 5);
    const friend = pieceAt('従者', 5, 5);
    expect(service.moverFor(horse)).toBeNull();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(service.moverFor(horse)).toBe(horse);
    PeerCursor.myCursor.role = PeerRole.Player;

    service.mount(rider, horse, 'rider');
    service.mount(friend, horse, 'passenger');

    expect(service.moverFor(rider)).toBe(horse);
    expect(service.moverFor(friend)).toBeNull();
    expect(service.moverFor(horse)).toBe(horse);
    expect(service.moverFor(pieceAt('通行人', 9, 9))?.name).toBe('通行人');
  });

  it("opens the mount's move for its rider, and brings everybody on it along once it is walked", async () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5, 1, 1);
    service.mount(rider, horse, 'rider');
    const planner = TestBed.inject(MovePlannerService);
    const plan = TestBed.inject(MovePlanService);

    expect(planner.begin(rider)).toBe(true);
    expect(plan.plan()?.characterIdentifier).toBe(horse.identifier);
    plan.lookAt(10 * GRID + 10, 5 * GRID + 10);
    await plan.run();

    expect(horse.location.x).toBe(10 * GRID);
    expect(rider.location.x).toBe(10 * GRID);
  });

  it('gets a piece put down off its mount off it, and puts one put down on it back where it stands', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);
    service.mount(rider, horse, 'rider');

    rider.location = { name: 'table', x: 5 * GRID + 3, y: 5 * GRID };
    service.afterPutDown(rider);
    expect(rider.ridingOn).toBe(horse.identifier);
    expect(rider.location.x).toBe(5 * GRID);

    horse.location = { name: 'table', x: 8 * GRID, y: 5 * GRID };
    service.afterPutDown(horse);
    expect(rider.location.x).toBe(8 * GRID);

    said = [];
    rider.location = { name: 'table', x: 12 * GRID, y: 5 * GRID };
    service.afterPutDown(rider);
    expect(rider.ridingOn).toBe('');
    expect(rider.prone).toBe('');
    expect(rider.location.x).toBe(12 * GRID);
    expect(said).toEqual(['騎士 が 馬 から降りました（手番の行動を使わない）']);
  });

  describe('putting a piece down on a mount', () => {
    function shown(): { message: string; action?: { label: string; run(): void } }[] {
      const notices: { message: string; action?: { label: string; run(): void } }[] = [];
      vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation((message, options) => {
        notices.push({ message, action: options?.action });
      });
      return notices;
    }

    it('offers the first seat it may take on a mount whose base it stands over, and gets it on from there', () => {
      const notices = shown();
      const horse = horseAt(5, 5, { size: 3, mountPassenger: '1' } as Partial<GameCharacter>);
      const rider = pieceAt('騎士', 7, 7);

      service.offerRide(rider);

      expect(notices.map((notice) => [notice.message, notice.action?.label])).toEqual([
        ['騎士 は 馬 の上にいます', '乗る'],
      ]);
      notices[0].action!.run();
      expect(rider.ridingOn).toBe(horse.identifier);
      const friend = pieceAt('従者', 7, 7);
      service.offerRide(friend);
      expect(notices[1].action?.label).toBe('同乗する');
    });

    it('offers a seat to a piece whose planned move ends on a mount', async () => {
      const notices = shown();
      horseAt(8, 5);
      const rider = pieceAt('騎士', 5, 5);
      const planner = TestBed.inject(MovePlannerService);
      const plan = TestBed.inject(MovePlanService);

      planner.begin(rider);
      plan.lookAt(8 * GRID + 10, 5 * GRID + 10);
      await plan.run();

      expect(notices.map((notice) => notice.action?.label)).toEqual(['乗る']);
    });

    it('offers nothing off a mount, nor to one riding already', () => {
      const notices = shown();
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 9, 9);

      service.offerRide(rider);
      service.mount(pieceAt('従者', 5, 5), horse, 'rider');

      expect(notices).toEqual([]);
    });

    it('says why a piece put down on a mount may not get on it', () => {
      const notices = shown();
      Config.instance.rideSkillField = '騎乗術';
      horseAt(5, 5);

      service.offerRide(pieceAt('村人', 5, 5));

      expect(notices.map((notice) => [notice.message, notice.action])).toEqual([
        ['村人 は 馬 に乗れません（操る技能がない）', undefined],
      ]);
    });

    it('puts a piece taken off its mount back on where it got on this turn', () => {
      const notices = shown();
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      const turns = TestBed.inject(TurnState);
      turns.round = 1;
      turns.phase = 'acting';
      turns.currentIdentifier = rider.identifier;
      service.mount(rider, horse, 'rider');

      rider.location = { name: 'table', x: 12 * GRID, y: 5 * GRID };
      service.afterPutDown(rider);

      expect(rider.ridingOn).toBe(horse.identifier);
      expect(rider.location.x).toBe(5 * GRID);
      expect(notices.map((notice) => notice.message)).toEqual([
        '騎士 はこの手番にもう乗り降りしたので、馬 の上に戻しました',
      ]);
    });
  });

  it('keeps a rider down, held where it stands or held on to from moving its mount', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);
    service.mount(rider, horse, 'rider');
    const planner = TestBed.inject(MovePlannerService);

    rider.heldFast = '1';
    expect(service.moveRefusal(rider)).toBe('riderHeld');
    expect(planner.begin(rider)).toBe(false);
    rider.heldFast = '';
    rider.grabbedBy = pieceAt('大蛇', 5, 5).identifier;
    expect(service.moveRefusal(rider)).toBe('riderHeld');
    rider.grabbedBy = '';
    expect(service.moveRefusal(rider)).toBeNull();
  });

  it('takes off a mount a rider it left behind where it was carried, held where it stands', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);
    service.mount(rider, horse, 'rider');
    rider.heldFast = '1';

    horse.location = { name: 'table', x: 12 * GRID, y: 5 * GRID };
    service.afterPutDown(horse);

    expect(rider.ridingOn).toBe('');
    expect(rider.location.x).toBe(5 * GRID);
  });

  it('lets everybody off a piece that stops being a mount, and reads one riding a piece no longer a mount as riding nothing', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);
    service.mount(rider, horse, 'rider');

    service.setMountable(horse, false);

    expect(rider.ridingOn).toBe('');
    rider.ridingOn = horse.identifier;
    expect(service.mountOf(rider)).toBeNull();
    expect(service.moverFor(rider)).toBe(rider);
  });

  it('gets nobody on a mount that is down, and nobody on who is down or held fast, saying why', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);
    const seat = () => service.menuOf(rider).offers[0].seats[0];

    rider.heldFast = '1';
    expect(seat()).toEqual({ seat: 'rider', refusal: 'held', getsUp: false });
    expect(service.mount(rider, horse, 'rider')).toBe(false);
    rider.heldFast = '';
    rider.downed = '1';
    expect(seat().refusal).toBe('down');
    rider.downed = '';
    horse.downed = '1';
    expect(seat().refusal).toBe('mountDown');
    expect(service.mount(rider, horse, 'rider')).toBe(false);
  });

  describe('while turns are taken', () => {
    function turnOf(piece: GameCharacter, round = 1): string {
      const turns = TestBed.inject(TurnState);
      turns.round = round;
      turns.phase = 'acting';
      turns.currentIdentifier = piece.identifier;
      return `${round}:${piece.identifier}`;
    }

    it('lets a piece get on or off once a turn, and as often as it likes outside turns', () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      expect(service.mount(rider, horse, 'rider')).toBe(true);
      expect(service.dismount(rider)).toBe(true);

      service.mount(rider, horse, 'rider');

      turnOf(rider);
      expect(service.dismount(rider)).toBe(true);
      expect(service.menuOf(rider).changeRefusal).toBe('changedThisTurn');
      expect(service.mount(rider, horse, 'rider')).toBe(false);
      turnOf(horse);
      expect(service.mount(rider, horse, 'rider')).toBe(true);
      expect(service.dismount(rider)).toBe(false);
    });

    it('ends the turns of the mount and the one behind where the one in front gets off in its turn', () => {
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const rider = pieceAt('騎士', 5, 5);
      const friend = pieceAt('従者', 5, 5);
      service.mount(rider, horse, 'rider');
      service.mount(friend, horse, 'passenger');

      turnOf(rider);
      service.dismount(rider);

      expect([...TestBed.inject(TurnState).actedIdentifiers].sort()).toEqual(
        [horse.identifier, friend.identifier].sort()
      );
    });

    it('ends the turn of the one behind where it gets off in the turn of the one in front', () => {
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const rider = pieceAt('騎士', 5, 5);
      const friend = pieceAt('従者', 5, 5);
      service.mount(rider, horse, 'rider');
      service.mount(friend, horse, 'passenger');

      turnOf(rider);
      service.dismount(friend);

      expect(TestBed.inject(TurnState).actedIdentifiers).toEqual([friend.identifier]);
    });

    it('keeps a rider from moving a mount that has moved in another turn this round', () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      horse.rideMoveTurn = turnOf(horse, 2);

      turnOf(rider, 2);
      service.mount(rider, horse, 'rider');

      expect(service.moveRefusal(rider)).toBe('mountMoved');
      expect(TestBed.inject(MovePlannerService).begin(rider)).toBe(false);
      turnOf(rider, 3);
      expect(service.moveRefusal(rider)).toBeNull();
    });

    it('lets one that got off in its turn walk on only where it steered and the mount stood still', () => {
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const rider = pieceAt('騎士', 5, 5);
      const friend = pieceAt('従者', 5, 5);
      service.mount(rider, horse, 'rider');
      service.mount(friend, horse, 'passenger');

      const turn = turnOf(rider);
      service.dismount(friend);
      service.dismount(rider);

      expect(service.moveRefusal(rider)).toBeNull();
      expect(service.moveRefusal(friend)).toBe('cannotAfterLeaving');
      horse.rideMoveTurn = turn;
      expect(service.moveRefusal(rider)).toBe('cannotAfterLeaving');
    });

    it('counts a piece taken off for nothing against getting on or off once a turn', () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      service.mount(rider, horse, 'rider');

      turnOf(rider);
      service.setMountable(horse, false);
      service.setMountable(horse, true);

      expect(rider.ridingOn).toBe('');
      expect(service.menuOf(rider).changeRefusal).toBeNull();
      expect(service.mount(rider, horse, 'rider')).toBe(true);
    });

    it('writes down how far a mount set out to move in the turn, adding up the moves in it', async () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      service.mount(rider, horse, 'rider');
      const turn = turnOf(rider);
      const planner = TestBed.inject(MovePlannerService);
      const plan = TestBed.inject(MovePlanService);

      planner.begin(rider);
      plan.lookAt(8 * GRID + 10, 5 * GRID + 10);
      await plan.run();
      planner.begin(rider);
      plan.lookAt(10 * GRID + 10, 5 * GRID + 10);
      await plan.run();

      expect(horse.rideMoveTurn).toBe(turn);
      expect(Number(horse.rideMoveM)).toBe(5);
      expect(rider.rideMoveTurn).toBe('');
    });
  });

  describe('falling off', () => {
    function loaded(): { horse: GameCharacter; knight: GameCharacter; squire: GameCharacter; crate: GameCharacter } {
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const knight = pieceAt('騎士', 5, 5);
      const squire = pieceAt('従者', 5, 5);
      const crate = pieceAt('木箱', 5, 5);
      service.mount(knight, horse, 'rider');
      service.mount(squire, horse, 'passenger');
      crate.ridingOn = horse.identifier;
      crate.rideSeat = 'cargo';
      said = [];
      return { horse, knight, squire, crate };
    }

    function turnOf(piece: GameCharacter, round = 1): string {
      const turns = TestBed.inject(TurnState);
      turns.round = round;
      turns.phase = 'acting';
      turns.currentIdentifier = piece.identifier;
      return `${round}:${piece.identifier}`;
    }

    it('throws everybody off a mount that falls over, laying them where they fell and saying how far', () => {
      const { horse, knight, squire, crate } = loaded();

      service.setProne(horse, true);

      expect([knight, squire, crate].map((one) => [one.ridingOn, one.prone])).toEqual([
        ['', '1'],
        ['', '1'],
        ['', '1'],
      ]);
      expect(said).toEqual([
        '馬 が転びました',
        '騎士 が 馬 から落ちました（落下距離 2m）',
        '従者 が 馬 から落ちました（落下距離 2m）',
        '木箱 が 馬 から落ちました（落下距離 2m）',
      ]);
    });

    it('throws the one in front off with the load where it goes down, and leaves the one behind on', () => {
      const { knight, squire, crate } = loaded();

      service.setDown(knight, true);

      expect(knight.downed).toBe('1');
      expect([knight.ridingOn, crate.ridingOn]).toEqual(['', '']);
      expect(squire.ridingOn).not.toBe('');
    });

    it('leaves those thrown off a mount that goes down in the zone they were in', () => {
      Config.instance.zoneEnabled = true;
      const { horse, knight } = loaded();
      const foe = pieceAt('敵', 5, 5);
      foe.isNpc = true;
      const zones = TestBed.inject(EngagementZoneService);
      zones.declare(foe, horse);
      zones.join(pieceAt('味方', 5, 5), horse.engagementZone);
      const zone = horse.engagementZone;

      service.setDown(horse, true);

      expect(horse.engagementZone).toBe('');
      expect(knight.engagementZone).toBe(zone);
      expect(zones.stateNow().zoneOf(knight.identifier)?.id).toBe(zone);
    });

    it('measures a fall from how far the mount set out to move this turn, and no less than the shortest fall', () => {
      const { horse, knight, squire } = loaded();
      horse.rideMoveTurn = turnOf(knight);
      horse.rideMoveM = '21';

      service.setProne(knight, true);
      Config.instance.fallMinM = 6;
      service.setProne(squire, true);

      expect(said).toContain('騎士 が 馬 から落ちました（落下距離 5m）');
      expect(said).toContain('従者 が 馬 から落ちました（落下距離 6m）');
    });

    it('rolls what a fall does for the piece that fell, where the room says', () => {
      const { horse, knight } = loaded();
      Config.instance.fallDamage = '{m}d6+{m}';
      const rolled = vi.spyOn(TestBed.inject(CharacterMacroService), 'sendAsCharacter').mockResolvedValue(null);

      service.setProne(horse, true);

      expect(rolled).toHaveBeenCalledWith(knight, '2d6+2');
    });

    it('keeps a piece that fell over in its own turn lying there until the turn is over', () => {
      const walker = pieceAt('通行人', 9, 9);
      turnOf(walker);

      service.setProne(walker, true);

      expect(service.proneRefusal(walker)).toBe('fellThisTurn');
      expect(service.setProne(walker, false)).toBe(false);
      turnOf(walker, 2);
      expect(service.setProne(walker, false)).toBe(true);
      expect(walker.prone).toBe('');
    });

    it('keeps a piece thrown off in its own turn lying there until the turn is over', () => {
      const { horse, knight } = loaded();
      turnOf(knight);

      service.setProne(horse, true);

      expect(service.proneRefusal(knight)).toBe('fellThisTurn');
    });

    it('lets a piece that fell over in a turn not its own get up when it likes', () => {
      const walker = pieceAt('通行人', 9, 9);
      turnOf(pieceAt('敵', 1, 1));

      service.setProne(walker, true);

      expect(service.menuOf(walker).prone).toEqual({ on: true, refusal: null });
    });

    it('gets nobody on a mount lying where it fell, and gets one lying there up first to get on', () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      const seat = () => service.menuOf(rider).offers[0].seats[0];

      horse.prone = '1';
      rider.prone = '1';
      expect(seat()).toEqual({ seat: 'rider', refusal: 'prone', getsUp: false });
      expect(service.mount(rider, horse, 'rider')).toBe(false);
      horse.prone = '';
      expect(seat()).toEqual({ seat: 'rider', refusal: 'prone', getsUp: true });

      expect(service.mount(rider, horse, 'rider')).toBe(true);
      expect([rider.prone, rider.ridingOn]).toEqual(['', horse.identifier]);
    });

    it('offers to get one thrown off back up and on once its mount is up again', () => {
      const notices: { label?: string; run?: () => void }[] = [];
      vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation((_, options) => {
        notices.push({ label: options?.action?.label, run: options?.action?.run });
      });
      const { horse, knight } = loaded();
      service.setProne(horse, true);
      service.setProne(horse, false);

      service.offerRide(knight);

      expect(notices.map((notice) => notice.label)).toEqual(['起き上がって乗る']);
      notices[0].run!();
      expect([knight.prone, knight.ridingOn]).toEqual(['', horse.identifier]);
    });

    it('keeps one that fell in its own turn off until the turn is over, saying why', () => {
      const horse = horseAt(5, 5);
      const rider = pieceAt('騎士', 5, 5);
      turnOf(rider);
      service.setProne(rider, true);

      expect(service.menuOf(rider).offers[0].seats[0]).toEqual({ seat: 'rider', refusal: 'prone', getsUp: false });
      expect(service.mount(rider, horse, 'rider')).toBe(false);
    });
  });

  describe('riding two up', () => {
    function twoUp(): { horse: GameCharacter; knight: GameCharacter; squire: GameCharacter } {
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const knight = pieceAt('騎士', 5, 5);
      const squire = pieceAt('従者', 5, 5);
      service.mount(knight, horse, 'rider');
      service.mount(squire, horse, 'passenger');
      return { horse, knight, squire };
    }

    const carries = (piece: GameCharacter) => piece.buffs.list().map((data) => data.name);

    it('gives the two riding two up the room buff, and takes it off both once either gets off', () => {
      Config.instance.twoUpBuff = '&ふたり乗り/判定-4/99';
      const { knight, squire } = twoUp();

      expect([carries(knight), carries(squire)]).toEqual([['ふたり乗り'], ['ふたり乗り']]);
      expect(said).toContain('騎士 に ふたり乗り を付けました');

      service.dismount(squire);

      expect([carries(knight), carries(squire)]).toEqual([[], []]);
      expect(said).toContain('従者 の ふたり乗り を外しました');
    });

    it('moves a status by the buff while both ride, and back once they do not', () => {
      Config.instance.twoUpBuff = '&!ふたり乗り/移動/-/1/99';
      const { horse, knight } = twoUp();
      const walk = () => DataElement.findElementByReference(knight.rootDataElement!, '移動')!.value;

      expect(walk()).toBe(2);
      service.setProne(horse, true);
      expect(walk()).toBe(3);
    });

    it('takes off only the buff it gave, leaving one of the same name the piece already carried', () => {
      Config.instance.twoUpBuff = '&ふたり乗り/判定-4/99';
      const horse = horseAt(5, 5, { mountPassenger: '1' });
      const knight = pieceAt('騎士', 5, 5);
      knight.buffs.addRound('ふたり乗り', '自前', 5);
      service.mount(knight, horse, 'rider');
      const squire = pieceAt('従者', 5, 5);
      service.mount(squire, horse, 'passenger');

      service.dismount(knight);

      expect(carries(knight)).toEqual(['ふたり乗り']);
      expect(knight.buffs.find('ふたり乗り')?.currentValue).toBe('自前');
      expect(carries(squire)).toEqual([]);
    });

    it('gives nothing where the room writes no buff for riding two up', () => {
      const { knight, squire } = twoUp();

      expect([carries(knight), carries(squire)]).toEqual([[], []]);
    });
  });
});

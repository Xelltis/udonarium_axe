import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
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

  it('offers the mounts at the same point and the seats free on them, and none further off', () => {
    const horse = horseAt(5, 5, { mountPassenger: '1' });
    horseAt(9, 9);
    const rider = pieceAt('騎士', 5, 5);

    expect(service.menuOf(rider).offers).toEqual([
      { id: horse.identifier, name: '馬', seats: [{ seat: 'rider', refusal: null }] },
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

  it('gets a piece put down away from its mount off it, and puts one put down close by back on it', () => {
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

    rider.location = { name: 'table', x: 12 * GRID, y: 5 * GRID };
    service.afterPutDown(rider);
    expect(rider.ridingOn).toBe('');
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

  it('gets nobody on a mount that is down, and lets nobody on who is down or held fast', () => {
    const horse = horseAt(5, 5);
    const rider = pieceAt('騎士', 5, 5);

    rider.heldFast = '1';
    expect(service.menuOf(rider).offers).toEqual([]);
    rider.heldFast = '';
    horse.downed = '1';
    expect(service.menuOf(rider).offers).toEqual([]);
  });
});

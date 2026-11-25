import { TestBed } from '@angular/core/testing';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { SolidRangeService } from '@axe/application/tabletop/solid-range.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RangeArea } from '@axe/domain/tabletop/range';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('PieceTargetService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  function service(): PieceTargetService {
    return TestBed.inject(PieceTargetService);
  }

  it('puts the mark on a piece and takes it off again, and says so each time', () => {
    const piece = GameCharacter.create('コマ', 1, '');
    const signal = TestBed.inject(UiSignalService).targetChange;

    service().toggle(piece);
    expect(piece.targeted).toBe(true);
    expect(signal()).toEqual({ identifier: piece.identifier, className: piece.aliasName });

    service().toggle(piece);
    expect(piece.targeted).toBe(false);
  });

  it('takes the mark off everything at once', () => {
    const one = GameCharacter.create('一', 1, '');
    const two = GameCharacter.create('二', 1, '');
    service().toggle(one);
    service().toggle(two);
    expect(service().anything()).toBe(true);

    service().clear();

    expect(one.targeted).toBe(false);
    expect(two.targeted).toBe(false);
    expect(service().anything()).toBe(false);
  });

  it('aims at exactly the pieces given, and at nothing else', () => {
    const one = GameCharacter.create('一', 1, '');
    const two = GameCharacter.create('二', 1, '');
    const three = GameCharacter.create('三', 1, '');
    service().toggle(one);

    service().setOnly([two, three]);

    expect([one.targeted, two.targeted, three.targeted]).toEqual([false, true, true]);
  });

  it('lets go of the targets of an effect being picked as it takes every aim off', () => {
    const picking = TestBed.inject(EffectTargetingService);
    const cancelled = vi.spyOn(picking, 'cancel');
    const piece = GameCharacter.create('コマ', 1, '');
    service().toggle(piece);

    service().clear();

    expect(cancelled).toHaveBeenCalledOnce();
    expect(piece.targeted).toBe(false);
  });

  describe('aiming at what a range takes in', () => {
    function circleAt(x: number, y: number): RangeArea {
      const range = RangeArea.create('円', 1, 2, 50);
      range.type = 'CIRCLE';
      range.location = { name: 'table', x, y };
      return range;
    }

    it('aims at the pieces a circle takes in, and takes the aim off the rest and off pieces out of the fight', () => {
      const range = circleAt(300, 300);
      const inside = GameCharacter.create('中', 1, '');
      inside.location = { name: 'table', x: 325, y: 275 };
      const outside = GameCharacter.create('外', 1, '');
      outside.location = { name: 'table', x: 600, y: 600 };
      outside.targeted = true;
      const resting = GameCharacter.create('除外', 1, '');
      resting.location = { name: 'table', x: 300, y: 300 };
      resting.offField = '1';

      service().targetInsideRange(range, 50);

      expect([inside.targeted, outside.targeted, resting.targeted]).toEqual([true, false, false]);
      range.destroy();
    });

    it('picks the nearest of what it takes in for an effect held ready that takes one, whatever order the room holds them in', () => {
      const range = circleAt(300, 300);
      const edge = GameCharacter.create('端', 1, '');
      edge.location = { name: 'table', x: 340, y: 275 };
      const middle = GameCharacter.create('中央', 1, '');
      middle.location = { name: 'table', x: 275, y: 275 };
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);

      service().targetInsideRange(range, 50);

      expect(targeting.picks()).toEqual([middle.identifier]);
      targeting.cancel();
      range.destroy();
    });

    it('measures what a range standing up takes in from where it is cast from, not where it was last written down', () => {
      const range = circleAt(0, 0);
      vi.spyOn(range, 'isSolid', 'get').mockReturnValue(true);
      const byOrigin = GameCharacter.create('起点のそば', 1, '');
      byOrigin.location = { name: 'table', x: 500, y: 500 };
      const byWritten = GameCharacter.create('保存位置のそば', 1, '');
      byWritten.location = { name: 'table', x: 25, y: 25 };
      vi.spyOn(TestBed.inject(SolidRangeService), 'placedOf').mockReturnValue({
        origin: { x: 525, y: 525, z: 0 },
      } as never);
      vi.spyOn(service() as unknown as { takenIntoSolid(): GameCharacter[] }, 'takenIntoSolid').mockReturnValue([
        byWritten,
        byOrigin,
      ]);
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);

      service().targetInsideRange(range, 50);

      expect(targeting.picks()).toEqual([byOrigin.identifier]);
      targeting.cancel();
      range.destroy();
    });

    it('measures what a range standing up takes in through the room, a piece flying beside it nearer than one far below it', () => {
      const range = circleAt(0, 0);
      vi.spyOn(range, 'isSolid', 'get').mockReturnValue(true);
      const below = GameCharacter.create('真下', 1, '');
      below.location = { name: 'table', x: 475, y: 475 };
      const beside = GameCharacter.create('横の空中', 1, '');
      beside.location = { name: 'table', x: 525, y: 475 };
      beside.altitude = 3;
      vi.spyOn(TestBed.inject(SolidRangeService), 'placedOf').mockReturnValue({
        origin: { x: 500, y: 500, z: 175 },
      } as never);
      vi.spyOn(service() as unknown as { takenIntoSolid(): GameCharacter[] }, 'takenIntoSolid').mockReturnValue([
        below,
        beside,
      ]);
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);

      service().targetInsideRange(range, 50);

      expect(targeting.picks()).toEqual([beside.identifier]);
      targeting.cancel();
      range.destroy();
    });

    it('measures what a range laid on the table takes in across the table alone, however high each flies', () => {
      const range = circleAt(300, 300);
      const overhead = GameCharacter.create('真上の空', 1, '');
      overhead.location = { name: 'table', x: 275, y: 275 };
      overhead.altitude = 5;
      const aside = GameCharacter.create('横の地面', 1, '');
      aside.location = { name: 'table', x: 300, y: 275 };
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);

      service().targetInsideRange(range, 50);

      expect(targeting.picks()).toEqual([overhead.identifier]);
      targeting.cancel();
      range.destroy();
    });

    it('measures a range standing up to the middle of a tall piece, not its feet', () => {
      const range = circleAt(0, 0);
      vi.spyOn(range, 'isSolid', 'get').mockReturnValue(true);
      const giant = GameCharacter.create('巨人', 4, '');
      giant.location = { name: 'table', x: 400, y: 400 };
      const flier = GameCharacter.create('飛ぶ', 1, '');
      flier.location = { name: 'table', x: 525, y: 475 };
      flier.altitude = 3;
      vi.spyOn(TestBed.inject(SolidRangeService), 'placedOf').mockReturnValue({
        origin: { x: 500, y: 500, z: 100 },
      } as never);
      vi.spyOn(service() as unknown as { takenIntoSolid(): GameCharacter[] }, 'takenIntoSolid').mockReturnValue([
        flier,
        giant,
      ]);
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);

      service().targetInsideRange(range, 50);

      expect(targeting.picks()).toEqual([giant.identifier]);
      targeting.cancel();
      range.destroy();
    });

    it('takes in pieces as far off as its length counts squares, in the squares it is given', () => {
      const range = circleAt(300, 300);
      const twoSquaresOff = GameCharacter.create('二マス先', 1, '');
      twoSquaresOff.location = { name: 'table', x: 425, y: 275 };

      service().targetInsideRange(range, 50);
      expect(twoSquaresOff.targeted).toBe(false);

      service().targetInsideRange(range, 100);
      expect(twoSquaresOff.targeted).toBe(true);
      range.destroy();
    });
  });

  describe('aiming at what a range standing up off the table takes in', () => {
    const GRID = 50;

    beforeEach(() => {
      const table = new GameTable();
      table.width = 20;
      table.height = 20;
      table.gridSize = GRID;
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    });

    function pieceAt(col: number, row: number, altitude = 0): GameCharacter {
      const piece = GameCharacter.create('コマ', 1, '');
      piece.location = { name: 'table', x: col * GRID, y: row * GRID };
      piece.altitude = altitude;
      return piece;
    }

    function standing(type: string, kind: RangeArea['solidKind'], more: (range: RangeArea) => void): RangeArea {
      const range = RangeArea.create('立体', 3, 2, 100);
      range.type = type;
      range.solidKind = kind;
      more(range);
      const table = ObjectStore.instance.get<GameTable>(TableSelecter.instance.viewTableIdentifier)!;
      table.appendChild(range);
      return range;
    }

    it('takes in a piece on the ground under a low column and leaves one flying over it, and both once it is tall', () => {
      const column = standing('CIRCLE', 'column', (range) => {
        range.location = { name: 'table', x: 5.5 * GRID, y: 5.5 * GRID };
        range.columnHeight = 2;
      });
      const grounded = pieceAt(5, 6);
      const flying = pieceAt(6, 5, 3);

      service().targetInsideRange(column, GRID);
      expect([grounded.targeted, flying.targeted]).toEqual([true, false]);

      column.columnHeight = 4;
      TestBed.inject(ObjectChangeService).notifyChanged(column.identifier);
      service().targetInsideRange(column, GRID);
      expect([grounded.targeted, flying.targeted]).toEqual([true, true]);
    });

    it('takes in only the pieces a cone pointed up reaches, whatever lies under it on the ground', () => {
      const cone = standing('CORN', 'cone', (range) => {
        range.location = { name: 'table', x: 5 * GRID, y: 5.5 * GRID };
        range.length = 6;
        range.width = 2;
        range.aimPitch = 45;
        range.altitude = 0.5;
      });
      const overhead = pieceAt(8, 5, 3);
      const underneath = pieceAt(8, 5);

      service().targetInsideRange(cone, GRID);

      expect([overhead.targeted, underneath.targeted]).toEqual([true, false]);
    });
  });

  it('names the pieces on the table aimed at, read again as aims and places change', () => {
    const onTable = GameCharacter.create('卓', 1, '');
    onTable.location = { name: 'table', x: 0, y: 0 };
    const away = GameCharacter.create('墓', 1, '');
    away.location = { name: 'graveyard', x: 0, y: 0 };
    expect(service().onTable()).toEqual([]);

    service().toggle(onTable);
    service().toggle(away);
    expect(service().onTable()).toEqual([onTable]);

    onTable.location.name = 'graveyard';
    TestBed.inject(ObjectChangeService).notifyChanged(onTable.identifier);
    expect(service().onTable()).toEqual([]);
  });

  it('names the pieces it may aim at without pressing them: on the table, in the fight, and seen', () => {
    const fighting = GameCharacter.create('戦', 1, '');
    fighting.location = { name: 'table', x: 0, y: 0 };
    const resting = GameCharacter.create('休', 1, '');
    resting.location = { name: 'table', x: 50, y: 0 };
    resting.offField = '1';
    const away = GameCharacter.create('墓', 1, '');
    away.location = { name: 'graveyard', x: 0, y: 0 };
    const unseen = GameCharacter.create('影', 1, '');
    unseen.location = { name: 'table', x: 100, y: 0 };
    vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible').mockImplementation((piece) => piece !== unseen);

    expect(service().aimable()).toEqual([fighting]);

    resting.offField = '';
    TestBed.inject(ObjectChangeService).notifyChanged(resting.identifier);
    expect(service().aimable()).toEqual([fighting, resting]);
    for (const piece of [fighting, resting, away, unseen]) piece.destroy();
  });

  it('aims at the pieces of the other side from a piece one at a time, nearest first, on and back, each alone', () => {
    const on = (name: string, x: number, side: string) => {
      const one = GameCharacter.create(name, 1, '');
      one.location = { name: 'table', x, y: 0 };
      one.battleSide = side;
      return one;
    };
    const hero = on('勇者', 0, 'left');
    const ally = on('仲間', 50, 'left');
    const near = on('近', 100, 'right');
    const far = on('遠', 300, 'right');

    expect(service().aimNext(hero, 1)).toBe(near);
    expect(service().aimNext(hero, 1)).toBe(far);
    expect(service().aimNext(hero, 1)).toBe(near);
    expect(service().aimNext(hero, -1)).toBe(far);
    expect([hero, ally, near, far].filter((piece) => piece.targeted)).toEqual([far]);
    for (const piece of [hero, ally, near, far]) piece.destroy();
  });

  describe('the order a key aims in', () => {
    const made: GameCharacter[] = [];
    const on = (name: string, x: number, side = '', y = 0) => {
      const one = GameCharacter.create(name, 1, '');
      one.location = { name: 'table', x, y };
      one.battleSide = side;
      made.push(one);
      return one;
    };
    afterEach(() => {
      for (const piece of made.splice(0)) piece.destroy();
    });

    it('takes a part with no side of its own as standing on its body’s side, and passes over the parts of the piece it goes from', () => {
      const hero = on('勇者', 0, 'left');
      const dragon = on('竜', 300, 'right');
      const head = on('頭', 300);
      head.ridingOn = dragon.identifier;
      head.rideSeat = 'part';
      const tail = on('尾', 300);
      tail.ridingOn = dragon.identifier;
      tail.rideSeat = 'part';

      expect(service().aimOrderFrom(hero)).toEqual([dragon, head, tail]);
      expect(service().sideOf(head)).toBe('right');
      expect(service().aimOrderFrom(head)).not.toContain(dragon);
      expect(service().aimOrderFrom(head)).not.toContain(tail);
    });

    it('leaves a part taken out of the lineup out, whatever side its body stands on', () => {
      const dragon = on('竜', 300, 'right');
      const wing = on('翼', 300, 'none');
      wing.ridingOn = dragon.identifier;
      wing.rideSeat = 'part';

      expect(service().sideOf(wing)).toBeNull();
    });

    it('aims from a body on no side at every piece but its own parts, which stand where it stands', () => {
      const golem = on('ゴーレム', 0);
      const arm = on('腕', 0);
      arm.ridingOn = golem.identifier;
      arm.rideSeat = 'part';
      const goblin = on('ゴブリン', 100);

      expect(service().aimOrderFrom(golem)).toEqual([goblin]);
    });

    it('measures a piece on a wall or a board from its middle where that face stands in the room, at the height it stands at', () => {
      const hero = on('勇者', 0, 'left', 0);
      const onFloor = on('床', 300, 'right', 300);
      const onWall = on('壁', 0, 'right', 0);
      const flying = on('空', 0, 'right', 0);
      flying.altitude = 10;
      const dims = { widthPx: 1000, depthPx: 1000, wallHeightPx: 500 };
      const pieces = TestBed.inject(TablePiecesService);
      const footOf = pieces.footOf.bind(pieces);
      vi.spyOn(pieces, 'footOf').mockImplementation((piece) =>
        piece === onWall ? { surface: 'south-wall', x: 0, y: 0, height: 0 } : footOf(piece)
      );
      vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
        surface === 'south-wall' ? surfaceFrame('south-wall', dims) : null
      );

      expect(service().aimOrderFrom(hero)).toEqual([onFloor, flying, onWall]);
    });

    it('aims first at the piece whose middle is nearest, a tall one beside a flying one', () => {
      const hero = on('勇者', 0, 'left');
      hero.altitude = 3;
      const tall = GameCharacter.create('巨人', 6, '');
      tall.location = { name: 'table', x: 25, y: -125 };
      tall.battleSide = 'right';
      made.push(tall);
      const low = on('小さい', 100, 'right');

      expect(service().aimOrderFrom(hero)).toEqual([tall, low]);
    });

    it('passes over the caster of an effect held ready, which it cannot be cast at', () => {
      const hero = on('勇者', 0, 'left');
      const caster = on('術者', 50, 'right');
      const foe = on('敵', 100, 'right');
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'single';
      targeting.begin(preset);
      targeting.setCaster(caster.identifier);

      expect(service().aimOrderFrom(hero)).toEqual([foe]);
      targeting.cancel();
    });

    it('lets go of a piece from what an effect held ready is cast at, leaving an area where it is centred', () => {
      const near = on('近', 100, 'right');
      const next = on('次', 150, 'right');
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      preset.targeting = 'multi';
      preset.areaRadius = 2;
      preset.maxTargets = 5;
      targeting.begin(preset);
      service().setOnly([near]);

      service().letGo(next);

      expect(targeting.epicenter()).toBe(near.identifier);
      expect(targeting.picks()).toContain(near.identifier);
      expect(targeting.picks()).not.toContain(next.identifier);
      expect(next.targeted).toBe(false);
      targeting.cancel();
    });

    it('lets go of a piece aimed at while an effect is held ready though it is none of the picks, as one ticked from the remote', () => {
      const fallen = on('倒れた', 50, 'left');
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      targeting.begin(preset);
      fallen.targeted = true;

      service().letGo(fallen);

      expect(fallen.targeted).toBe(false);
      targeting.cancel();
    });

    it('measures a piece on a board from its middle on the board where the board stands', () => {
      const hero = on('勇者', 0, 'left', 0);
      const onFloor = on('床', 200, 'right', 0);
      const onBoard = on('板', 0, 'right', 0);
      const pieces = TestBed.inject(TablePiecesService);
      const footOf = pieces.footOf.bind(pieces);
      vi.spyOn(pieces, 'footOf').mockImplementation((piece) =>
        piece === onBoard ? { surface: 'board-1', x: 0, y: 0, height: 0 } : footOf(piece)
      );
      vi.spyOn(TestBed.inject(TableSurfaceService), 'frameOf').mockImplementation((surface) =>
        surface === 'board-1'
          ? {
              origin: { x: 210, y: 0, z: 0 },
              u: { x: 1, y: 0, z: 0 },
              v: { x: 0, y: 1, z: 0 },
              normal: { x: 0, y: 0, z: 1 },
            }
          : null
      );

      expect(service().aimOrderFrom(hero)).toEqual([onFloor, onBoard]);
    });

    it('takes the pieces aimed at while an effect is held ready as its picks, the marks following them', () => {
      const hero = on('勇者', 0, 'left');
      const foe = on('敵', 100, 'right');
      const other = on('他', 200, 'right');
      const targeting = TestBed.inject(EffectTargetingService);
      const preset = new EffectPreset();
      preset.initialize();
      targeting.begin(preset);

      service().toggle(foe);
      expect([targeting.picks(), foe.targeted]).toEqual([[foe.identifier], true]);
      service().setOnly([other]);
      expect([targeting.picks(), foe.targeted, other.targeted]).toEqual([[other.identifier], false, true]);
      expect(service().aimNext(hero, 1)).toBe(foe);
      expect(targeting.picks()).toEqual([foe.identifier]);
      targeting.cancel();
    });
  });
});

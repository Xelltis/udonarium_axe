import { DestroyRef, ElementRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import {
  setupInputHandler,
  setupMovableForPiece,
  setupMovableRotableForPiece,
} from '@axe/ui/tabletop/setup-tabletop-piece';

describe('setupMovableForPiece()', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  it('writes nothing while there is no piece', () => {
    const movableOption = signal<MovableOption>({});
    const target = signal<GameCharacter | null>(null);

    TestBed.runInInjectionContext(() => setupMovableForPiece({ movableOption }, { target }));
    TestBed.tick();

    expect(movableOption()).toEqual({});
  });

  it('builds the option from the piece, asking the setup for each part with that piece', () => {
    const movableOption = signal<MovableOption>({});
    const piece = GameCharacter.create('walker', 1, '');
    const target = signal<GameCharacter | null>(piece);

    TestBed.runInInjectionContext(() =>
      setupMovableForPiece(
        { movableOption },
        {
          target,
          collideLayers: ['terrain'],
          layerName: 'character',
          snapStyle: (t) => (t === piece ? GridSnapStyle.GRID : undefined),
          snapOrigin: () => ({ x: 25, y: 25 }),
          snapToSquare: (t, at) => (t === piece ? { x: at.x + 1, y: at.y + 1 } : null),
          footprint: () => ({ width: 50, height: 50 }),
          freeOfGrid: (t) => t === piece,
        }
      )
    );
    TestBed.tick();

    const option = movableOption();
    expect(option.tabletopObject).toBe(piece);
    expect(option.colideLayers).toEqual(['terrain']);
    expect(option.layerName).toBe('character');
    expect(option.snapStyle).toBe(GridSnapStyle.GRID);
    expect(option.snapOrigin).toEqual({ x: 25, y: 25 });
    expect(option.snapToSquare!({ x: 1, y: 2 })).toEqual({ x: 2, y: 3 });
    expect(option.footprint!()).toEqual({ width: 50, height: 50 });
    expect(option.freeOfGrid!()).toBe(true);
  });

  it('takes a snap style given as a value, and leaves out what was not given', () => {
    const movableOption = signal<MovableOption>({});
    const target = signal<GameCharacter | null>(GameCharacter.create('walker', 1, ''));

    TestBed.runInInjectionContext(() =>
      setupMovableForPiece({ movableOption }, { target, snapStyle: GridSnapStyle.CENTER })
    );
    TestBed.tick();

    const option = movableOption();
    expect(option.snapStyle).toBe(GridSnapStyle.CENTER);
    expect(option.colideLayers).toBeUndefined();
    expect(option.snapToSquare).toBeUndefined();
    expect(option.footprint).toBeUndefined();
    expect(option.freeOfGrid).toBeUndefined();
  });
});

describe('setupMovableRotableForPiece()', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  function block(): Terrain {
    return Terrain.create('block', 2, 2, 1, '', '', 'block');
  }

  it('writes both options from the piece, turning it about where the setup says', () => {
    const movableOption = signal<MovableOption>({});
    const rotableOption = signal<RotableOption>({});
    const piece = block();
    const about = { surface: 'floor', x: 50, y: 50, height: 10 };

    TestBed.runInInjectionContext(() =>
      setupMovableRotableForPiece(
        { movableOption, rotableOption },
        { target: signal<Terrain | null>(piece), turnsAbout: () => about }
      )
    );
    TestBed.tick();

    expect(movableOption().tabletopObject).toBe(piece);
    expect(rotableOption().tabletopObject).toBe(piece);
    expect(rotableOption().turnsAbout!()).toBe(about);
  });

  it('turns the piece about where the table says when the setup does not', () => {
    const movableOption = signal<MovableOption>({});
    const rotableOption = signal<RotableOption>({});
    const piece = block();
    const about = { surface: 'floor', x: 75, y: 75, height: 0 };
    const turnAboutOf = vi.spyOn(TestBed.inject(TablePiecesService), 'turnAboutOf').mockReturnValue(about);

    TestBed.runInInjectionContext(() =>
      setupMovableRotableForPiece({ movableOption, rotableOption }, { target: signal<Terrain | null>(piece) })
    );
    TestBed.tick();

    expect(rotableOption().turnsAbout!()).toBe(about);
    expect(turnAboutOf).toHaveBeenCalledWith(piece);
    turnAboutOf.mockRestore();
  });
});

describe('setupInputHandler()', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  it('attaches the handler after the first render, with the callbacks given, and destroys it with the part', () => {
    const element = document.createElement('div');
    const onStart = vi.fn();
    const destroyed: (() => void)[] = [];
    const destroyRef = { onDestroy: (callback: () => void) => (destroyed.push(callback), () => undefined) };

    const ref = TestBed.runInInjectionContext(() =>
      setupInputHandler({ elementRef: new ElementRef(element), destroyRef: destroyRef as DestroyRef, onStart })
    );
    expect(ref.current).toBeNull();

    TestBed.tick();
    const handler = ref.current!;
    expect(handler.target).toBe(element);
    expect(handler.onStart).toBe(onStart);
    expect(handler.onMove).toBeNull();

    for (const callback of destroyed) callback();
    expect(handler.isDestroyed).toBe(true);
    expect(ref.current).toBeNull();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  PieceTurnHandles,
  PieceTurnHandlesHost,
  ringPathOf,
} from '@axe/features/character/game-character/piece-turn-handles';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ringPathOf', () => {
  it('is the whole circle where every point round it is seen', () => {
    expect(ringPathOf([true, true, true, true], 10)).toBe('M10 0 A10 10 0 1 1 10 20 A10 10 0 1 1 10 0');
  });

  it('is each run of points seen, round from where one is not', () => {
    const path = ringPathOf([true, false, true, true], 10);

    expect(path).not.toContain('A');
    expect(path.match(/M/g)).toHaveLength(1);
    expect(path.match(/L/g)).toHaveLength(2);
    expect(ringPathOf([false, false], 10)).toBe('');
  });
});

describe('PieceTurnHandles', () => {
  let character: GameCharacter;
  const canHover = signal(true);
  const touched = signal<string | null>(null);
  const pressed = signal<string | null>(null);

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    character = GameCharacter.create('勇者', 1, '');
    canHover.set(true);
    touched.set(null);
    pressed.set(null);
    Object.defineProperty(TestBed.inject(ViewportService), 'canHover', { value: canHover, configurable: true });
    const selection = TestBed.inject(SelectionSignalService);
    Object.defineProperty(selection, 'touchedObject', { value: touched, configurable: true });
    Object.defineProperty(selection, 'pressedObject', { value: pressed, configurable: true });
    vi.spyOn(TestBed.inject(TablePiecesService), 'footOf').mockReturnValue({
      surface: 'table',
      x: 100,
      y: 200,
      height: 0,
    });
  });

  afterEach(() => {
    character.destroy();
    vi.restoreAllMocks();
  });

  function setup(over: Partial<PieceTurnHandlesHost> = {}) {
    const state = {
      rotate: signal(0),
      roll: signal(0),
      flat: signal(false),
      byRing: signal(false),
      byHandle: signal(false),
    };
    const host: PieceTurnHandlesHost = {
      character: () => character,
      size: () => 1,
      gridSize: () => 50,
      rotate: state.rotate,
      roll: state.roll,
      flat: state.flat,
      hasPicture: () => true,
      hexPedestal: () => null,
      turningByRing: state.byRing,
      tippingByHandle: state.byHandle,
      handleSizePx: () => 28,
      handleGapPx: () => 7,
      ...over,
    };
    return { handles: TestBed.runInInjectionContext(() => new PieceTurnHandles(host)), state };
  }

  /** Has the piece's picture drawn, and stand before the eye as given. */
  function drawPicture(hides: (surface: string, x: number, y: number) => boolean, corner = { x: -1000, y: -1000 }) {
    const pieces = TestBed.inject(TablePiecesService);
    const sprite = { id: `${character.identifier}#picture` };
    Object.defineProperty(pieces, 'sprites', { value: signal([sprite]), configurable: true });
    return vi
      .spyOn(TestBed.inject(TablePickService), 'pictureSightOf')
      .mockReturnValue({ hides, cornerOnPage: () => corner });
  }

  it('stands the handle that tips the piece beside the top right of its picture, clear of it', () => {
    expect(setup().handles.rollHandles()).toEqual([{ testId: 'roll-grab-head', corner: 1, dx: 21, dy: 14 }]);
  });

  it('says which handle is held: the ring, the one that tips, or none', () => {
    const { handles, state } = setup();
    expect(handles.turning()).toBeNull();

    state.byHandle.set(true);
    expect(handles.turning()).toBe('roll');

    state.byRing.set(true);
    expect(handles.turning()).toBe('turn');
  });

  it('takes the piece a finger last pressed as chosen, and any press where the pointer cannot hover', () => {
    const { handles } = setup();
    expect(handles.pressChosen()).toBe(false);

    touched.set(character.identifier);
    expect(handles.pressChosen()).toBe(true);

    touched.set(null);
    pressed.set(character.identifier);
    expect(handles.pressChosen()).toBe(false);

    canHover.set(false);
    expect(handles.pressChosen()).toBe(true);
  });

  it('does not take a piece in hand as chosen', () => {
    const { handles } = setup();
    touched.set(character.identifier);
    const held = TestBed.inject(HeldPieceService);

    held.take({ identifier: character.identifier } as Parameters<HeldPieceService['take']>[0]);

    expect(handles.pressChosen()).toBe(false);
  });

  it('lets the handles take a press where the pointer can hover, and else only those chosen or held', () => {
    const { handles, state } = setup();
    expect(handles.pressable()).toBe(true);

    canHover.set(false);
    expect(handles.pressable()).toBe(false);

    state.byHandle.set(true);
    expect(handles.pressable()).toBe(true);

    state.byHandle.set(false);
    pressed.set(character.identifier);
    expect(handles.pressable()).toBe(true);
  });

  it('draws the ring past a round pedestal, whole while nothing is weighed, with a knob in front and one behind', () => {
    const { handles } = setup();
    const ring = handles.ring();

    expect(ring.radius).toBe(39);
    expect(ring.grab).toEqual({ width: '78px', height: '78px', left: '-14px', top: '-14px', borderRadius: '50%' });
    expect(ring.ring).toEqual(ring.grab);
    expect(ring.arc).toContain('A39 39');
    expect(ring.knobs.map((knob) => knob.facing)).toEqual([true, false]);
    expect(ring.knobs[0].x).toBeCloseTo(25, 6);
    expect(ring.knobs[0].y).toBeCloseTo(-14, 6);
    expect(ring.knobs[1].y).toBeCloseTo(64, 6);
    expect(ring.knobs.every((knob) => knob.seen)).toBe(true);
  });

  it('puts the middle of the ring at the middle of the pedestal on the face it stands on', () => {
    expect(setup().handles.ringMiddle()).toEqual({ surface: 'table', x: 125, y: 225, height: 0 });
    expect(setup({ character: () => null }).handles.ringMiddle()).toBeNull();
  });

  it('leaves what the picture hides out of the ring only while the handles are out', () => {
    const sightOf = drawPicture((_surface, _x, y) => y < 224.5);
    const { handles } = setup();

    expect(handles.ringSeen().every(Boolean)).toBe(true);
    expect(sightOf).not.toHaveBeenCalled();

    handles.hovered.set(true);
    const seen = handles.ringSeen();
    expect(seen[0]).toBe(false);
    expect(seen[24]).toBe(true);
    expect(handles.ring().arc).not.toContain('A');
    expect(handles.ring().knobs.map((knob) => knob.seen)).toEqual([false, true]);
  });

  it('weighs nothing round a piece in hand, though the pointer is over it', () => {
    const sightOf = drawPicture(() => true);
    const { handles } = setup();
    handles.hovered.set(true);
    TestBed.inject(HeldPieceService).take({ identifier: character.identifier } as Parameters<
      HeldPieceService['take']
    >[0]);

    expect(handles.ringSeen().every(Boolean)).toBe(true);
    expect(sightOf).not.toHaveBeenCalled();
  });

  it('lets a knob give way where the handle that tips the piece is drawn, but not while the ring is held', () => {
    drawPicture(() => false, { x: 100, y: 100 });
    vi.spyOn(TestBed.inject(TableSurfaceService), 'pageOf').mockImplementation((_surface, _x, y) =>
      y < 225 ? { x: 121, y: 114 } : { x: 0, y: 300 }
    );
    const { handles, state } = setup();
    handles.hovered.set(true);

    expect(handles.ring().knobs.map((knob) => knob.seen)).toEqual([false, true]);

    state.byRing.set(true);
    expect(handles.ring().knobs.map((knob) => knob.seen)).toEqual([true, true]);

    state.byRing.set(false);
    state.flat.set(true);
    expect(handles.ring().knobs.map((knob) => knob.seen)).toEqual([true, true]);
  });

  it('marks every step a held Alt turns the piece to, staying put as the piece turns', () => {
    const { handles, state } = setup();
    const step = handles.snapStep();
    const before = handles.ticks();
    expect(before).toHaveLength(360 / step);

    state.rotate.set(step);
    const after = handles.ticks();

    expect(after).toHaveLength(before.length);
    expect(after[0].x).toBeCloseTo(before[before.length - 1].x, 6);
    expect(after[0].y).toBeCloseTo(before[before.length - 1].y, 6);
  });

  it('reads the way the piece faces in whole degrees', () => {
    const { handles, state } = setup();
    state.rotate.set(-90);

    expect(handles.angle()).toBe(270);
  });

  it('reads out how far the piece leans either way of upright', () => {
    const { handles, state } = setup();
    expect(handles.rollGauge()).toEqual({ degrees: 0, wedge: '', tip: { x: 10, y: 2.5 } });

    state.roll.set(90);
    expect(handles.rollGauge().degrees).toBe(90);
    expect(handles.rollGauge().wedge).toContain('0 0 1');
    expect(handles.rollGauge().tip.x).toBeCloseTo(17.5, 6);

    state.roll.set(270);
    expect(handles.rollGauge().degrees).toBe(-90);
    expect(handles.rollGauge().wedge).toContain('0 0 0');
  });
});

import { TestBed } from '@angular/core/testing';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { writeModelLook } from '@axe/domain/tabletop/model-look';
import { presetModelLook } from '@axe/domain/tabletop/model-look-presets';
import { lookOf } from '@axe/domain/tabletop/piece-model-setup';
import type { FigureStage, FigureStageView, StageFigure } from '@axe/infrastructure/table-3d/table-3d-port';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelPreviewComponent } from '@axe/ui/components/piece-model-fields/model-preview.component';

describe('ModelPreviewComponent', () => {
  let piece: GameCharacter;
  let shown: { figures: readonly StageFigure[]; view: FigureStageView }[];
  let stage: FigureStage & { arrive(): void; standing: boolean; moving: boolean | null; gone: boolean };
  let module: { createFigureStage: () => Promise<FigureStage | null> } | null;

  beforeEach(async () => {
    shown = [];
    let arrived = () => undefined as void;
    stage = {
      standing: false,
      moving: null,
      gone: false,
      show: (figures, view) => void shown.push({ figures, view }),
      stands: () => stage.standing,
      onArrival: (listener) => (arrived = listener),
      setMoving: (moving) => void (stage.moving = moving),
      picture: () => Promise.resolve(null),
      dispose: () => void (stage.gone = true),
      arrive: () => arrived(),
    };
    module = { createFigureStage: () => Promise.resolve(stage) };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly told: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
        observe(): void {
          this.told([{ contentRect: { width: 220, height: 176 } }]);
        }
        disconnect(): void {
          return undefined;
        }
      }
    );
    await TestBed.configureTestingModule({
      imports: [ModelPreviewComponent],
      providers: [...TEST_PROVIDERS, { provide: EFFECT_STAGE_LOADER, useValue: () => Promise.resolve(module) }],
    }).compileComponents();
    piece = GameCharacter.create('騎士', 1, '');
    piece.modelIdentifier = 'knight';
    piece.modelScale = '3';
    piece.modelTurn = '90';
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockImplementation(
      (identifier) => (identifier === 'knight' ? { isReady: true, url: 'blob:knight' } : null) as never
    );
  });

  afterEach(() => {
    piece.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(ModelPreviewComponent);
    fixture.componentRef.setInput('target', piece);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    await fixture.whenStable();
    await vi.waitFor(() => expect(module === null || shown.length > 0).toBe(true));
    await fixture.whenStable();
    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="model-preview"]')!;
    return { fixture, box, last: () => shown[shown.length - 1] };
  }

  it('stands the piece’s model in the middle of the canvas, fitted to it whatever size and turn the piece gives it', async () => {
    const { last } = await render();

    expect(last().view).toEqual({ front: { width: 220, height: 176 } });
    expect(last().figures).toEqual([
      expect.objectContaining({
        key: piece.identifier,
        url: 'blob:knight',
        at: { x: 110, y: 166, z: 0 },
        widthPx: 200,
        heightPx: 156,
        walking: false,
      }),
    ]);
    expect(last().figures[0].model).toMatchObject({ identifier: 'knight', scale: 1, turnDeg: 0 });
    expect(last().figures[0].act).toBeUndefined();
  });

  it('follows what is changed of the piece’s model at once', async () => {
    const { fixture, last } = await render();

    piece.modelLook = writeModelLook(presetModelLook('gold'));
    TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
    await fixture.whenStable();

    expect(lookOf(last().figures[0].model)).toMatchObject({ metalness: 1, tint: '#ffcf5a' });
  });

  it('has the figure walk and act what it is asked to try', async () => {
    const act = { key: 'tried:1', role: 'attack', atMs: 0 } as const;
    const { last } = await render({ act, walking: true });

    expect(last().figures[0]).toMatchObject({ act, walking: true });
  });

  it('turns the figure as far as asked from the start, and has it speak while its piece does', async () => {
    const { last } = await render({ turned: 18, speaking: true });

    expect(last().figures[0]).toMatchObject({ turnDeg: 18, speaking: true });
  });

  it('turns the figure as it is dragged across', async () => {
    const { fixture, box, last } = await render();
    const canvas = box.querySelector('canvas')!;
    const before = last().figures[0].turnDeg;

    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100 }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }));
    canvas.dispatchEvent(new MouseEvent('pointerup'));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 300 }));
    await fixture.whenStable();

    expect(last().figures[0].turnDeg).toBe(before + 40);
  });

  it('shown bare, fills what holds it with no frame, says nothing while the model comes, and is not turned by a drag', async () => {
    const { fixture, box, last } = await render({ bare: true, turnable: false });
    const canvas = box.querySelector('canvas')!;
    const before = last().figures[0].turnDeg;

    canvas.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100 }));
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 150 }));
    await fixture.whenStable();

    expect(last().figures[0].turnDeg).toBe(before);
    expect(box.classList.contains('size-full')).toBe(true);
    expect(box.textContent?.trim()).toBe('');
  });

  it('says the model is coming until it stands, and shows it from then', async () => {
    const { fixture, box } = await render();
    expect(box.dataset['state']).toBe('loading');

    stage.standing = true;
    stage.arrive();
    await fixture.whenStable();

    expect(box.dataset['state']).toBe('shown');
    expect(box.textContent?.trim()).toBe('');
  });

  it('stands nothing for a piece that names no model held here', async () => {
    piece.modelIdentifier = 'missing';
    const { last, box } = await render();

    expect(last().figures).toEqual([]);
    expect(box.dataset['state']).toBe('loading');
  });

  it('moves the figure only for a reader who lets things move', async () => {
    const motion = TestBed.inject(MotionService);
    motion.setting.set('on');
    const { fixture } = await render();
    expect(stage.moving).toBe(true);

    motion.setting.set('off');
    await fixture.whenStable();
    expect(stage.moving).toBe(false);
  });

  it('says so where nothing can draw the model, and lets go of the stage with the preview', async () => {
    const drawn = await render();
    drawn.fixture.destroy();
    expect(stage.gone).toBe(true);

    module = null;
    const undrawn = await render();
    await vi.waitFor(() => expect(undrawn.box.dataset['state']).toBe('failed'));
  });
});

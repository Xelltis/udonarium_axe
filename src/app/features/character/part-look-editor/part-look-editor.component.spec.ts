import { TestBed } from '@angular/core/testing';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { maskCovers, partFacesOf, partLayerOf, partMaskOf, writePartLayer } from '@axe/domain/character/part-look';
import { PartLookEditorComponent } from '@axe/features/character/part-look-editor/part-look-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** What the stage a body's model is painted on is made by, in each test. */
let viewer: { createModelStage: () => unknown; createModelPainter: () => null } | null = null;

describe('PartLookEditorComponent', () => {
  let dragon: GameCharacter;
  let head: GameCharacter;
  let tail: GameCharacter;

  function picture(identifier: string): string {
    ImageStorage.instance.add({
      identifier,
      name: `${identifier}.png`,
      type: 'image/png',
      blob: null,
      url: `blob:${identifier}`,
      thumbnail: { type: '', blob: null, url: '' },
    });
    return identifier;
  }

  function partOf(name: string): GameCharacter {
    const part = GameCharacter.create(name, 1, picture(name));
    part.setLocation('table');
    part.ridingOn = dragon.identifier;
    part.rideSeat = 'part';
    return part;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PartLookEditorComponent],
      providers: [...TEST_PROVIDERS, { provide: MODEL_VIEWER_LOADER, useValue: async () => viewer }],
    });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    dragon = GameCharacter.create('ドラゴン', 2, picture('dragon'));
    dragon.setLocation('table');
    head = partOf('head');
    tail = partOf('tail');
  });

  afterEach(() => {
    viewer = null;
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    for (const identifier of ['dragon', 'head', 'tail']) ImageStorage.instance.delete(identifier);
  });

  function open(part = '') {
    const fixture = TestBed.createComponent(PartLookEditorComponent);
    fixture.componentInstance.bodyIdentifier.set(dragon.identifier);
    if (part) fixture.componentInstance.partIdentifier.set(part);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const stage = root.querySelector<HTMLElement>('[data-testid="part-look-stage"]')!;
    vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
    } as DOMRect);
    const changed = () => {
      for (const piece of [dragon, head, tail]) TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
      fixture.detectChanges();
    };
    return { fixture, root, changed };
  }

  function pointer(type: string, x: number, y: number): PointerEvent {
    return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1 });
  }

  it('lists the body’s parts and lays the one chosen over the body’s picture, sized and set forward or back', () => {
    const { root, changed } = open(tail.identifier);

    expect([...root.querySelectorAll('[data-testid="part-look-part"]')].map((one) => one.textContent?.trim())).toEqual([
      'head',
      'tail',
    ]);
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-lay"]')!.click();
    expect(partLayerOf(tail.partLayer)).toEqual({ x: 0.5, y: 0.5, width: 0.5, order: 1 });
    expect(head.partLayer).toBe('');
    changed();

    const size = root.querySelector<HTMLInputElement>('[data-testid="part-look-size"]')!;
    size.value = '0.25';
    size.dispatchEvent(new Event('change'));
    changed();
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-back"]')!.click();
    expect(partLayerOf(tail.partLayer)).toEqual({ x: 0.5, y: 0.5, width: 0.25, order: -1 });
  });

  it('moves the chosen part’s picture where it is dragged, keeping it as it is let go of', () => {
    tail.partLayer = writePartLayer({ x: 0.5, y: 0.5, width: 0.2, order: 1 });
    const { root } = open(tail.identifier);
    const layer = root.querySelector<HTMLElement>('[data-testid="part-look-layer"]')!;

    layer.dispatchEvent(pointer('pointerdown', 100, 50));
    layer.dispatchEvent(pointer('pointermove', 140, 30));
    expect(partLayerOf(tail.partLayer)?.x).toBe(0.5);
    layer.dispatchEvent(pointer('pointerup', 140, 30));

    expect(partLayerOf(tail.partLayer)).toMatchObject({ x: 0.7, y: 0.3 });
  });

  it('paints the chosen part’s piece of the body’s picture, and wipes it off', () => {
    const { root, fixture } = open(head.identifier);
    root.querySelector<HTMLButtonElement>('[data-testid="part-look-mode-paint"]')!.click();
    fixture.detectChanges();
    const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="part-look-paint-layer"]')!;

    canvas.dispatchEvent(pointer('pointerdown', 50, 50));
    canvas.dispatchEvent(pointer('pointermove', 60, 50));
    canvas.dispatchEvent(pointer('pointerup', 60, 50));
    const painted = partMaskOf(head.partMask)!;
    expect(maskCovers(painted, 0.25, 0.5)).toBe(true);
    expect(maskCovers(painted, 0.9, 0.5)).toBe(false);

    root.querySelector<HTMLButtonElement>('[data-testid="part-look-clear"]')!.click();
    expect(head.partMask).toBe('');

    const snackbar = TestBed.inject(SnackbarService);
    expect(snackbar.current()?.message).toContain('head');
    snackbar.runAction();
    expect(partMaskOf(head.partMask)).toEqual(painted);
  });

  it('offers to put a part’s picture back over the body once it is no longer laid over it', () => {
    tail.partLayer = writePartLayer({ x: 0.5, y: 0.5, width: 0.2, order: 1 });
    const { root } = open(tail.identifier);

    root.querySelector<HTMLButtonElement>('[data-testid="part-look-unlay"]')!.click();
    expect(tail.partLayer).toBe('');
    TestBed.inject(SnackbarService).runAction();

    expect(partLayerOf(tail.partLayer)).toEqual({ x: 0.5, y: 0.5, width: 0.2, order: 1 });
  });

  describe('on a body drawn as a model', () => {
    let shown: { chosen: ReadonlyMap<number, ReadonlySet<number>> }[];

    beforeEach(() => {
      shown = [];
      const stage = {
        show: async () => true,
        turnBy: vi.fn(),
        setTurning: vi.fn(),
        resize: () => undefined,
        facesNear: () =>
          new Map([
            [0, [3, 4]],
            [1, [0]],
          ]),
        showFaces: (chosen: ReadonlyMap<number, ReadonlySet<number>>) => shown.push({ chosen }),
        dispose: vi.fn(),
      };
      viewer = { createModelStage: () => stage, createModelPainter: () => null };
      dragon.modelIdentifier = 'dragon-model';
      vi.spyOn(TestBed.inject(TablePiecesService), 'modelUrlOf').mockReturnValue('blob:dragon-model');
    });

    it('offers to paint the model’s faces, painting them for the part chosen and wiping them off', async () => {
      const { root, fixture } = open(head.identifier);
      root.querySelector<HTMLButtonElement>('[data-testid="part-look-mode-faces"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="part-look-model"]')!;

      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0, clientX: 5, clientY: 5 }));
      expect(partFacesOf(head.partFaces)).toEqual(
        new Map([
          [0, new Set([3, 4])],
          [1, new Set([0])],
        ])
      );
      expect(shown.length).toBeGreaterThan(0);

      root.querySelector<HTMLButtonElement>('[data-testid="part-look-clear"]')!.click();
      expect(head.partFaces).toBe('');
    });

    it('turns the model with two fingers, taking back what the first had begun to paint', async () => {
      const { root, fixture } = open(head.identifier);
      root.querySelector<HTMLButtonElement>('[data-testid="part-look-mode-faces"]')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      const canvas = root.querySelector<HTMLCanvasElement>('[data-testid="part-look-model"]')!;
      const finger = (type: string, pointerId: number, x: number) =>
        canvas.dispatchEvent(
          new PointerEvent(type, { bubbles: true, button: 0, pointerId, pointerType: 'touch', clientX: x, clientY: 5 })
        );
      const stage = await (viewer!.createModelStage() as Promise<{ turnBy: ReturnType<typeof vi.fn> }>);

      finger('pointerdown', 1, 10);
      finger('pointerdown', 2, 30);
      finger('pointermove', 2, 50);
      finger('pointerup', 1, 10);
      finger('pointermove', 2, 52);
      finger('pointerup', 2, 52);

      expect(stage.turnBy.mock.calls).toEqual([
        [10, 0],
        [2, 0],
      ]);
      expect(head.partFaces).toBe('');
    });

    it('lets go of a stage still loading the model as the painting of faces is left or the editor closed', async () => {
      const made: { dispose: ReturnType<typeof vi.fn>; shown: () => void }[] = [];
      viewer = {
        createModelStage: () => {
          let shown = () => undefined as void;
          const stage = {
            show: () => new Promise<boolean>((resolve) => (shown = () => resolve(true))),
            turnBy: vi.fn(),
            setTurning: vi.fn(),
            resize: () => undefined,
            facesNear: () => new Map(),
            showFaces: vi.fn(),
            dispose: vi.fn(),
          };
          made.push({ dispose: stage.dispose, shown: () => shown() });
          return stage;
        },
        createModelPainter: () => null,
      };
      const settle = async () => {
        await new Promise((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      };
      const { root, fixture } = open(head.identifier);
      const mode = (name: string) => {
        root.querySelector<HTMLButtonElement>(`[data-testid="part-look-mode-${name}"]`)!.click();
        fixture.detectChanges();
      };

      mode('faces');
      await settle();
      expect(made).toHaveLength(1);
      mode('layer');
      await settle();
      made[0].shown();
      await settle();
      expect(made[0].dispose).toHaveBeenCalled();

      mode('faces');
      await settle();
      expect(made).toHaveLength(2);
      fixture.destroy();
      expect(made[1].dispose).toHaveBeenCalled();
    });

    it('offers no model to paint for a body drawn as its picture', () => {
      vi.spyOn(TestBed.inject(TablePiecesService), 'modelUrlOf').mockReturnValue('');
      dragon.modelIdentifier = '';
      const { root } = open();
      expect(root.querySelector('[data-testid="part-look-mode-faces"]')).toBeNull();
    });
  });
});

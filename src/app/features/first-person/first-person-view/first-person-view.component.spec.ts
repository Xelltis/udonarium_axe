import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { effectBlowsOf } from '@axe/domain/effect/effect-blows';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, cellCount, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { FirstPersonLookService, LOOK_RETURN_MS } from '@axe/features/first-person/first-person-look.service';
import { scaleOf } from '@axe/features/first-person/first-person-style';
import { FirstPersonViewComponent } from '@axe/features/first-person/first-person-view/first-person-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MAX_MULTI_ANGLE_RESOURCE_GAUGES } from '@axe/ui/tabletop/multi-angle-orbit-decoration';
import { vi } from 'vitest';

const GRID = 50;

describe('FirstPersonViewComponent', () => {
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FirstPersonViewComponent], providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mount(): ComponentFixture<FirstPersonViewComponent> {
    const fixture = TestBed.createComponent(FirstPersonViewComponent);
    fixture.detectChanges();
    return fixture;
  }

  function element(fixture: ComponentFixture<FirstPersonViewComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function pieceAt(col: number, row: number, rotate = 0): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.rotate = rotate;
    return character;
  }

  function lookOutOf(piece: GameCharacter): void {
    TestBed.inject(FirstPersonService).enterSeat(piece.identifier);
  }

  describe('looking about', () => {
    function lookOf(fixture: ComponentFixture<FirstPersonViewComponent>): FirstPersonLookService {
      return fixture.debugElement.injector.get(FirstPersonLookService);
    }

    function cameraOf(fixture: ComponentFixture<FirstPersonViewComponent>): string {
      return element(fixture).querySelector<HTMLElement>('[data-testid="first-person-camera"]')!.style.transform;
    }

    it('turns the compass needle with the look and leaves the facing as the piece faces', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();

      lookOf(fixture).lookTo({ yaw: 90, pitch: 0 });
      fixture.detectChanges();

      const needle = element(fixture)
        .querySelector('[data-testid="first-person-compass"] g')
        ?.getAttribute('transform');
      expect(needle).toBe('rotate(-90)');
      expect(element(fixture).querySelector('[data-facing]')?.getAttribute('data-facing')).toBe('north');
    });

    it('tips the effects to face the camera as it looks up', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();

      lookOf(fixture).lookTo({ yaw: 0, pitch: 20 });
      fixture.detectChanges();

      const eye = (fixture.componentInstance as unknown as { effectEye(): { rotation: { x: number } } }).effectEye();
      expect(eye.rotation.x).toBe(110);
    });

    it('goes back to where the piece faces when brought back, at once with motion turned down', () => {
      TestBed.inject(MotionService).setting.set('off');
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const level = cameraOf(fixture);
      lookOf(fixture).lookTo({ yaw: 45, pitch: -30 });
      fixture.detectChanges();

      lookOf(fixture).release();
      fixture.detectChanges();

      expect(cameraOf(fixture)).toBe(level);
    });

    it('eases back over a moment where motion is on, and lands where the piece faces', () => {
      TestBed.inject(MotionService).setting.set('on');
      const frames: FrameRequestCallback[] = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const look = lookOf(fixture);
      look.lookTo({ yaw: 90, pitch: 40 });

      const queued = frames.length;
      look.release();
      frames[queued](performance.now() + LOOK_RETURN_MS / 2);
      const halfway = look.look();
      frames[queued + 1](performance.now() + LOOK_RETURN_MS * 2);

      expect(halfway.yaw).toBeGreaterThan(0);
      expect(halfway.yaw).toBeLessThan(90);
      expect(look.look()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('lays a piece behind the eye on the view once the eye turns round to it', () => {
      ImageStorage.instance.add({
        identifier: 'far-face',
        name: 'far-face.png',
        type: 'image/png',
        blob: null,
        url: 'blob:far-face',
        thumbnail: { type: '', blob: null, url: '' },
      });
      try {
        const behind = GameCharacter.create('後ろの敵', 1, 'far-face');
        behind.location = { name: 'table', x: 4 * GRID, y: 10 * GRID };
        lookOutOf(pieceAt(4, 1));
        const fixture = mount();

        const laid = () => element(fixture).querySelector(`[data-piece="${behind.identifier}"]`);
        expect(laid()).toBeNull();

        lookOf(fixture).lookTo({ yaw: 180, pitch: 0 });
        fixture.detectChanges();

        expect(laid()).not.toBeNull();
      } finally {
        ImageStorage.instance.delete('far-face');
      }
    });

    it('stands the readings of a great piece over its head again as the eye looks up at it', () => {
      const giant = GameCharacter.create('巨人', 3, '');
      giant.location = { name: 'table', x: 3 * GRID, y: 4 * GRID };
      lookOutOf(pieceAt(4, 8));
      const fixture = mount();
      const chromeOf = () =>
        element(fixture).querySelector<HTMLElement>(
          `[data-piece="${giant.identifier}"] [data-testid="first-person-piece-chrome"]`
        )!;
      expect(parseFloat(chromeOf().style.bottom)).toBeLessThan(100);

      lookOf(fixture).lookTo({ yaw: 0, pitch: 60 });
      fixture.detectChanges();

      expect(chromeOf().style.bottom).toBe('100%');
    });

    it('cuts a great piece from below once the eye looks steeply up at it', () => {
      const giant = GameCharacter.create('巨竜', 5, '');
      giant.location = { name: 'table', x: 2 * GRID, y: 2 * GRID };
      lookOutOf(pieceAt(4, 8));
      const fixture = mount();

      lookOf(fixture).lookTo({ yaw: 0, pitch: 85 });
      fixture.detectChanges();

      const billboard = element(fixture).querySelector<HTMLElement>(`[data-piece="${giant.identifier}"]`)!;
      expect(billboard.style.clipPath).toMatch(/^inset\(-400% -100% [\d.]+% -100%\)$/);
    });
  });

  describe('dragging the view about', () => {
    function lookOf(fixture: ComponentFixture<FirstPersonViewComponent>): FirstPersonLookService {
      return fixture.debugElement.injector.get(FirstPersonLookService);
    }

    function sceneOf(fixture: ComponentFixture<FirstPersonViewComponent>): HTMLElement {
      return element(fixture).querySelector<HTMLElement>('[data-testid="first-person-scene"]')!;
    }

    function pointer(
      target: Element,
      type: string,
      x: number,
      y: number,
      buttons = type === 'pointerup' ? 0 : 1
    ): void {
      target.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          isPrimary: true,
          pointerType: 'mouse',
          button: 0,
          buttons,
          clientX: x,
          clientY: y,
          bubbles: true,
        })
      );
    }

    beforeEach(() => {
      TestBed.inject(MotionService).setting.set('off');
    });

    it('leaves the view alone for a press that moves less than a click might', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();

      pointer(sceneOf(fixture), 'pointerdown', 100, 100);
      pointer(sceneOf(fixture), 'pointermove', 105, 100);

      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('turns towards where the pointer goes and looks up as it goes up, no further than 85°', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);

      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 220, 400);
      expect(lookOf(fixture).look().yaw).toBeGreaterThan(0);

      pointer(scene, 'pointermove', 220, 300);
      expect(lookOf(fixture).look().pitch).toBeGreaterThan(0);

      pointer(scene, 'pointermove', 220, -5000);
      expect(lookOf(fixture).look().pitch).toBe(85);
    });

    it('stays where the drag left it once let go', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);

      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 300, 300);
      const dragged = lookOf(fixture).look();
      pointer(scene, 'pointerup', 300, 300);

      expect(dragged.pitch).toBeGreaterThan(0);
      expect(lookOf(fixture).look()).toEqual(dragged);
      expect(lookOf(fixture).dragging()).toBe(false);
    });

    it('goes back to where the piece faces once the piece steps after the drag is let go', async () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 300, 300);
      pointer(scene, 'pointerup', 300, 300);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(piece.location.y).toBe(6 * GRID);
      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('goes back to where the piece faces once the piece turns after the drag is let go', async () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 300, 300);
      pointer(scene, 'pointerup', 300, 300);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(piece.rotate).toBe(90);
      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
    });

    it('brings a look left away back ahead with escape, and leaves the view with the next', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);
      const escape = () =>
        document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 300, 300);
      pointer(scene, 'pointerup', 300, 300);

      escape();

      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
      expect(TestBed.inject(FirstPersonService).piece()).not.toBeNull();

      fixture.detectChanges();
      escape();

      expect(TestBed.inject(FirstPersonService).piece()).toBeNull();
    });

    it('aims at nothing with the click that ends a drag, and still aims with a click', () => {
      const enemy = pieceAt(4, 4);
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const billboard = () => element(fixture).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      pointer(billboard(), 'pointerdown', 300, 300);
      pointer(billboard(), 'pointermove', 350, 300);
      pointer(billboard(), 'pointerup', 350, 300);
      billboard().click();
      expect(enemy.targeted).toBe(false);

      fixture.detectChanges();
      pointer(billboard(), 'pointerdown', 300, 300);
      pointer(billboard(), 'pointerup', 300, 300);
      billboard().click();
      expect(enemy.targeted).toBe(true);
    });

    it('aims straight ahead with T after a drag let go off any piece', () => {
      const enemy = pieceAt(4, 4);
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 700);
      pointer(scene, 'pointermove', 300, 700);
      pointer(scene, 'pointerup', 300, 700);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true, cancelable: true }));

      expect(enemy.targeted).toBe(true);
    });

    it('ends a drag with escape and keeps the view open', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 300, 400);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));

      expect(lookOf(fixture).dragging()).toBe(false);
      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
      expect(TestBed.inject(FirstPersonService).piece()).not.toBeNull();
    });

    it('walks with W while the view is dragged about', async () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 400);
      pointer(scene, 'pointermove', 120, 400);
      pointer(scene, 'pointermove', 300, 400);

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
      await fixture.whenStable();

      expect(piece.location.y).toBe(6 * GRID);
      expect(lookOf(fixture).dragging()).toBe(true);
      expect(lookOf(fixture).look().yaw).toBeGreaterThan(0);
    });

    it('takes a drag of one finger for itself rather than letting the page scroll', () => {
      lookOutOf(pieceAt(4, 7));

      expect(sceneOf(mount()).classList).toContain('touch-none');
    });

    it('forgets a press let go off the view, so a pointer passing over it later turns nothing', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);
      pointer(scene, 'pointerdown', 100, 400);

      pointer(scene, 'pointermove', 300, 400, 0);
      pointer(scene, 'pointermove', 400, 400, 0);

      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
      expect(lookOf(fixture).dragging()).toBe(false);
    });

    it('goes on turning the view for a pointer the page cannot hold on to', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const scene = sceneOf(fixture);
      vi.spyOn(scene, 'setPointerCapture').mockImplementation(() => {
        throw new DOMException('No active pointer with the given id is found.', 'NotFoundError');
      });
      const at = (x: number) =>
        ({
          pointerId: 7,
          isPrimary: true,
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX: x,
          clientY: 400,
          target: scene,
          currentTarget: scene,
        }) as unknown as PointerEvent;
      const look = lookOf(fixture);
      look.press(at(100));

      expect(() => look.drag(at(120), 0.1)).not.toThrow();
      look.drag(at(220), 0.1);

      expect(look.dragging()).toBe(true);
      expect(look.look().yaw).toBeCloseTo(10);
    });

    it('leaves a press on the controls to them', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const button = element(fixture).querySelector<HTMLElement>('[data-turn="right"]')!;

      pointer(button, 'pointerdown', 100, 400);
      pointer(sceneOf(fixture), 'pointermove', 300, 400);

      expect(lookOf(fixture).look()).toEqual({ yaw: 0, pitch: 0 });
    });
  });

  it('tells beside the controls every key it answers to', () => {
    lookOutOf(pieceAt(4, 5));
    const fixture = mount();

    const hint = element(fixture).querySelector('[data-testid="first-person-keys-hint"]')?.textContent ?? '';
    for (const keys of ['WASD', '↑↓', 'Q/E・←→', 'Space', 'F で明かり', 'T でターゲット', 'Shift+T']) {
      expect(hint).toContain(keys);
    }
  });

  it('tells the keys of a hex grid on a hex grid', () => {
    table.gridType = GridType.HEX_VERTICAL;
    lookOutOf(pieceAt(4, 5));
    const fixture = mount();

    const hint = element(fixture).querySelector('[data-testid="first-person-keys-hint"]')?.textContent ?? '';
    for (const keys of ['W/S・↑↓', 'A/D', 'Z/C', 'Q/E・←→', 'Space', 'F で明かり', 'T でターゲット', 'Shift+T']) {
      expect(hint).toContain(keys);
    }
  });

  it('names the way the piece faces', () => {
    lookOutOf(pieceAt(4, 7, 90));

    expect(element(mount()).querySelector('[data-facing]')?.getAttribute('data-facing')).toBe('east');
  });

  it('walks forward when W is pressed', async () => {
    const piece = pieceAt(4, 7);
    lookOutOf(piece);
    mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));

    await vi.waitFor(() => expect(piece.location.y).toBe(6 * GRID));
  });

  it('leaves W alone while something is being typed', async () => {
    const piece = pieceAt(4, 7);
    lookOutOf(piece);
    mount();
    const field = document.createElement('input');
    document.body.appendChild(field);

    field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true, cancelable: true }));
    await new Promise((rest) => setTimeout(rest, 150));

    expect(piece.location.y).toBe(7 * GRID);
    field.remove();
  });

  it('walks from the pad', async () => {
    const piece = pieceAt(4, 7, 90);
    lookOutOf(piece);
    const view = element(mount());

    view.querySelector<HTMLButtonElement>('[data-move="forward"]')!.click();

    await vi.waitFor(() => expect(piece.location.x).toBe(5 * GRID));
  });

  it('goes back to the table from the button', () => {
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());

    view.querySelector<HTMLButtonElement>('[data-testid="first-person-exit"]')!.click();

    expect(TestBed.inject(FirstPersonService).showing()).toBe(false);
  });

  it('shows who put everyone in the view, in place of the way out', () => {
    const master = new PeerCursor();
    master.initialize();
    master.role = PeerRole.GameMaster;
    const piece = pieceAt(4, 7);
    table.sharedViewPiece = piece.identifier;
    TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);

    const view = element(mount());

    expect(view.querySelector('[data-testid="first-person-shared"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="first-person-exit"]')).toBeNull();
  });

  it('lets the weather of the room fall over the view as well', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('table-weather-overlay')).not.toBeNull();
  });

  it('keeps a map of the ground about the piece in the corner', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('[data-testid="first-person-minimap"]')).not.toBeNull();
  });

  it('marks the piece it is looking at when it is clicked, and takes the mark off again', () => {
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7));
    const fixture = mount();
    const billboard = () => element(fixture).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    billboard().click();
    expect(enemy.targeted).toBe(true);

    fixture.detectChanges();
    billboard().click();
    expect(enemy.targeted).toBe(false);
  });

  it('aims at the piece straight ahead with T, and lets it go with shift and T', () => {
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7));
    mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true, cancelable: true }));
    expect(enemy.targeted).toBe(true);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyT', shiftKey: true, bubbles: true, cancelable: true })
    );
    expect(enemy.targeted).toBe(false);
  });

  it('keeps back the name of a piece that hides it, in the picture, the stand-in and the controls', () => {
    const viewer = pieceAt(4, 7);
    viewer.name = '影の主';
    viewer.hideName = true;
    const enemy = pieceAt(4, 4);
    enemy.name = '名無しの敵';
    enemy.hideName = true;
    lookOutOf(viewer);

    const view = element(mount());

    expect(view.textContent).not.toContain('名無しの敵');
    expect(view.textContent).not.toContain('影の主');
    expect(view.querySelector(`[data-piece="${enemy.identifier}"] img`)?.getAttribute('alt') ?? '').toBe('');
  });

  it('shows the master the names pieces hide from everyone else', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    const viewer = pieceAt(4, 7);
    viewer.name = '影の主';
    viewer.hideName = true;
    lookOutOf(viewer);

    expect(element(mount()).querySelector('[data-testid="first-person-name"]')?.textContent).toContain('影の主');
  });

  it('leaves a key alone that something else on the page has already taken', () => {
    lookOutOf(pieceAt(4, 7));
    mount();
    const takeIt = (event: Event) => event.preventDefault();
    document.addEventListener('keydown', takeIt, true);

    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));
    } finally {
      document.removeEventListener('keydown', takeIt, true);
    }

    expect(TestBed.inject(FirstPersonService).showing()).toBe(true);
  });

  it('does not aim with T at a piece a wall hides', () => {
    const wall = Terrain.create('壁', 3, 1, 2, 'stone', 'slab');
    wall.location = { name: 'table', x: 3 * GRID, y: 5 * GRID };
    table.appendChild(wall);
    const hidden = pieceAt(4, 3);
    lookOutOf(pieceAt(4, 7));
    mount();

    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyT', bubbles: true, cancelable: true }));

    expect(hidden.targeted).toBe(false);
  });

  it('shakes the view as it would the table, as the blow lands', () => {
    vi.useFakeTimers();
    const preset = new EffectPreset();
    preset.kind = 'nova';
    preset.grade = 3;
    preset.durationMs = 5000;
    ObjectStore.instance.add(preset, false);
    lookOutOf(pieceAt(4, 7));
    const fixture = mount();

    TestBed.inject(EffectPlaybackService).play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'somewhere', x: 0, y: 0, z: 0 }],
      seed: 3,
    });
    vi.advanceTimersByTime(effectBlowsOf(preset)[0].atMs);
    fixture.detectChanges();

    expect(element(fixture).querySelector('.animate-effect-shake-hard')).not.toBeNull();
    ObjectStore.instance.remove(preset);
    vi.useRealTimers();
  });

  it('fires at what is aimed at with enter, and gives the aiming up with escape', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    const preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 5000;
    ObjectStore.instance.add(preset, false);
    const enemy = pieceAt(4, 4);
    enemy.targeted = true;
    lookOutOf(pieceAt(4, 7));
    mount();
    const targeting = TestBed.inject(EffectTargetingService);
    const fire = vi.spyOn(TestBed.inject(EffectCastService), 'fire');

    targeting.begin(preset);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true, cancelable: true }));

    expect(targeting.isPicking()).toBe(false);
    expect(TestBed.inject(FirstPersonService).showing()).toBe(true);

    targeting.begin(preset);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }));

    expect(targeting.isPicking()).toBe(false);
    expect(fire).toHaveBeenCalledWith(preset, [enemy], expect.anything());
    ObjectStore.instance.remove(preset);
  });

  it('keeps the controls out of the middle of the foot of the view, where the hotbar sits', () => {
    lookOutOf(pieceAt(4, 7));

    const controls = element(mount()).querySelector<HTMLElement>('[data-testid="first-person-controls"]')!;

    expect(controls.className).toContain('left-16');
    expect(controls.className).toContain('max-w-[calc(100%-16rem)]');
    expect(controls.className).not.toContain('inset-x-0');
    expect(controls.className).not.toContain('items-center');
  });

  it('lets the controls reach the corner of the mobile shell, where no rail of buttons stands beside them', () => {
    const mobile = TestBed.inject(MobileLayoutService);
    mobile.prefersDesktop.set(false);
    Object.defineProperty(mobile, 'isActive', { value: () => true, configurable: true });
    lookOutOf(pieceAt(4, 7));

    const controls = element(mount()).querySelector<HTMLElement>('[data-testid="first-person-controls"]')!;

    expect(controls.className).toContain('left-0');
    expect(controls.className).toContain('max-w-full');
    expect(controls.className).not.toContain('left-16');
  });

  it('keeps the compass and the map in the view on a narrow screen, out of the way at the top', () => {
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());

    for (const testId of ['first-person-compass', 'first-person-minimap']) {
      const widget = view.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!;
      expect(widget.className).not.toContain('hidden');
      expect(widget.className).toContain('right-2');
    }
  });

  it('hangs the bars of a piece it can see under its name', () => {
    const enemy = pieceAt(4, 4);
    enemy.detailDataElement!.getFirstElementByName('HP')!.currentValue = 3;
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;
    const gauges = billboard.querySelectorAll<HTMLElement>('[data-testid="first-person-gauge"]');

    expect(gauges.length).toBeGreaterThan(0);
    expect(gauges[0].textContent).toContain('3/');
  });

  it('keeps back the readings of a piece that is not the reader to look at', () => {
    const enemy = pieceAt(4, 4);
    enemy.owner = 'somebody-else';
    enemy.disclosureMode = DisclosureMode.GameMaster;
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-gauge"]')?.textContent).toContain('???/???');
    const bar = billboard.querySelector<HTMLElement>('[data-testid="first-person-gauge"] .relative > span')!;
    expect(bar.style.background).toContain('repeating-linear-gradient');
  });

  it('draws a piece on the next cell at its own size, to grow as the eye sees it come near', () => {
    const near = pieceAt(4, 6);
    const far = pieceAt(4, 3);
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());
    const billboardOf = (piece: GameCharacter) =>
      view.querySelector<HTMLElement>(`[data-piece="${piece.identifier}"]`)!;
    const heightOf = (piece: GameCharacter) => parseFloat(billboardOf(piece).style.height);

    expect(heightOf(far)).toBeCloseTo(GRID * scaleOf(GRID), 1);
    expect(heightOf(near)).toBeCloseTo(heightOf(far), 1);
  });

  describe('a piece at the table\u2019s own scale', () => {
    function pictureLoaded(
      fixture: ComponentFixture<FirstPersonViewComponent>,
      piece: GameCharacter,
      w: number,
      h: number
    ) {
      const loaded = { target: { naturalWidth: w, naturalHeight: h } } as unknown as Event;
      (
        fixture.componentInstance as unknown as { notePictureAspect(url: string, event: Event): void }
      ).notePictureAspect(piece.imageFile.url, loaded);
      fixture.detectChanges();
    }

    function boxOf(fixture: ComponentFixture<FirstPersonViewComponent>, piece: GameCharacter) {
      const billboard = element(fixture).querySelector<HTMLElement>(`[data-piece="${piece.identifier}"]`)!;
      return { width: parseFloat(billboard.style.width), height: parseFloat(billboard.style.height) };
    }

    it('stands a great piece as wide as its ground and as tall as its picture', () => {
      const giant = GameCharacter.create('巨竜', 3, '');
      giant.location = { name: 'table', x: 3 * GRID, y: 0 };
      lookOutOf(pieceAt(4, 8));
      const fixture = mount();

      pictureLoaded(fixture, giant, 100, 200);

      expect(boxOf(fixture, giant).width).toBeCloseTo(3 * GRID * scaleOf(GRID), 1);
      expect(boxOf(fixture, giant).height).toBeCloseTo(6 * GRID * scaleOf(GRID), 1);
    });

    it('stands a picture given a height of its own that tall', () => {
      const tall = GameCharacter.create('塔', 1, '');
      tall.location = { name: 'table', x: 4 * GRID, y: 3 * GRID };
      tall.specifyKomaImageFlag = true;
      tall.komaImageHeight = 120;
      lookOutOf(pieceAt(4, 8));
      const fixture = mount();

      pictureLoaded(fixture, tall, 100, 200);

      expect(boxOf(fixture, tall).height).toBeCloseTo(120 * scaleOf(GRID), 1);
      expect(boxOf(fixture, tall).width).toBeCloseTo(60 * scaleOf(GRID), 1);
    });

    it('stands a picture given a width apart from its height that wide, filling its box out of proportion', () => {
      ImageStorage.instance.add('stretched-picture');
      const wide = GameCharacter.create('幕', 1, 'stretched-picture');
      wide.location = { name: 'table', x: 4 * GRID, y: 3 * GRID };
      wide.specifyKomaImageFlag = true;
      wide.komaImageHeight = 120;
      wide.komaImageWidth = 200;
      lookOutOf(pieceAt(4, 8));

      try {
        const fixture = mount();
        pictureLoaded(fixture, wide, 100, 200);

        expect(boxOf(fixture, wide).width).toBeCloseTo(200 * scaleOf(GRID), 1);
        expect(boxOf(fixture, wide).height).toBeCloseTo(120 * scaleOf(GRID), 1);
        const picture = element(fixture).querySelector(`[data-piece="${wide.identifier}"] img`)!;
        expect(picture.classList.contains('object-fill')).toBe(true);
        expect(picture.classList.contains('object-contain')).toBe(false);
      } finally {
        ImageStorage.instance.delete('stretched-picture');
      }
    });

    it('draws a piece on a hex grid while the hex under its middle is in sight', () => {
      table.gridType = GridType.HEX_VERTICAL;
      const grid = cellGridOf(table.width, table.height, GRID, GridType.HEX_VERTICAL);
      const offCentre = GameCharacter.create('小鬼', 1, '');
      offCentre.location = { name: 'table', x: 4.4 * GRID, y: 3 * GRID };
      const middle = cellIndexAt(grid, 4.9 * GRID, 3.5 * GRID);
      const hexCentre = cellCenterOf(grid, middle);
      // The hex under the piece's middle has its own middle outside the piece's footing.
      expect(
        hexCentre.x < 4.4 * GRID || hexCentre.x > 5.4 * GRID || hexCentre.y < 3 * GRID || hexCentre.y > 4 * GRID
      ).toBe(true);
      const seen = new CellBits(cellCount(grid));
      seen.set(middle);
      lookOutOf(pieceAt(4, 8));
      Object.defineProperty(TestBed.inject(FirstPersonService), 'seen', { value: () => seen });

      const view = element(mount());

      expect(view.querySelector(`[data-piece="${offCentre.identifier}"]`)).not.toBeNull();
    });

    it('leaves the scene be when a piece under a raised roof changes without raising it any further', () => {
      for (const [col, row, width, depth] of [
        [2, 2, 5, 1],
        [2, 8, 5, 1],
        [2, 3, 1, 5],
        [6, 3, 1, 5],
      ]) {
        const wall = Terrain.create('壁', width, depth, 1, 'stone', 'slab');
        wall.location = { name: 'table', x: col * GRID, y: row * GRID };
        table.appendChild(wall);
      }
      const giant = GameCharacter.create('巨竜', 3, '');
      giant.location = { name: 'table', x: 3 * GRID, y: 3 * GRID };
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const ceilings = () => (fixture.componentInstance as unknown as { ceilings(): unknown[] }).ceilings();
      const before = ceilings();
      expect(before.length).toBeGreaterThan(0);

      giant.rotate = 90;
      TestBed.inject(ObjectChangeService).notifyChanged(giant.identifier);
      fixture.detectChanges();

      expect(ceilings()).toBe(before);
    });

    it('keeps what is told about a great piece as wide as for a piece of one cell', () => {
      const giant = GameCharacter.create('巨竜', 6, '');
      giant.location = { name: 'table', x: GRID, y: 0 };
      const small = pieceAt(5, 4);
      lookOutOf(pieceAt(4, 9));
      const view = element(mount());
      const chromeOf = (piece: GameCharacter) =>
        view.querySelector<HTMLElement>(
          `[data-piece="${piece.identifier}"] [data-testid="first-person-piece-chrome"]`
        )!;

      expect(chromeOf(giant).style.width).toBe(chromeOf(small).style.width);
      expect(parseFloat(chromeOf(giant).style.width)).toBeCloseTo(1.3 * GRID * scaleOf(GRID), 0);
    });

    it('draws a great piece whose middle a pillar hides while its sides are in sight', () => {
      const pillar = Terrain.create('柱', 1, 1, 2, 'stone', 'slab');
      pillar.location = { name: 'table', x: 4 * GRID, y: 6 * GRID };
      table.appendChild(pillar);
      const giant = GameCharacter.create('巨竜', 5, '');
      giant.location = { name: 'table', x: 2 * GRID, y: GRID };
      lookOutOf(pieceAt(4, 9));

      const view = element(mount());

      expect(view.querySelector(`[data-piece="${giant.identifier}"]`)).not.toBeNull();
    });
  });

  it('stands the readings, the name and the marks above the picture rather than over it', () => {
    const enemy = pieceAt(4, 4);
    lookOutOf(pieceAt(4, 7));
    const fixture = mount();
    const chromeOf = () =>
      element(fixture).querySelector<HTMLElement>(
        `[data-piece="${enemy.identifier}"] [data-testid="first-person-piece-chrome"]`
      )!;

    expect(chromeOf().style.bottom).toBe('100%');
    expect(chromeOf().classList).toContain('origin-bottom');
    expect(chromeOf().querySelector('[data-testid="first-person-gauges"]')).not.toBeNull();
    expect(chromeOf().textContent).toContain(enemy.name);

    const wide = { target: { naturalWidth: 200, naturalHeight: 100 } } as unknown as Event;
    (fixture.componentInstance as unknown as { notePictureAspect(url: string, event: Event): void }).notePictureAspect(
      enemy.imageFile.url,
      wide
    );
    fixture.detectChanges();

    const billboard = element(fixture).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;
    expect(parseFloat(billboard.style.height)).toBeCloseTo((GRID / 2) * scaleOf(GRID), 1);
    expect(chromeOf().style.bottom).toBe('100%');
  });

  it('holds the writing on a near piece to a size that can be read, and asks nothing of a far one', () => {
    const near = pieceAt(4, 6);
    const far = pieceAt(4, 3);
    lookOutOf(pieceAt(4, 7));
    const view = element(mount());
    const chromeOf = (piece: GameCharacter) =>
      view.querySelector<HTMLElement>(`[data-piece="${piece.identifier}"] [data-testid="first-person-piece-chrome"]`)!;

    expect(chromeOf(near).style.transform).toMatch(/^scale\(0\./);
    expect(chromeOf(far).style.transform).toBe('');
  });

  it('stands the marks a piece carries along the top of it, with the rounds they have left', () => {
    const enemy = pieceAt(4, 4);
    enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-buff"]')).not.toBeNull();
    expect(billboard.querySelector('[data-testid="first-person-buff-rounds"]')?.textContent?.trim()).toBe('2');
  });

  it('leaves the marks off a piece that keeps them to itself', () => {
    const enemy = pieceAt(4, 4);
    enemy.hideBuff = true;
    enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
    lookOutOf(pieceAt(4, 7));

    const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

    expect(billboard.querySelector('[data-testid="first-person-buff"]')).toBeNull();
  });

  describe('the light the piece carries', () => {
    function torchOf(fixture: ComponentFixture<FirstPersonViewComponent>): HTMLButtonElement {
      return element(fixture).querySelector<HTMLButtonElement>('[data-testid="first-person-torch"]')!;
    }

    it('strikes and puts out the light from the second row of the controls', () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      const fixture = mount();

      expect(torchOf(fixture).disabled).toBe(false);
      expect(torchOf(fixture).textContent).toContain('明かりを灯す');

      torchOf(fixture).click();
      TestBed.inject(ObjectChangeService).notifyChanged(piece.identifier);
      fixture.detectChanges();

      expect(piece.lightEnabled).toBe(true);
      expect(torchOf(fixture).textContent).toContain('明かりを消す');
    });

    it('strikes the light with F as well', () => {
      const piece = pieceAt(4, 7);
      lookOutOf(piece);
      mount();

      document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', bubbles: true, cancelable: true }));

      expect(piece.lightEnabled).toBe(true);
    });

    it('stands the button down for a seat that may not walk the piece', () => {
      const piece = pieceAt(4, 7);
      piece.isLock = true;
      lookOutOf(piece);

      expect(torchOf(mount()).disabled).toBe(true);
    });
  });

  describe('what a piece in the view carries', () => {
    function enemyWithGauges(count: number): GameCharacter {
      const enemy = pieceAt(4, 4);
      for (let index = 0; index < count; index++) {
        const resource = DataElement.create(`資源${index}`, 10, { type: DataElementType.NUMBER_RESOURCE }, '10');
        resource.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
        enemy.detailDataElement!.appendChild(resource);
      }
      return enemy;
    }

    it('hangs no more bars on it than the table hangs round it', () => {
      const enemy = enemyWithGauges(MAX_MULTI_ANGLE_RESOURCE_GAUGES + 3);
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelectorAll('[data-testid="first-person-gauge"]')).toHaveLength(
        MAX_MULTI_ANGLE_RESOURCE_GAUGES
      );
    });

    it('stands its marks in one row and counts the rest off on a chip', () => {
      const enemy = pieceAt(4, 4);
      for (let index = 0; index < 8; index++) {
        enemy.buffDataElement!.appendChild(
          DataElement.create(`加護${index}`, 2, { type: DataElementType.NUMBER_RESOURCE })
        );
      }
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelectorAll('[data-testid="first-person-buff"]')).toHaveLength(5);
      expect(billboard.querySelector('[data-testid="first-person-buff-more"]')?.textContent?.trim()).toBe('あと3個');
    });

    it('leaves the chip off a piece whose marks all fit', () => {
      const enemy = pieceAt(4, 4);
      enemy.buffDataElement!.appendChild(DataElement.create('加護', 2, { type: DataElementType.NUMBER_RESOURCE }));
      lookOutOf(pieceAt(4, 7));

      const billboard = element(mount()).querySelector<HTMLElement>(`[data-piece="${enemy.identifier}"]`)!;

      expect(billboard.querySelector('[data-testid="first-person-buff-more"]')).toBeNull();
    });
  });

  it('draws the line from the caster to what is being picked, as the table does', () => {
    lookOutOf(pieceAt(4, 7));

    expect(element(mount()).querySelector('effect-target-overlay')).not.toBeNull();
  });

  it('acts as the piece it looks out of, so an effect is cast from there', () => {
    const viewer = pieceAt(4, 7);
    lookOutOf(viewer);
    mount();
    TestBed.tick();

    expect(TestBed.inject(SelectionSignalService).selectedObject()?.identifier).toBe(viewer.identifier);
  });

  describe('water', () => {
    function pond(col: number, row: number, cols: number, rows: number, surfaceCells: number): TableAmbience {
      const area = TableAmbience.create('池', 'water', cols, rows);
      area.location = { name: 'table', x: col * GRID, y: row * GRID };
      area.surfaceHeight = surfaceCells;
      table.appendChild(area);
      return area;
    }

    /** Lets the change announcements of the last edits arrive. */
    async function settled(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }

    function inside(fixture: ComponentFixture<FirstPersonViewComponent>) {
      return fixture.componentInstance as unknown as {
        skyGradient(): string | null;
        pieceViews(): { id: string; water: unknown }[];
        screenWeather(): { current?: { across: number; toward: number } | null } | undefined;
      };
    }

    it('fades a piece far off into murky water around the eye, and leaves it alone in the air', async () => {
      pond(0, 0, 12, 12, 2).turbidity = 0.9;
      const far = pieceAt(4, 1);
      lookOutOf(pieceAt(4, 7));
      await settled();

      const box = element(mount()).querySelector<HTMLElement>(`[data-piece="${far.identifier}"]`);
      expect(box?.style.opacity).not.toBe('');
      expect(Number(box?.style.opacity)).toBeLessThan(0.5);
    });

    it('loses a piece a few cells off in water nothing can be seen through, which clear water shows', async () => {
      const water = pond(0, 0, 12, 12, 2);
      const near = pieceAt(4, 4);
      lookOutOf(pieceAt(4, 7));
      await settled();
      const opacityOf = () =>
        Number(element(mount()).querySelector<HTMLElement>(`[data-piece="${near.identifier}"]`)?.style.opacity || 1);
      expect(opacityOf()).toBeGreaterThan(0.6);

      water.turbidity = 1;
      await settled();

      expect(opacityOf()).toBe(0);
    });

    it('hides the light above and the dark below in water nothing can be seen through', async () => {
      const water = pond(0, 0, 12, 12, 2);
      lookOutOf(pieceAt(4, 7));
      await settled();
      expect(inside(mount()).skyGradient()).not.toContain('100%, #b8e8ff');

      water.turbidity = 1;
      await settled();

      expect(inside(mount()).skyGradient()).toContain('100%, #b8e8ff');
    });

    it('carries what drifts in the water the way a pond flows, seen from the eye, and nothing in still water', async () => {
      const water = pond(0, 0, 12, 12, 2);
      lookOutOf(pieceAt(4, 7));
      await settled();
      expect(inside(mount()).screenWeather()?.current).toBeNull();

      water.flowSpeed = 1;
      water.flowDirection = 180;
      await settled();
      const current = inside(mount()).screenWeather()?.current;

      expect(current).toBeTruthy();
      expect(Math.hypot(current!.across, current!.toward)).toBeCloseTo(2.2, 3);
    });

    it('leaves a piece far off whole for an eye in the air', async () => {
      const far = pieceAt(4, 1);
      lookOutOf(pieceAt(4, 7));
      await settled();

      const box = element(mount()).querySelector<HTMLElement>(`[data-piece="${far.identifier}"]`);
      expect(box).not.toBeNull();
      expect(box?.style.opacity).toBe('');
    });
  });

  describe('what stands beyond the walls', () => {
    function picture(identifier: string): void {
      ImageStorage.instance.add({
        identifier,
        name: `${identifier}.png`,
        type: 'image/png',
        blob: null,
        url: `blob:${identifier}`,
        thumbnail: { type: '', blob: null, url: '' },
      });
    }

    afterEach(() => {
      ImageStorage.instance.delete('sky-picture');
      ImageStorage.instance.delete('hills-picture');
    });

    it('gives a table with no picture of its own a night sky, and leaves a table in the dark dark', () => {
      lookOutOf(pieceAt(4, 7));
      expect(element(mount()).querySelector('[data-sky-gradient]')).not.toBeNull();

      table.darknessEnabled = true;
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);
      expect(element(mount()).querySelector('[data-sky-gradient]')).toBeNull();
    });

    it('lays the picture the table is laid on behind the view, and leaves the dark without one', () => {
      lookOutOf(pieceAt(4, 7));
      expect(element(mount()).querySelector('[data-sky]')).toBeNull();

      picture('sky-picture');
      table.backgroundImageIdentifier = 'sky-picture';
      TestBed.inject(ObjectChangeService).notifyChanged(table.identifier);
      const sky = element(mount()).querySelector<HTMLElement>('[data-sky]');

      expect(sky?.style.backgroundImage).toContain('blob:sky-picture');
    });

    it('moves a backdrop across by a view for each turn as wide as the view', async () => {
      TestBed.inject(MotionService).setting.set('off');
      picture('hills-picture');
      const hills = new TableBackgroundLayer();
      hills.initialize();
      hills.imageIdentifier = 'hills-picture';
      hills.placement = 'backdrop';
      table.appendChild(hills);
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const backdrop = () => element(fixture).querySelector<HTMLElement>('[data-backdrop]')!;
      expect(backdrop().style.backgroundPosition).toBe('0px bottom');

      await TestBed.inject(FirstPersonService).turn(1);
      fixture.detectChanges();

      const viewWidth = (fixture.nativeElement as HTMLElement).clientWidth || window.innerWidth;
      expect(backdrop().style.backgroundPosition).toBe(`${-viewWidth}px bottom`);
    });

    it('moves the backdrops and the haze of the night sky down the view as the eye looks up', () => {
      picture('hills-picture');
      const hills = new TableBackgroundLayer();
      hills.initialize();
      hills.imageIdentifier = 'hills-picture';
      hills.placement = 'backdrop';
      table.appendChild(hills);
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const gradient = () => element(fixture).querySelector<HTMLElement>('[data-sky-gradient]');
      const backdrop = () => element(fixture).querySelector<HTMLElement>('[data-backdrop]')!;
      expect(backdrop().style.transform).toBe('');

      fixture.debugElement.injector.get(FirstPersonLookService).lookTo({ yaw: 0, pitch: 30 });
      fixture.detectChanges();

      const lift = Number(/translateY\(([-\d.]+)px\)/.exec(backdrop().style.transform)?.[1]);
      const perspective = (fixture.componentInstance as unknown as { perspective(): number }).perspective();
      expect(lift).toBeCloseTo(perspective * Math.tan(Math.PI / 6), 1);
      expect(gradient()).toBeNull();
    });

    it('keeps the haze of the night sky at the horizon as the eye looks up', () => {
      lookOutOf(pieceAt(4, 7));
      const fixture = mount();
      const gradient = () => element(fixture).querySelector<HTMLElement>('[data-sky-gradient]')!.style.background;
      const level = gradient();

      fixture.debugElement.injector.get(FirstPersonLookService).lookTo({ yaw: 0, pitch: 30 });
      fixture.detectChanges();

      expect(gradient()).not.toBe(level);
      expect(gradient()).toContain('px');
    });
  });
});

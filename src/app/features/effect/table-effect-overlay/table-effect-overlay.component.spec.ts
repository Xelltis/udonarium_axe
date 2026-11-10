import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { DEFAULT_TABLE_CAMERA_VIEW, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { TableEffectOverlayComponent } from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const LAYOUT: TableLayout = { left: 0, top: 30, width: 1280, height: 770, boardWidth: 1000, boardHeight: 1000 };

describe('TableEffectOverlayComponent', () => {
  let fixture: ComponentFixture<TableEffectOverlayComponent>;
  let component: TableEffectOverlayComponent;
  let playback: EffectPlaybackService;
  let preset: EffectPreset;

  beforeEach(() => {
    // The 2D context of happy-dom has no drawing functions, so nothing is handed back to
    // draw with. What is checked here is where the canvases go, not what lands on them.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    TestBed.configureTestingModule({
      imports: [TableEffectOverlayComponent],
      providers: [...TEST_PROVIDERS],
    });
    const camera = TestBed.inject(TableCameraService);
    camera.setLayout(LAYOUT);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    fixture = TestBed.createComponent(TableEffectOverlayComponent);
    component = fixture.componentInstance;
    playback = TestBed.inject(EffectPlaybackService);

    // Nearly every look is drawn in the table's scene; a run with a stage that cuts a piece's picture is still drawn over it.
    preset = new EffectPreset();
    preset.kind = 'frost';
    preset.stages = JSON.stringify([
      { role: 'impact', kind: 'frost', durationMs: 5000 },
      { role: 'field', kind: 'dissolve', durationMs: 80 },
    ]);
    preset.durationMs = 5000;
    preset.staggerMs = 0;
    ObjectStore.instance.add(preset, false);
  });

  afterEach(() => {
    fixture.destroy();
    ObjectStore.instance.remove(preset);
    vi.restoreAllMocks();
  });

  /** The outer layer of each sprite standing up, which places it; the inner one carries the look and the animation. */
  function standing(): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[data-effect-sprite]'));
  }

  /** The outer layer of each sprite lying flat on the floor. */
  function lying(): HTMLElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="effect-floor-plane"] > div')
    );
  }

  /** Where the screen draws a point of the board, lifted towards the eye, as the translation that puts something there. */
  function drawnAt(x: number, y: number, z: number, lift: number): string {
    const at = TestBed.inject(TableCameraService).screenOf()!(x, y, z, lift);
    return `translate(${at.x}px, ${at.y}px) scale(${at.scale})`;
  }

  it('settles which targets are hidden once per cast, not once per frame', () => {
    const character = GameCharacter.create('的', 1, '');
    const seen = vi.spyOn(TestBed.inject(VisionService), 'isTokenVisible');
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: character.identifier, x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    const frames = component['renderables'] as () => unknown[];

    playback.now.set(16);
    frames();
    playback.now.set(32);
    frames();
    playback.now.set(48);
    expect(frames()).toHaveLength(1);

    expect(seen).toHaveBeenCalledTimes(1);
    ObjectStore.instance.remove(character);
  });

  it('leaves an effect left standing to the table’s scene where its look is drawn there', () => {
    const motion = TestBed.inject(MotionService);
    motion.setting.set('on');
    const burst = new EffectPreset();
    burst.kind = 'burst';
    burst.durationMs = 600;
    ObjectStore.instance.add(burst, false);
    const fields = TestBed.inject(EffectFieldService);
    const drawnInScene = fields.place(burst, 100, 200, 0);
    const drawnOver = fields.place(preset, 300, 200, 0);
    try {
      playback.now.set(200);

      const drawn = (component['renderables'] as () => { preset: EffectPreset }[])();
      expect(drawn.map((renderable) => renderable.preset)).toEqual([preset]);
    } finally {
      drawnInScene.destroy();
      drawnOver.destroy();
      ObjectStore.instance.remove(burst);
      motion.setting.set('auto');
    }
  });

  it('draws nothing with no effect playing', () => {
    fixture.detectChanges();

    expect(standing()).toHaveLength(0);
    expect(lying()).toHaveLength(0);
    expect(fixture.nativeElement.querySelectorAll('effect-canvas')).toHaveLength(0);
  });

  it('builds nothing anew while nothing plays, however the clock moves on', () => {
    playback.now.set(16);
    const canvases = component['canvasesOnScreen'] as () => unknown;
    const sprites = component.sprites();
    const placed = canvases();

    playback.now.set(32);
    playback.now.set(48);

    expect(component.sprites()).toBe(sprites);
    expect(canvases()).toBe(placed);
  });

  it('draws the sprites on a firing', () => {
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    playback.now.set(playback.activeCasts()[0].startedAt + 200);
    fixture.detectChanges();

    const elements = standing();
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.style.pointerEvents).toBe('none');
      expect(element.style.transform).toContain('translate(');
    }
  });

  it('leaves a look drawn in the table scene itself to the scene, and draws nothing of it over the table', () => {
    preset.kind = 'burst';
    preset.stages = '';
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    playback.now.set(playback.activeCasts()[0].startedAt + 200);
    fixture.detectChanges();

    expect(standing()).toHaveLength(0);
    expect(lying()).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('canvas')).toHaveLength(0);
  });

  it('leaves a sprite lying flat rather than turning it to the camera', () => {
    // Ice puts up crystals facing the camera and lays a ring of frost flat.
    preset.kind = 'frost';
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 0, y: 0, z: 0 }],
      seed: 3,
    });
    playback.now.set(playback.activeCasts()[0].startedAt + 1000);
    fixture.detectChanges();

    expect(lying().length).toBeGreaterThan(0);
    expect(standing().length).toBeGreaterThan(0);
    for (const flat of lying()) expect(flat.style.transform).not.toContain('rotateX(');
  });

  it('keeps the blending modes that flatten the board out of the document', () => {
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 0, y: 0, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    const elements = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('div'));

    // Additive blending happens inside the canvas. A blend mode or a filter on an element
    // flattens the preserved depth and lays the pieces on the board flat.
    expect(elements.every((element) => element.style.mixBlendMode === '')).toBe(true);
    expect(elements.every((element) => element.style.filter === '')).toBe(true);
  });

  it('does not promote the sprites to layers of their own', () => {
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 0, y: 0, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    // A loud effect puts hundreds of sprites up in one frame, and promoting every one of
    // them allocates hundreds of layers at once, blacking the screen out until it is done.
    const promoted = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('*')).filter(
      (element) => element.className.includes('will-change')
    );
    expect(promoted).toHaveLength(0);
  });

  it('draws the glowing particles on a canvas of their own for each target', () => {
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [
        { identifier: 'a', x: 0, y: 0, z: 0 },
        { identifier: 'b', x: 200, y: 0, z: 0 },
      ],
      seed: 3,
    });
    playback.now.set(playback.activeCasts()[0].startedAt + 200);
    fixture.detectChanges();

    const canvases = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('effect-canvas');
    expect(canvases).toHaveLength(2);
    for (const host of Array.from(canvases)) {
      expect(host.style.transform).toContain('scale(');
      expect(host.querySelector('canvas')).not.toBeNull();
    }
  });
  it('holds the effects up off the floor towards an eye it is given, and lifts them towards it', () => {
    fixture.componentRef.setInput('eye', { rotation: { x: 90, y: 0, z: -30 }, liftPx: 5, risePx: 40 });
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    playback.now.set(playback.activeCasts()[0].startedAt + 200);
    fixture.detectChanges();

    const canvas = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('effect-canvas')!;

    expect(canvas.style.transform).toContain(drawnAt(100, 200, 40, 5));
  });

  it('leaves the effects to the first-person view while the table is out of sight', () => {
    vi.spyOn(TestBed.inject(FirstPersonService), 'showing').mockReturnValue(true);
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    expect(standing()).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('effect-canvas')).toHaveLength(0);

    fixture.componentRef.setInput('eye', { rotation: { x: 90, y: 0, z: 0 }, liftPx: 5, risePx: 40 });
    playback.now.set(playback.activeCasts()[0].startedAt + 200);
    fixture.detectChanges();

    expect(standing().length).toBeGreaterThan(0);
  });

  it('glows along the outline of a drawing rather than round its box', () => {
    const sprite = {
      key: 'shot',
      x: 0,
      y: 0,
      z: 0,
      offsetX: 0,
      offsetY: 0,
      width: 60,
      height: 20,
      rotate: 0,
      opacity: 1,
      background: '',
      borderRadius: '',
      clipPath: '',
      shadow: '0 0 12px #ffffff, 0 0 30px #ff6a2b',
      animation: '',
      origin: '',
      svg: '<svg viewBox="0 0 100 100"></svg>',
      flat: false,
    };

    const painted = fixture.componentInstance['paintStyle'](sprite);

    // A box shadow follows the element, so a drawing that does not fill its box shows a square edge.
    expect(painted['box-shadow']).toBeUndefined();
    expect(painted['filter']).toBe('drop-shadow(0 0 12px #ffffff) drop-shadow(0 0 30px #ff6a2b)');
    expect(fixture.componentInstance['paintStyle']({ ...sprite, svg: '' })['box-shadow']).toBe(sprite.shadow);
  });
});

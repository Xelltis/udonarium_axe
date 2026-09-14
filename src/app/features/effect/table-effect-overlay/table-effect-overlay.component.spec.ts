import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TableEffectOverlayComponent } from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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
    fixture = TestBed.createComponent(TableEffectOverlayComponent);
    component = fixture.componentInstance;
    playback = TestBed.inject(EffectPlaybackService);

    preset = new EffectPreset();
    preset.kind = 'burst';
    preset.durationMs = 5000;
    preset.staggerMs = 0;
    ObjectStore.instance.add(preset, false);
  });

  afterEach(() => {
    fixture.destroy();
    ObjectStore.instance.remove(preset);
    vi.restoreAllMocks();
  });

  /** Only the outer layer, which places it; the inner one carries the look and the animation. */
  function outerLayers(): HTMLElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(':scope > div'));
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

  it('draws nothing with no effect playing', () => {
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('div')).toHaveLength(0);
  });

  it('builds nothing anew while nothing plays, however the clock moves on', () => {
    playback.now.set(16);
    const sprites = component.sprites();
    const canvases = component.canvases();

    playback.now.set(32);
    playback.now.set(48);

    expect(component.sprites()).toBe(sprites);
    expect(component.canvases()).toBe(canvases);
  });

  it('draws the sprites on a firing', () => {
    playback.play({
      presetIdentifier: preset.identifier,
      targets: [{ identifier: 'char', x: 100, y: 200, z: 0 }],
      seed: 3,
    });
    fixture.detectChanges();

    const elements = outerLayers();
    expect(elements.length).toBeGreaterThan(0);
    for (const element of elements) {
      expect(element.style.pointerEvents).toBe('none');
      expect(element.style.transform).toContain('translate3d(');
    }
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

    const transforms = outerLayers().map((element) => element.style.transform);

    expect(transforms.some((transform) => !transform.includes('rotateX('))).toBe(true);
    expect(transforms.some((transform) => transform.includes('rotateX('))).toBe(true);
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
    fixture.detectChanges();

    const canvases = (fixture.nativeElement as HTMLElement).querySelectorAll('effect-canvas');
    expect(canvases).toHaveLength(2);
    for (const host of Array.from(canvases)) {
      expect((host as HTMLElement).style.transform).toContain('translate3d(');
      expect(host.querySelector('canvas')).not.toBeNull();
    }
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

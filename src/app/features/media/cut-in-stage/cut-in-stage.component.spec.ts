import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { CutInStageComponent } from '@axe/features/media/cut-in-stage/cut-in-stage.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInStageComponent', () => {
  let fixture: ComponentFixture<CutInStageComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInStageComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    // Each test says for itself whether the browser can animate, by calling stubAnimate or
    // not. Taken away here as well as afterwards, since the one that runs first would
    // otherwise be the only one to meet a browser that can.
    Reflect.deleteProperty(Element.prototype, 'animate');
    fixture = TestBed.createComponent(CutInStageComponent);
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  function makeScene(durationMs = 1000): CutInScene {
    const scene = new CutInScene();
    scene.initialize();
    scene.cutInIdentifier = 'cut-1';
    scene.durationMs = durationMs;
    return scene;
  }

  function addLayer(scene: CutInScene, fields: Partial<CutInLayer> = {}): CutInLayer {
    const layer = new CutInLayer();
    layer.initialize();
    Object.assign(layer, fields);
    scene.appendChild(layer);
    return layer;
  }

  function show(scene: CutInScene | null, playing = true, playheadMs = 0, startOffsetMs = 0): void {
    fixture.componentRef.setInput('scene', scene);
    fixture.componentRef.setInput('sceneWidth', 640);
    fixture.componentRef.setInput('sceneHeight', 360);
    fixture.componentRef.setInput('playing', playing);
    fixture.componentRef.setInput('playheadMs', playheadMs);
    fixture.componentRef.setInput('startOffsetMs', startOffsetMs);
    fixture.detectChanges();
  }

  function layerElements(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('.origin-top-left > div')] as HTMLElement[];
  }

  function stubAnimate(): ReturnType<typeof vi.fn> {
    const animate = vi.fn(() => ({
      cancel: vi.fn(),
      pause: vi.fn(),
      play: vi.fn(),
      currentTime: 0,
      finished: Promise.reject(new Error('the animation was canceled')),
    }));
    Object.defineProperty(Element.prototype, 'animate', { value: animate, configurable: true, writable: true });
    return animate;
  }

  it('draws nothing without a scene', () => {
    show(null);

    expect(layerElements()).toHaveLength(0);
  });

  it('draws one element for each layer', () => {
    const scene = makeScene();
    addLayer(scene, { name: '背景' });
    addLayer(scene, { name: '立ち絵' });

    show(scene);

    expect(layerElements()).toHaveLength(2);
  });

  it('leaves out a layer that is hidden', () => {
    const scene = makeScene();
    addLayer(scene);
    addLayer(scene, { hidden: true });

    show(scene);

    expect(layerElements()).toHaveLength(1);
  });

  it('gives each layer its box and the point it turns around', () => {
    const scene = makeScene();
    addLayer(scene, { width: 200, height: 100, anchorX: 0, anchorY: 1 });

    show(scene);

    const element = layerElements()[0];
    expect(element.style.width).toBe('200px');
    expect(element.style.height).toBe('100px');
    expect(element.style.transformOrigin).toBe('0% 100%');
  });

  it('hands the keyframes and the length of the scene to the browser', () => {
    const animate = stubAnimate();
    const scene = makeScene(2500);
    addLayer(scene, {
      tracks: encodeCutInTracks({
        x: [
          { t: 0, v: -400, e: 'linear' },
          { t: 1000, v: 0 },
        ],
      }),
    });

    show(scene);

    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0] as [
      { offset: number; transform: string }[],
      KeyframeAnimationOptions,
    ];
    expect(options).toEqual({ duration: 2500, fill: 'both', iterations: 1 });
    expect(frames[0].transform).toContain('translate(-400px');
    expect(frames[frames.length - 1].offset).toBe(1);
  });

  it('runs a looping scene without end', () => {
    const animate = stubAnimate();
    const scene = makeScene();
    scene.sceneLoop = true;
    addLayer(scene);

    show(scene);

    const [, options] = animate.mock.calls[0] as [unknown, KeyframeAnimationOptions];
    expect(options.iterations).toBe(Infinity);
  });

  it('starts a replicated scene at the shared playback offset', () => {
    const animate = stubAnimate();
    const scene = makeScene();
    addLayer(scene);

    show(scene, true, 0, 125);

    const [, options] = animate.mock.calls[0] as [unknown, KeyframeAnimationOptions];
    expect(options.delay).toBe(-125);
  });

  it('holds the animation at the scrubber rather than playing it', () => {
    const animate = stubAnimate();
    const scene = makeScene();
    addLayer(scene);

    show(scene, false, 600);

    const handle = animate.mock.results[0].value as { pause: ReturnType<typeof vi.fn>; currentTime: number };
    expect(handle.pause).toHaveBeenCalled();
    expect(handle.currentTime).toBe(600);
  });

  it('paints one moment where the browser cannot animate', () => {
    const scene = makeScene(1000);
    addLayer(scene, {
      tracks: encodeCutInTracks({
        x: [
          { t: 0, v: 0, e: 'linear' },
          { t: 1000, v: 100 },
        ],
      }),
    });

    show(scene, false, 500);

    expect(layerElements()[0].style.transform).toContain('translate(50px');
  });

  it('cuts a layer down to the outline it was given', () => {
    const scene = makeScene();
    addLayer(scene, { clip: 'slant' });
    addLayer(scene, { clip: 'none' });

    show(scene);

    const [cut, whole] = layerElements();
    expect(cut.style.clipPath).toContain('polygon(');
    expect(whole.style.clipPath).toBe('');
  });

  it('draws a layer whole under an outline it does not know', () => {
    const scene = makeScene();
    addLayer(scene, { clip: 'trapezoid' as never });

    show(scene);

    expect(layerElements()[0].style.clipPath).toBe('');
  });

  it('leans a layer the way it was told to', () => {
    const scene = makeScene();
    addLayer(scene, { skewXDeg: 20 });

    show(scene, false, 0);

    expect(layerElements()[0].style.transform).toContain('skew(20deg');
  });

  it('lets a layer in a part at a time when it is told to', () => {
    const scene = makeScene();
    addLayer(scene, { wipeShape: 'chevronRight', wipe: 0.4 });

    show(scene, false, 0);

    const wipe = fixture.nativeElement.querySelector('.origin-top-left > div > div') as HTMLElement;
    expect(wipe.style.clipPath).toContain('polygon(');
    expect(wipe.style.clipPath).toContain('40%');
  });

  it('lets a layer be taken away as well as let in, on an outline of its own', () => {
    const scene = makeScene();
    addLayer(scene, { wipeShape: 'chevronRight', wipe: 1, crumbleShape: 'crumbleLeft', crumble: 0.6 });

    show(scene, false, 0);

    const wipe = fixture.nativeElement.querySelector('.origin-top-left > div > div') as HTMLElement;
    const crumble = fixture.nativeElement.querySelector('.origin-top-left > div > div > div') as HTMLElement;
    expect(wipe.style.clipPath).toContain('polygon(');
    expect(crumble.style.clipPath).toContain('polygon(');
    expect(crumble.style.clipPath).not.toBe(wipe.style.clipPath);
  });

  it('leaves a layer whole where it has no wipe', () => {
    const scene = makeScene();
    addLayer(scene);

    show(scene, false, 0);

    const wipe = fixture.nativeElement.querySelector('.origin-top-left > div > div') as HTMLElement;
    expect(wipe.style.clipPath).toBe('');
  });

  it('sets a text layer downwards when it is told to', () => {
    const scene = makeScene();
    addLayer(scene, { kind: 'text', text: 'ブチッ', vertical: true, letterSpacingPx: -10 });

    show(scene, false, 0);

    const words = fixture.nativeElement.querySelector('.whitespace-pre-wrap') as HTMLElement;
    expect(words.style.writingMode).toBe('vertical-rl');
    expect(words.style.textOrientation).toBe('upright');
    expect(words.style.letterSpacing).toBe('-10px');
  });

  it('writes a text layer as it was typed, with nothing before or after it', () => {
    const scene = makeScene();
    addLayer(scene, { kind: 'text', text: 'ドン\nッ！' });

    show(scene, false, 0);

    const words = fixture.nativeElement.querySelector('.whitespace-pre-wrap') as HTMLElement;
    expect(words.textContent).toBe('ドン\nッ！');
  });

  it('draws a layer whose letters come on one at a time a letter to a span, each on the layer\u2019s clock', () => {
    const animate = stubAnimate();
    const scene = makeScene(2000);
    addLayer(scene, { kind: 'text', text: 'いく\nぞ', letterMotion: 'fade', letterStaggerMs: 100, startMs: 500 });

    show(scene, false, 700);

    const letters = [...fixture.nativeElement.querySelectorAll('[data-letter-rank]')] as HTMLElement[];
    expect(letters.map((letter) => [letter.textContent, letter.dataset['letterRank']])).toEqual([
      ['い', '0'],
      ['く', '1'],
      ['ぞ', '2'],
    ]);
    expect(fixture.nativeElement.querySelectorAll('.whitespace-pre-wrap br')).toHaveLength(1);

    const letterCalls = animate.mock.calls.filter((_, at) => animate.mock.contexts[at] instanceof HTMLSpanElement);
    expect(letterCalls).toHaveLength(3);
    const [frames, options] = letterCalls[1] as [{ offset: number; opacity: number }[], KeyframeAnimationOptions];
    expect(options.duration).toBe(2000);
    expect(frames.find((frame) => frame.offset === 600 / 2000)!.opacity).toBe(0);

    const handles = animate.mock.results.map(
      (result) => result.value as { pause: ReturnType<typeof vi.fn>; currentTime: number }
    );
    expect(handles.every((handle) => handle.pause.mock.calls.length > 0 && handle.currentTime === 700)).toBe(true);
  });

  it('writes a layer with a motion this version does not know as it was typed', () => {
    const scene = makeScene();
    addLayer(scene, { kind: 'text', text: 'ドン', letterMotion: 'from-a-newer-version' });

    show(scene, false, 0);

    expect(fixture.nativeElement.querySelector('[data-letter-rank]')).toBeNull();
    expect((fixture.nativeElement.querySelector('.whitespace-pre-wrap') as HTMLElement).textContent).toBe('ドン');
  });

  describe('a cut-in played for a speaker', () => {
    const speaker = { characterId: 'hero', imageIdentifier: 'hero-face', name: 'ヒロ' };

    beforeEach(() => {
      for (const identifier of ['hero-face', 'stand-in']) {
        ImageStorage.instance.add({
          identifier,
          name: `${identifier}.png`,
          type: 'image/png',
          blob: null,
          url: `blob:${identifier}`,
          thumbnail: { type: '', blob: null, url: '' },
        });
      }
    });

    afterEach(() => {
      ImageStorage.instance.delete('hero-face');
      ImageStorage.instance.delete('stand-in');
    });

    function picture(): string | null {
      return (fixture.nativeElement.querySelector('img') as HTMLImageElement | null)?.getAttribute('src') ?? null;
    }

    it('shows the speaker\u2019s portrait in a portrait\u2019s place, and the layer\u2019s own picture otherwise', () => {
      const scene = makeScene();
      addLayer(scene, { kind: 'image', portraitSlot: true, imageIdentifier: 'stand-in' });

      fixture.componentRef.setInput('speaker', speaker);
      show(scene, false, 0);
      expect(picture()).toBe('blob:hero-face');

      fixture.componentRef.setInput('speaker', null);
      fixture.detectChanges();
      expect(picture()).toBe('blob:stand-in');
    });

    it('shows a grey head and shoulders where there is neither, and leaves an ordinary layer as it was', () => {
      const scene = makeScene();
      const slot = addLayer(scene, { kind: 'image', portraitSlot: true });
      show(scene, false, 0);
      expect(picture()).toMatch(/^data:image\/svg\+xml/);

      slot.portraitSlot = false;
      slot.imageIdentifier = 'stand-in';
      fixture.componentRef.setInput('speaker', speaker);
      TestBed.inject(ObjectChangeService).notifyChanged(slot.identifier);
      fixture.detectChanges();
      expect(picture()).toBe('blob:stand-in');
    });

    it('sets the speaker\u2019s portrait as they fitted it, and leaves the stand-in to the layer\u2019s framing', () => {
      const scene = makeScene();
      addLayer(scene, { kind: 'image', portraitSlot: true, imageIdentifier: 'stand-in', objectFit: 'cover' });
      const fitted = () => fixture.nativeElement.querySelector('img[data-portrait-fit]') as HTMLImageElement | null;

      fixture.componentRef.setInput('speaker', { ...speaker, fit: { scale: 2, x: 0.1, y: -0.25 } });
      show(scene, false, 0);
      expect(fitted()?.style.transform).toBe('translate(10%, -25%) scale(2)');
      expect(fitted()?.parentElement?.classList).toContain('overflow-hidden');

      fixture.componentRef.setInput('speaker', { ...speaker, imageIdentifier: 'gone', fit: { scale: 2, x: 0, y: 0 } });
      fixture.detectChanges();
      expect(fitted()).toBeNull();
      expect(picture()).toBe('blob:stand-in');
      expect((fixture.nativeElement.querySelector('img') as HTMLImageElement).style.objectFit).toBe('cover');
    });

    it('says the speaker\u2019s name where a text layer asks for it, and a stand-in where there is nobody', () => {
      const scene = makeScene();
      addLayer(scene, { kind: 'text', text: '{character}、参戦！' });

      fixture.componentRef.setInput('speaker', speaker);
      show(scene, false, 0);
      const words = () => (fixture.nativeElement.querySelector('.whitespace-pre-wrap') as HTMLElement).textContent;
      expect(words()).toBe('ヒロ、参戦！');

      fixture.componentRef.setInput('speaker', null);
      fixture.detectChanges();
      expect(words()).toBe('？？？、参戦！');
    });
  });

  it('refuses to let the browser drag a layer picture away', () => {
    const scene = makeScene();
    addLayer(scene, { imageIdentifier: 'nothing' });

    show(scene);

    const stage = fixture.nativeElement.querySelector('.overflow-hidden') as HTMLElement;
    const dragstart = new Event('dragstart', { bubbles: true, cancelable: true });
    stage.dispatchEvent(dragstart);

    expect(dragstart.defaultPrevented).toBe(true);
  });

  it('places the scene inside the room it is given, as the editor measures it', () => {
    const scene = makeScene();
    addLayer(scene);

    show(scene);

    expect(fixture.componentInstance.fit()).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
    expect(fixture.componentInstance.sceneTransform()).toBe('translate(0px, 0px) scale(1)');
  });
});

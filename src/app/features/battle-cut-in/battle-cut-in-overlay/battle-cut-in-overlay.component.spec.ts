import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BattleScene } from '@axe/domain/battle/battle-scene';
import { BATTLE_STILL_MS } from '@axe/domain/battle/battle-timeline';
import { GameCharacter } from '@axe/domain/character/game-character';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import type { EffectFrame } from '@axe/domain/effect/scene/effect-scene';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { BattleCutInOverlayComponent } from '@axe/features/battle-cut-in/battle-cut-in-overlay/battle-cut-in-overlay.component';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';
import type { EffectOverlay } from '@axe/infrastructure/table-3d/table-3d-port';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleCutInOverlayComponent', () => {
  let fixture: ComponentFixture<BattleCutInOverlayComponent>;
  let state: BattleCutInStateService;
  const motion = signal(false);
  /** Whether the browser can make the canvases the effects are drawn on as on the table. */
  let drawsOverPage = false;
  /** What each of those canvases was handed to draw, by the canvas's test id. */
  let shown: Map<string, EffectFrame[]>;
  const overPageOn = (canvas: HTMLCanvasElement): EffectOverlay | null => {
    if (!drawsOverPage) return null;
    const frames: EffectFrame[] = [];
    shown.set(canvas.dataset['testid'] ?? '', frames);
    return { show: (frame) => frames.push(frame), dispose: () => undefined };
  };

  function scene(overrides: Partial<BattleScene> = {}): BattleScene {
    return {
      key: `scene-${Math.random()}`,
      attackerSide: 'left',
      attacker: {
        identifier: 'hero',
        name: '勇者',
        image: '',
        gauges: [{ name: 'MP', before: 10, after: 7, max: 10, inverted: false }],
        defeated: false,
      },
      defenders: [
        {
          identifier: 'goblin',
          name: 'ゴブリン',
          image: '',
          gauges: [{ name: 'HP', before: 12, after: 0, max: 12, inverted: false }],
          defeated: true,
        },
      ],
      effect: 'EffectPreset_slash_1',
      defeatEffect: 'EffectPreset_defeat_dissolve',
      background: '',
      theme: 'fantasy',
      secret: false,
      seed: 5,
      ...overrides,
    };
  }

  function play(played: BattleScene): HTMLElement {
    state.show(played);
    fixture = TestBed.createComponent(BattleCutInOverlayComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const textsOf = (root: HTMLElement, selector: string) =>
    [...root.querySelectorAll(selector)].map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

  beforeEach(() => {
    vi.useFakeTimers();
    motion.set(false);
    TestBed.configureTestingModule({
      imports: [BattleCutInOverlayComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: MotionService, useValue: { enabled: motion } },
        {
          provide: EFFECT_STAGE_LOADER,
          useValue: () =>
            Promise.resolve({
              createEffectStage: () => Promise.resolve(null),
              createEffectOverlay: (canvas: HTMLCanvasElement) => Promise.resolve(overPageOn(canvas)),
            }),
        },
      ],
    });
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);
    state = TestBed.inject(BattleCutInStateService);
  });

  afterEach(() => {
    fixture?.destroy();
    state.clear();
    drawsOverPage = false;
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('stands both sides on the stage with how the exchange ended, while motion is off', () => {
    const root = play(scene());

    const plates = textsOf(root, '[data-testid="battle-plate"]');
    expect(plates).toHaveLength(2);
    expect(plates[0]).toContain('勇者');
    expect(plates[0]).toContain('7/10');
    expect(plates[1]).toContain('ゴブリン');
    expect(plates[1]).toContain('0/12');
    expect(textsOf(root, '[data-testid="battle-pop"]')).toEqual(['MP -3', '-12']);
    expect(textsOf(root, '[data-testid="battle-defeat-banner"]')[0]).toContain('撃破');
    expect(textsOf(root, '[data-testid="battle-defeat-banner"]')[0]).toContain('ゴブリン');
  });

  it('lays the picture of the stage the scene names behind it', () => {
    const root = play(scene({ theme: 'horror' }));

    const picture = root.querySelector<HTMLImageElement>('[data-testid="battle-cut-in-background"]')!;
    expect(picture.getAttribute('src')).toContain('battle/horror.webp');
    expect(picture.dataset['theme']).toBe('horror');
  });

  it('lays the room’s own picture the scene names behind it, with the band in plain colours', () => {
    ImageStorage.instance.add({
      identifier: 'arena',
      name: 'arena.webp',
      type: 'image/webp',
      blob: new Blob(['picture'], { type: 'image/webp' }),
      url: 'blob:arena',
      thumbnail: { type: '', blob: null, url: '' },
    });
    try {
      const root = play(scene({ theme: 'horror', background: 'arena' }));

      const picture = root.querySelector<HTMLImageElement>('[data-testid="battle-cut-in-background"]')!;
      expect(picture.getAttribute('src')).toBe('blob:arena');
      expect(picture.dataset['theme']).toBeUndefined();
      const plate = root.querySelector<HTMLElement>('[data-testid="battle-plate"]')!;
      expect(plate.style.borderLeft).toMatch(/#4aa3ff|rgb\(74, 163, 255\)/);
    } finally {
      ImageStorage.instance.delete('arena');
    }
  });

  it('puts in a fighter’s picture that arrives while the scene plays', () => {
    const played = scene();
    const root = play({ ...played, attacker: { ...played.attacker, image: 'late-hero' } });
    expect(root.querySelector('img[alt="勇者"]')).toBeNull();

    ImageStorage.instance.add({
      identifier: 'late-hero',
      name: 'hero.webp',
      type: 'image/webp',
      blob: new Blob(['picture'], { type: 'image/webp' }),
      url: 'blob:late-hero',
      thumbnail: { type: '', blob: null, url: '' },
    });
    try {
      TestBed.inject(ObjectChangeService).fileVersion.update((version) => version + 1);
      fixture.detectChanges();

      expect(root.querySelector('img[alt="勇者"]')?.getAttribute('src')).toBe('blob:late-hero');
    } finally {
      ImageStorage.instance.delete('late-hero');
    }
  });

  it('turns a picture facing the side it stands on to face across, and leaves the rest as drawn', () => {
    for (const identifier of ['facing-hero', 'facing-goblin']) {
      ImageStorage.instance.add({
        identifier,
        name: `${identifier}.webp`,
        type: 'image/webp',
        blob: new Blob(['picture'], { type: 'image/webp' }),
        url: `blob:${identifier}`,
        thumbnail: { type: '', blob: null, url: '' },
      });
    }
    try {
      const played = scene();
      const root = play({
        ...played,
        attacker: { ...played.attacker, image: 'facing-hero', facing: 'left' },
        defenders: [{ ...played.defenders[0], image: 'facing-goblin', facing: 'left' }],
      });

      expect(root.querySelector('img[alt="勇者"]')?.classList.contains('-scale-x-100')).toBe(true);
      expect(root.querySelector('img[alt="ゴブリン"]')?.classList.contains('-scale-x-100')).toBe(false);
    } finally {
      ImageStorage.instance.delete('facing-hero');
      ImageStorage.instance.delete('facing-goblin');
    }
  });

  it('lays the stage’s own picture where the room’s picture has not arrived', () => {
    const root = play(scene({ theme: 'mecha-day', background: 'not-here-yet' }));

    const picture = root.querySelector<HTMLImageElement>('[data-testid="battle-cut-in-background"]')!;
    expect(picture.getAttribute('src')).toContain('battle/mecha-day.webp');
  });

  it('stands the one striking on the right where the scene says so', () => {
    const root = play(scene({ attackerSide: 'right' }));

    const plates = textsOf(root, '[data-testid="battle-plate"]');
    expect(plates[0]).toContain('ゴブリン');
    expect(plates[1]).toContain('勇者');
  });

  it('keeps the numbers back for a line said in secret', () => {
    const root = play(scene({ secret: true }));

    expect(textsOf(root, '[data-testid="battle-plate"]')[1]).toContain('???/???');
    expect(root.querySelectorAll('[data-testid="battle-pop"]')).toHaveLength(0);
  });

  describe('a piece kept from the reader', () => {
    let goblin: GameCharacter;

    beforeEach(() => {
      goblin = new GameCharacter('goblin');
      goblin.initialize();
      vi.spyOn(TestBed.inject(DisclosureService), 'canView').mockReturnValue(false);
    });

    afterEach(() => goblin.destroy());

    it('tells the numbers of a bar the strike spends', () => {
      const beaten = textsOf(play(scene()), '[data-testid="battle-plate"]')[1];

      expect(beaten).not.toContain('???/???');
      expect(beaten).toContain('/12');
    });

    it('keeps the numbers of a bar the strike leaves standing back', () => {
      const standing = scene();
      standing.defenders[0] = {
        ...standing.defenders[0],
        gauges: [{ name: 'HP', before: 12, after: 5, max: 12, inverted: false }],
        defeated: false,
      };

      expect(textsOf(play(standing), '[data-testid="battle-plate"]')[1]).toContain('???/???');
    });
  });

  it('brings nobody down where nobody fell', () => {
    const standing = scene();
    standing.defenders[0] = { ...standing.defenders[0], defeated: false };

    const root = play(standing);

    expect(root.querySelector('[data-testid="battle-defeat-banner"]')).toBeNull();
  });

  it('moves on when pressed', () => {
    const root = play(scene());

    root.querySelector<HTMLElement>('[data-testid="battle-cut-in"]')!.click();

    expect(state.active()).toBe(false);
  });

  it('plays the next scene waiting once the one playing is passed', () => {
    const root = play(scene());
    state.show(scene({ attackerSide: 'right' }));

    root.querySelector<HTMLElement>('[data-testid="battle-cut-in-close"]')!.click();
    fixture.detectChanges();

    expect(state.active()).toBe(true);
    expect(textsOf(root, '[data-testid="battle-plate"]')[0]).toContain('ゴブリン');
  });

  it('closes by itself once the still has been seen', () => {
    play(scene());

    vi.advanceTimersByTime(BATTLE_STILL_MS + 10);

    expect(state.active()).toBe(false);
  });

  it('steps down into a window from the full screen at its size button', () => {
    const root = play(scene());

    root.querySelector<HTMLElement>('[data-testid="battle-cut-in-size"]')!.click();
    fixture.detectChanges();

    expect(state.active()).toBe(true);
    expect(TestBed.inject(BattleCutInPreferenceService).stageWindow().size).toBe('large');
    expect(root.querySelector('[data-testid="battle-cut-in"]')!.getAttribute('data-stage-size')).toBe('large');
  });

  describe('drawn in a window', () => {
    let preference: BattleCutInPreferenceService;

    beforeEach(() => {
      preference = TestBed.inject(BattleCutInPreferenceService);
      preference.setStageSize('small');
    });

    afterEach(() => localStorage.removeItem('axe.battle.window'));

    const windowOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-testid="battle-cut-in"]')!;

    it('plays the stage drawn at its full size and shrunk whole into a window of its own', () => {
      const root = play(scene());
      const stage = root.querySelector<HTMLElement>('[data-testid="battle-cut-in-stage"]')!;

      expect(windowOf(root).style.width).toBe('384px');
      expect(windowOf(root).style.height).toBe('216px');
      expect(stage.style.width).toBe('1280px');
      expect(stage.style.transform).toBe('scale(0.3)');
      expect(textsOf(root, '[data-testid="battle-plate"]')).toHaveLength(2);
    });

    it('plays on when the stage or Escape is pressed, and closes from its button', () => {
      const root = play(scene());

      windowOf(root).click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(state.active()).toBe(true);

      root.querySelector<HTMLElement>('[data-testid="battle-cut-in-close"]')!.click();
      expect(state.active()).toBe(false);
    });

    it('keeps the window where its top edge is dragged to', () => {
      preference.placeStageWindow(1, 0);
      const root = play(scene());
      const handle = root.querySelector<HTMLElement>('[data-testid="battle-cut-in-handle"]')!;
      const left = parseFloat(windowOf(root).style.left);

      handle.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 600, clientY: 20, pointerId: 1 }));
      handle.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 220, pointerId: 1 }));
      fixture.detectChanges();
      expect(parseFloat(windowOf(root).style.left)).toBeCloseTo(left - 300);
      handle.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 220, pointerId: 1 }));

      expect(preference.stageWindow().x).toBeLessThan(1);
      expect(preference.stageWindow().y).toBeGreaterThan(0);
    });
  });
  describe('while motion is on', () => {
    let frames: FrameRequestCallback[];

    beforeEach(async () => {
      vi.useRealTimers();
      // The 2D context of happy-dom has no drawing functions; what is checked is what is placed.
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
      frames = [];
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.push(callback);
        return frames.length;
      });
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
      vi.spyOn(performance, 'now').mockReturnValue(1000);
      now = 1000;
      shown = new Map();
      drawsOverPage = true;
      motion.set(true);
      await TestBed.inject(EffectSceneLooksService).load();
    });

    /** Plays a scene and waits for the canvas over the stage to be made, as what makes it is loaded. */
    async function playMoving(played: BattleScene): Promise<BattleCutInOverlayComponent> {
      play(played);
      for (let turn = 0; turn < 5; turn++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
      return fixture.componentInstance;
    }

    let now: number;

    /** Runs the frames of the stage one after another, as a page drawing smoothly does, up to a time past its start. */
    function runFramesAt(elapsedMs: number): void {
      while (now < 1000 + elapsedMs) {
        now = Math.min(now + 16, 1000 + elapsedMs);
        for (const frame of frames.splice(0)) frame(now);
      }
      fixture.detectChanges();
    }

    /** Runs the next frame of the stage only after the page has stood still for a while. */
    function runFrameAfterWait(waitMs: number): void {
      now += waitMs;
      for (const frame of frames.splice(0)) frame(now);
      fixture.detectChanges();
    }

    const drawnIn = (frame: EffectFrame) => frame.motes.length + frame.ribbons.length + frame.floor.length;

    it('sounds the blow as the stage reaches it on its own clock, held still through a stall, not by the wall’s', async () => {
      const heard = vi.spyOn(SoundEffect, 'playLocal').mockImplementation(() => undefined);
      vi.spyOn(
        BattleCutInOverlayComponent.prototype as unknown as { soundsOf: (timeline: { impact: number }) => unknown },
        'soundsOf'
      ).mockImplementation((timeline) => [{ at: timeline.impact, identifier: 'the-blow' }]);
      const stage = await playMoving(scene({ effect: 'EffectPreset_burst_2', defeatEffect: '' }));
      const timeline = stage.timeline()!;

      runFramesAt(timeline.impact - 200);
      expect(heard).not.toHaveBeenCalled();
      // The page stands still past the blow's time on the wall clock; the stage holds the wait.
      runFrameAfterWait(1500);
      expect(heard).not.toHaveBeenCalled();

      runFramesAt(now - 1000 + 400);
      expect(heard).toHaveBeenCalledWith('the-blow', expect.anything());
    });

    it('draws the blow as on the table, its marks on the floor under the fighters and the rest over them', async () => {
      const stage = await playMoving(scene({ effect: 'EffectPreset_burst_2', defeatEffect: '' }));
      const timeline = stage.timeline()!;

      runFramesAt(timeline.impact + 100);

      const drawn = stage.sceneFrame();
      expect(drawn.motes.length).toBeGreaterThan(0);
      expect(drawn.floor.length).toBeGreaterThan(0);
      const under = shown.get('battle-floor-effects')!.at(-1)!;
      const over = shown.get('battle-effects')!.at(-1)!;
      expect(under.floor).toBe(drawn.floor);
      expect(drawnIn(under)).toBe(drawn.floor.length);
      expect(over.motes).toBe(drawn.motes);
      expect(over.ribbons).toBe(drawn.ribbons);
      expect(over.floor).toEqual([]);
      expect(stage.sprites()).toEqual([]);
    });

    it('cuts up the picture of one brought down over the stage, and draws the rest of it on the canvas', async () => {
      ImageStorage.instance.add({
        identifier: 'falling-goblin',
        name: 'goblin.webp',
        type: 'image/webp',
        blob: new Blob(['picture'], { type: 'image/webp' }),
        url: 'blob:falling-goblin',
        thumbnail: { type: '', blob: null, url: '' },
      });
      try {
        const played = scene({ defeatEffect: 'EffectPreset_defeat_dissolve' });
        const stage = await playMoving({
          ...played,
          defenders: [{ ...played.defenders[0], image: 'falling-goblin' }],
        });
        const timeline = stage.timeline()!;

        runFramesAt(timeline.defeatStart + 1000);

        const sprites = stage.sprites();
        expect(sprites.length).toBeGreaterThan(0);
        expect(sprites.every((sprite) => JSON.stringify([sprite.style, sprite.paint]).includes('url('))).toBe(true);
        expect(drawnIn(stage.sceneFrame())).toBeGreaterThan(0);
      } finally {
        ImageStorage.instance.delete('falling-goblin');
      }
    });

    it('stands still while the page does, so that the blow and the numbers it pops up are not passed over', async () => {
      const stage = await playMoving(scene({ effect: 'EffectPreset_burst_2', defeatEffect: '' }));
      const timeline = stage.timeline()!;
      runFramesAt(timeline.impact - 100);

      runFrameAfterWait(3000);
      const struckPops = () => stage.pops().filter((pop) => !pop.small);
      expect(stage.elapsed()).toBeLessThan(timeline.impact);
      expect(struckPops()).toEqual([]);
      runFramesAt(timeline.impact + 3000 - 100 + 200);

      expect(stage.elapsed()).toBeGreaterThan(timeline.impact);
      expect(struckPops()).toHaveLength(1);
    });

    it('plays on where the browser cannot make the canvases, the blow going undrawn', async () => {
      drawsOverPage = false;
      const stage = await playMoving(scene({ effect: 'EffectPreset_burst_2', defeatEffect: '' }));
      const timeline = stage.timeline()!;

      runFramesAt(timeline.impact + 100);

      expect(shown.size).toBe(0);
      expect(stage.sprites()).toEqual([]);
      expect(fixture.nativeElement.querySelectorAll('[data-testid="battle-figure-d-goblin"]')).toHaveLength(1);
    });
  });
});

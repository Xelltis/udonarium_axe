import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BattleScene } from '@axe/domain/battle/battle-scene';
import { BATTLE_STILL_MS } from '@axe/domain/battle/battle-timeline';
import { createEffectPreset, DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { BattleCutInOverlayComponent } from '@axe/features/battle-cut-in/battle-cut-in-overlay/battle-cut-in-overlay.component';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('BattleCutInOverlayComponent', () => {
  let fixture: ComponentFixture<BattleCutInOverlayComponent>;
  let state: BattleCutInStateService;
  const motion = signal(false);

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
      providers: [...TEST_PROVIDERS, { provide: MotionService, useValue: { enabled: motion } }],
    });
    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) createEffectPreset(seed, seed.identifier);
    state = TestBed.inject(BattleCutInStateService);
  });

  afterEach(() => {
    fixture?.destroy();
    state.clear();
    vi.useRealTimers();
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
});

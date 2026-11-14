import { TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { TargetBandComponent } from '@axe/features/tabletop/target-band/target-band.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';

describe('TargetBandComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TargetBandComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceOnTable(): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: 100, y: 100 };
    return piece;
  }

  async function band() {
    const fixture = TestBed.createComponent(TargetBandComponent);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('says nothing while no piece is aimed at', async () => {
    pieceOnTable();
    expect((await band()).host.querySelector('[data-testid="target-band"]')).toBeNull();
  });

  it('says how many are aimed at, a step above the band a move is worked out on and over every panel', async () => {
    const targets = TestBed.inject(PieceTargetService);
    targets.toggle(pieceOnTable());
    targets.toggle(pieceOnTable());
    const { host } = await band();

    const shown = host.querySelector<HTMLElement>('[data-testid="target-band"]')!;
    expect(shown).not.toBeNull();
    expect(host.querySelector('[data-testid="target-band-count"]')!.textContent).toContain('2');
    const classes = shown.className.split(/\s+/);
    expect(classes).toContain('fixed');
    expect(classes).toContain('bottom-40');
    expect(shown.style.zIndex).toBe(`${Z_TABLE_BANDS}`);
  });

  it('leaves a piece aimed at off the table uncounted', async () => {
    const targets = TestBed.inject(PieceTargetService);
    const away = pieceOnTable();
    away.location.name = 'graveyard';
    targets.toggle(away);

    expect((await band()).host.querySelector('[data-testid="target-band"]')).toBeNull();
  });

  it('takes every aim off at a press, and says nothing after', async () => {
    const targets = TestBed.inject(PieceTargetService);
    const one = pieceOnTable();
    const two = pieceOnTable();
    targets.toggle(one);
    targets.toggle(two);
    const { fixture, host } = await band();

    host.querySelector<HTMLButtonElement>('[data-testid="target-band-clear"]')!.click();
    await fixture.whenStable();

    expect(one.targeted).toBe(false);
    expect(two.targeted).toBe(false);
    expect(host.querySelector('[data-testid="target-band"]')).toBeNull();
  });

  describe('while an effect is held ready', () => {
    let preset: EffectPreset;
    let targeting: EffectTargetingService;

    beforeEach(() => {
      preset = new EffectPreset();
      preset.targeting = 'multi';
      preset.maxTargets = 2;
      ObjectStore.instance.add(preset, false);
      targeting = TestBed.inject(EffectTargetingService);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function shown(host: HTMLElement): HTMLElement | null {
      return host.querySelector<HTMLElement>('[data-testid="target-band"]');
    }

    function button(host: HTMLElement, name: string): HTMLButtonElement {
      return host.querySelector<HTMLButtonElement>(`[data-testid="target-band-${name}"]`)!;
    }

    it('is shown from the moment the effect is, with nothing aimed at, and goes when it is called off', async () => {
      pieceOnTable();
      const { fixture, host } = await band();
      expect(shown(host)).toBeNull();

      targeting.begin(preset);
      await fixture.whenStable();

      expect(shown(host)).not.toBeNull();
      expect(host.querySelector('[data-testid="target-band-count"]')!.textContent!.trim()).toBe('0/2');
      expect(button(host, 'fire').disabled).toBe(true);
      expect(button(host, 'cancel').disabled).toBe(false);

      targeting.cancel();
      await fixture.whenStable();
      expect(shown(host)).toBeNull();
    });

    it('keeps the same band, the same buttons in it, from no target to the limit', async () => {
      const one = pieceOnTable();
      const two = pieceOnTable();
      const { fixture, host } = await band();
      targeting.begin(preset);
      await fixture.whenStable();
      const before = shown(host)!;
      const outline = (element: HTMLElement) =>
        [...element.children].map((child) => `${child.tagName}.${child.className}`).join('|');
      const laidOut = outline(before);
      const count = host.querySelector<HTMLElement>('[data-testid="target-band-count"]')!;
      expect(count.className.split(/\s+/)).toEqual(expect.arrayContaining(['w-12', 'shrink-0', 'whitespace-nowrap']));

      for (const [piece, text] of [
        [one, '1/2'],
        [two, '2/2'],
      ] as const) {
        targeting.pick(piece.identifier);
        await fixture.whenStable();

        expect(shown(host)).toBe(before);
        expect(outline(shown(host)!)).toBe(laidOut);
        expect(count.textContent!.trim()).toBe(text);
        expect(button(host, 'fire').disabled).toBe(false);
      }
      expect(targeting.isPicking()).toBe(true);
    });

    it('casts once at a press of its button, and is left saying how many stay aimed at', async () => {
      const fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
      const piece = pieceOnTable();
      const { fixture, host } = await band();
      targeting.begin(preset);
      targeting.pick(piece.identifier);
      await fixture.whenStable();
      expect(fired).not.toHaveBeenCalled();

      button(host, 'fire').click();
      await fixture.whenStable();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(targeting.isPicking()).toBe(false);
      expect(piece.targeted).toBe(true);
      expect(shown(host)!.getAttribute('data-aiming')).toBeNull();
      expect(host.querySelector('[data-testid="target-band-fire"]')).toBeNull();
    });

    it('calls the effect off at a press of its button, putting the aims back as they were', async () => {
      const kept = pieceOnTable();
      const picked = pieceOnTable();
      TestBed.inject(PieceTargetService).toggle(kept);
      const { fixture, host } = await band();
      targeting.begin(preset);
      targeting.pick(picked.identifier);
      await fixture.whenStable();

      button(host, 'cancel').click();
      await fixture.whenStable();

      expect(targeting.isPicking()).toBe(false);
      expect([kept.targeted, picked.targeted]).toEqual([true, false]);
    });

    it('still takes every aim off, calling the effect off with it', async () => {
      const piece = pieceOnTable();
      const { fixture, host } = await band();
      targeting.begin(preset);
      targeting.pick(piece.identifier);
      await fixture.whenStable();

      button(host, 'clear').click();
      await fixture.whenStable();

      expect(targeting.isPicking()).toBe(false);
      expect(piece.targeted).toBe(false);
      expect(shown(host)).toBeNull();
    });

    it('gives the buttons that cast and call off a height a finger can press', async () => {
      const { fixture, host } = await band();
      targeting.begin(preset);
      await fixture.whenStable();

      for (const name of ['fire', 'cancel']) {
        expect(button(host, name).className.split(/\s+/)).toContain('min-h-11');
      }
    });
  });
});

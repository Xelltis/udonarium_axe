import { MAX_LIFT, MAX_SPREAD, MIN_SPREAD, panelTone, skinContrast, skinTokens } from '@axe/domain/ui/skin-palette';

const PLAIN = { hue: 82, chroma: 14, accentHue: 160, accentChroma: 30 };

describe('the colours a skin recipe makes', () => {
  it('sets every custom property the stylesheet reads', () => {
    const tokens = skinTokens(PLAIN, 'light');

    for (const name of [
      '--ui-bg',
      '--ui-surface',
      '--ui-elevated',
      '--ui-panel-bg',
      '--ui-panel-border',
      '--ui-titlebar-bg',
      '--ui-menu-bg',
      '--ui-text',
      '--ui-text-muted',
      '--ui-text-dim',
      '--ui-accent',
      '--ui-quote-bg',
      '--ui-danger',
      '--ui-success',
      '--ui-suit-black',
      '--ui-input-bg',
      '--ui-shadow-lg',
    ]) {
      expect(tokens[name]).toBeTruthy();
    }
  });

  it('lays the panel over the ground rather than beside it', () => {
    const tokens = skinTokens(PLAIN, 'light');

    expect(panelTone(tokens)).toBeGreaterThan(88);
    expect(skinContrast(tokens, '--ui-elevated', '--ui-bg')).toBeGreaterThan(1.2);
  });

  it('puts the ground under the panel on the dark ladder', () => {
    const light = panelTone(skinTokens(PLAIN, 'light'));
    const dark = panelTone(skinTokens(PLAIN, 'dark'));

    expect(dark).toBeLessThan(light);
  });

  it('makes a grey where the recipe asks for no colour', () => {
    const tokens = skinTokens({ hue: 0, chroma: 0, accentHue: 0, accentChroma: 0 }, 'light');
    const ground = tokens['--ui-bg'];

    expect(ground.slice(1, 3)).toBe(ground.slice(3, 5));
    expect(ground.slice(3, 5)).toBe(ground.slice(5, 7));
  });

  it('moves the surfaces together when it is lifted, and leaves the ink', () => {
    const flat = skinTokens(PLAIN, 'light');
    const lifted = skinTokens({ ...PLAIN, lift: MAX_LIFT }, 'light');

    expect(panelTone(lifted)).toBeGreaterThan(panelTone(flat));
    expect(lifted['--ui-text']).toBe(flat['--ui-text']);
  });

  it('reads a lift it could not honour as the furthest it may go', () => {
    const asked = skinTokens({ ...PLAIN, lift: 999 }, 'light');
    const allowed = skinTokens({ ...PLAIN, lift: MAX_LIFT }, 'light');

    expect(asked['--ui-bg']).toBe(allowed['--ui-bg']);
  });

  it('drops the ground away from the panels when it is spread, and leaves the panels', () => {
    const flat = skinTokens(PLAIN, 'light');
    const floating = skinTokens({ ...PLAIN, spread: MAX_SPREAD }, 'light');

    expect(skinContrast(floating, '--ui-elevated', '--ui-bg')).toBeGreaterThan(
      skinContrast(flat, '--ui-elevated', '--ui-bg')
    );
    expect(floating['--ui-elevated']).toBe(flat['--ui-elevated']);
  });

  it('still carries body text on a ground spread as far as it goes', () => {
    for (const mode of ['light', 'dark'] as const) {
      const tokens = skinTokens({ ...PLAIN, spread: MAX_SPREAD }, mode);
      expect(skinContrast(tokens, '--ui-text', '--ui-bg')).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lifts the ground above the panels when the spread is turned the other way', () => {
    const flat = skinTokens(PLAIN, 'light');
    const page = skinTokens({ ...PLAIN, spread: MIN_SPREAD }, 'light');

    expect(panelTone({ '--ui-elevated': page['--ui-bg'] })).toBeGreaterThan(
      panelTone({ '--ui-elevated': flat['--ui-bg'] })
    );
    expect(page['--ui-elevated']).toBe(flat['--ui-elevated']);
  });

  it('gives the titlebar its own colour where a skin asks for one', () => {
    const shared = skinTokens(PLAIN, 'light');
    const green = skinTokens({ ...PLAIN, titlebarHue: 150, titlebarChroma: 26 }, 'light');

    expect(green['--ui-titlebar-bg']).not.toBe(shared['--ui-titlebar-bg']);
    expect(green['--ui-elevated']).toBe(shared['--ui-elevated']);
  });

  it('draws the text in its own hue where the skin asks for one', () => {
    const shared = skinTokens(PLAIN, 'light');
    const maroon = skinTokens({ ...PLAIN, textHue: 38, textChroma: 45 }, 'light');

    expect(maroon['--ui-text']).not.toBe(shared['--ui-text']);
    expect(maroon['--ui-elevated']).toBe(shared['--ui-elevated']);
  });

  it('sets the surfaces further apart when it is asked for high contrast', () => {
    const normal = skinTokens(PLAIN, 'light');
    const high = skinTokens({ ...PLAIN, contrast: 'high' }, 'light');

    expect(skinContrast(high, '--ui-text', '--ui-elevated')).toBeGreaterThan(
      skinContrast(normal, '--ui-text', '--ui-elevated')
    );
  });

  it('keeps the black suits black on a light skin and lights them on a dark one', () => {
    expect(skinTokens(PLAIN, 'light')['--ui-suit-black']).toBe('#000000');
    expect(skinTokens(PLAIN, 'dark')['--ui-suit-black']).not.toBe('#000000');
  });
});

describe('what a skin has to be readable enough for', () => {
  const READING = 4.5;

  for (const mode of ['light', 'dark'] as const) {
    it(`carries body text, links and warnings over its own panel on the ${mode} ladder`, () => {
      const tokens = skinTokens(PLAIN, mode);

      expect(skinContrast(tokens, '--ui-text', '--ui-elevated')).toBeGreaterThanOrEqual(READING);
      expect(skinContrast(tokens, '--ui-text-muted', '--ui-elevated')).toBeGreaterThanOrEqual(READING);
      expect(skinContrast(tokens, '--ui-accent', '--ui-elevated')).toBeGreaterThanOrEqual(READING);
      expect(skinContrast(tokens, '--ui-danger', '--ui-elevated')).toBeGreaterThanOrEqual(READING);
    });
  }

  it('answers nothing for a colour it was never given', () => {
    expect(skinContrast(skinTokens(PLAIN, 'light'), '--ui-text', '--ui-nothing')).toBe(0);
  });
});

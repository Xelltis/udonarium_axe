import { TestBed } from '@angular/core/testing';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { chatBubbleBaseTone, resetChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { CUSTOM_SKIN, STANDARD_SKIN } from '@axe/domain/ui/skin';

const KEYS = ['ui-theme', 'ui-skin-light', 'ui-skin-dark', 'ui-skin-recipe-light', 'ui-skin-recipe-dark'];

function painted(name: string): string {
  return document.documentElement.style.getPropertyValue(name);
}

describe('SkinService', () => {
  function setup(): { skins: SkinService; theme: ThemeService } {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          media: query,
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );
    TestBed.configureTestingModule({ providers: [ThemeService, SkinService] });
    const theme = TestBed.inject(ThemeService);
    const skins = TestBed.inject(SkinService);
    TestBed.tick();
    return { skins, theme };
  }

  beforeEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    document.documentElement.removeAttribute('style');
    resetChatBubbleBaseTone();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    document.documentElement.removeAttribute('style');
    resetChatBubbleBaseTone();
  });

  it('paints nothing until a skin is chosen', () => {
    const { skins } = setup();

    expect(skins.current()).toBe(STANDARD_SKIN);
    expect(painted('--ui-bg')).toBe('');
  });

  it('paints the colours of the skin it is given', () => {
    const { skins } = setup();

    skins.choose('parchment');
    TestBed.tick();

    expect(skins.current()).toBe('parchment');
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
    expect(painted('--ui-accent')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('takes the colours back off when the standard one is chosen again', () => {
    const { skins } = setup();

    skins.choose('parchment');
    TestBed.tick();
    skins.choose(STANDARD_SKIN);
    TestBed.tick();

    expect(painted('--ui-bg')).toBe('');
    expect(painted('--ui-accent')).toBe('');
  });

  it('remembers the choice for each ladder on its own', () => {
    const { skins, theme } = setup();

    skins.choose('parchment', 'light');
    skins.choose('deepSea', 'dark');
    TestBed.tick();

    expect(localStorage.getItem('ui-skin-light')).toBe('parchment');
    expect(localStorage.getItem('ui-skin-dark')).toBe('deepSea');

    theme.theme.set('dark');
    TestBed.tick();

    expect(skins.current()).toBe('deepSea');
  });

  it('repaints when the light and dark switch moves', () => {
    const { skins, theme } = setup();

    skins.choose('parchment', 'light');
    skins.choose('deepSea', 'dark');
    theme.theme.set('light');
    TestBed.tick();
    const onLight = painted('--ui-bg');

    theme.theme.set('dark');
    TestBed.tick();

    expect(painted('--ui-bg')).not.toBe(onLight);
  });

  it('reads a skin this build no longer has as the standard one', () => {
    localStorage.setItem('ui-skin-light', 'a-skin-from-2029');
    const { skins } = setup();

    expect(skins.current()).toBe(STANDARD_SKIN);
    expect(painted('--ui-bg')).toBe('');
  });

  it('keeps the numbers of a skin a person built, and switches to it', () => {
    const { skins } = setup();

    skins.build({ hue: 200, chroma: 20, accentHue: 40, accentChroma: 50 });
    TestBed.tick();

    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(JSON.parse(localStorage.getItem('ui-skin-recipe-light')!).hue).toBe(200);
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('reads back the skin a person built the next time the app opens', () => {
    localStorage.setItem('ui-skin-light', CUSTOM_SKIN);
    localStorage.setItem(
      'ui-skin-recipe-light',
      JSON.stringify({ hue: 300, chroma: 18, accentHue: 90, accentChroma: 40 })
    );
    const { skins } = setup();

    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(skins.recipe().hue).toBe(300);
  });

  it('survives a recipe that is not a recipe', () => {
    localStorage.setItem('ui-skin-light', CUSTOM_SKIN);
    localStorage.setItem('ui-skin-recipe-light', 'not json at all');
    const { skins } = setup();

    expect(() => TestBed.tick()).not.toThrow();
    expect(skins.current()).toBe(CUSTOM_SKIN);
    expect(painted('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('moves the tone the chat bubbles are worked out against, and puts it back', () => {
    const { skins } = setup();
    const standard = chatBubbleBaseTone('light');

    skins.build({ hue: 82, chroma: 14, accentHue: 160, accentChroma: 30, lift: 10 });
    TestBed.tick();
    expect(chatBubbleBaseTone('light')).toBeGreaterThan(standard);

    skins.choose(STANDARD_SKIN);
    TestBed.tick();
    expect(chatBubbleBaseTone('light')).toBe(standard);
  });

  it('hands the picker the colours a skin would paint without painting them', () => {
    const { skins } = setup();

    expect(skins.preview('parchment', 'light')?.['--ui-bg']).toMatch(/^#[0-9a-f]{6}$/);
    expect(skins.preview(STANDARD_SKIN, 'light')).toBeNull();
    expect(painted('--ui-bg')).toBe('');
  });
});

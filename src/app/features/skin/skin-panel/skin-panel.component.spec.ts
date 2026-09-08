import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';
import { SkinPanelComponent } from '@axe/features/skin/skin-panel/skin-panel.component';

const KEYS = ['ui-theme', 'ui-skin-light', 'ui-skin-dark', 'ui-skin-recipe-light', 'ui-skin-recipe-dark'];

describe('SkinPanelComponent', () => {
  let fixture: ComponentFixture<SkinPanelComponent>;
  let skins: SkinService;

  function stageColour(name: string): string {
    return fixture.nativeElement.querySelector('[data-testid="skin-stage"]').style.getPropertyValue(name);
  }

  beforeEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    document.documentElement.removeAttribute('style');
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          media: query,
          matches: false,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        }) as unknown as MediaQueryList
    );

    TestBed.configureTestingModule({ imports: [SkinPanelComponent], providers: [ThemeService, SkinService] });
    skins = TestBed.inject(SkinService);
    fixture = TestBed.createComponent(SkinPanelComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('shows the standard colours before anything is chosen', () => {
    expect(stageColour('--ui-bg')).toBe(STANDARD_TOKENS.light['--ui-bg']);
  });

  it('follows the skin being dressed', () => {
    skins.choose('parchment', 'light');
    fixture.detectChanges();

    expect(stageColour('--ui-bg')).not.toBe(STANDARD_TOKENS.light['--ui-bg']);
    expect(stageColour('--ui-accent')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('shows the other ladder without the screen having to move to it', () => {
    skins.editLadder('dark');
    fixture.detectChanges();

    expect(stageColour('--ui-bg')).toBe(STANDARD_TOKENS.dark['--ui-bg']);
    expect(skins.mode()).toBe('light');
  });

  it('paints the stage and nothing outside it', () => {
    skins.editLadder('dark');
    skins.choose('deepSea', 'dark');
    fixture.detectChanges();

    expect(stageColour('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
    expect(document.documentElement.style.getPropertyValue('--ui-bg')).toBe('');
  });

  it('carries the picker, so a skin can be chosen from here', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="skin-picker"]')).toBeTruthy();
  });

  it('shows a skin under the pointer without putting it on', () => {
    const swatch = fixture.nativeElement.querySelector('[data-testid="skin-parchment"]');
    swatch.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();

    const tried = stageColour('--ui-bg');
    expect(tried).not.toBe(STANDARD_TOKENS.light['--ui-bg']);
    expect(skins.skinOf('light')).toBe('standard');
    expect(document.documentElement.style.getPropertyValue('--ui-bg')).toBe('');

    swatch.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(stageColour('--ui-bg')).toBe(STANDARD_TOKENS.light['--ui-bg']);
  });

  it('puts back what the seat was wearing when it opened', () => {
    skins.choose('parchment', 'light');
    skins.build({ hue: 300, chroma: 30, accentHue: 90, accentChroma: 40 }, 'dark');
    fixture.detectChanges();

    fixture.nativeElement.querySelector('[data-testid="skin-revert"]').click();
    fixture.detectChanges();

    expect(skins.skinOf('light')).toBe('standard');
    expect(skins.skinOf('dark')).toBe('standard');
    expect(document.documentElement.style.getPropertyValue('--ui-bg')).toBe('');
  });
});

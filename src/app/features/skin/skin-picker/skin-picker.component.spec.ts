import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { CUSTOM_SKIN, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { SkinPickerComponent } from '@axe/features/skin/skin-picker/skin-picker.component';

const PNG_HEAD = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function picture(): Blob {
  return new Blob([PNG_HEAD], { type: 'image/png' });
}

const KEYS = ['ui-theme', 'ui-skin-light', 'ui-skin-dark', 'ui-skin-recipe-light', 'ui-skin-recipe-dark'];

describe('SkinPickerComponent', () => {
  let fixture: ComponentFixture<SkinPickerComponent>;
  let skins: SkinService;

  function click(testId: string): void {
    fixture.nativeElement.querySelector(`[data-testid="${testId}"]`).click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
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

    TestBed.configureTestingModule({ imports: [SkinPickerComponent], providers: [ThemeService, SkinService] });
    skins = TestBed.inject(SkinService);
    fixture = TestBed.createComponent(SkinPickerComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.removeAttribute('style');
  });

  it('opens on the ladder that is showing, with the standard skin marked', () => {
    const standard = fixture.nativeElement.querySelector(`[data-testid="skin-${STANDARD_SKIN}"]`);

    expect(standard.getAttribute('aria-pressed')).toBe('true');
  });

  it('offers the light skins while the light ladder is being dressed', () => {
    expect(fixture.nativeElement.querySelector('[data-testid="skin-parchment"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="skin-deepSea"]')).toBeNull();
  });

  it('shows the other ladder when it is asked for, without changing what is on screen', () => {
    click('skin-ladder-dark');

    expect(fixture.nativeElement.querySelector('[data-testid="skin-deepSea"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[data-testid="skin-parchment"]')).toBeNull();
    expect(skins.mode()).toBe('light');
  });

  it('says what each ladder is wearing without switching to look', () => {
    skins.choose('parchment', 'light');
    skins.choose('deepSea', 'dark');
    fixture.detectChanges();

    const light = fixture.nativeElement.querySelector('[data-testid="skin-ladder-light"]').textContent;
    const dark = fixture.nativeElement.querySelector('[data-testid="skin-ladder-dark"]').textContent;

    expect(light).toContain('羊皮紙');
    expect(dark).toContain('深海');
  });

  it('puts a skin on when its swatch is pressed', () => {
    click('skin-parchment');

    expect(skins.skinOf('light')).toBe('parchment');
    expect(document.documentElement.style.getPropertyValue('--ui-bg')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('dresses the ladder being shown rather than the one on screen', () => {
    click('skin-ladder-dark');
    click('skin-deepSea');

    expect(skins.skinOf('dark')).toBe('deepSea');
    expect(skins.skinOf('light')).toBe(STANDARD_SKIN);
  });

  it('switches to the skin a person is building when a slider moves', () => {
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="skin-slider-hue"]');
    slider.value = '210';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(skins.skinOf('light')).toBe(CUSTOM_SKIN);
    expect(skins.recipeOf('light').hue).toBe(210);
  });

  it('makes a grey skin when the colour is taken all the way out', () => {
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="skin-slider-chroma"]');
    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const ground = document.documentElement.style.getPropertyValue('--ui-bg');
    expect(ground.slice(1, 3)).toBe(ground.slice(3, 5));
    expect(ground.slice(3, 5)).toBe(ground.slice(5, 7));
  });

  it('lists the stack the way it is drawn, topmost first', async () => {
    const { SkinImageStore } = await import('@axe/core/storage/skin-image-store');
    vi.spyOn(SkinImageStore.instance, 'put').mockResolvedValue(true);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:paper');
    await skins.addLayer(picture(), 'under.png');
    await skins.addLayer(picture(), 'over.png');
    fixture.detectChanges();

    const rows = [...fixture.nativeElement.querySelectorAll('[data-testid^="skin-layer-opacity-"]')];
    const names = [...fixture.nativeElement.querySelectorAll('.truncate')].map((n: HTMLElement) => n.textContent);

    expect(rows.length).toBe(2);
    expect(names.join(' ')).toContain('over.png');
    // The top row is the top of the stack, so it cannot be raised any further.
    expect(fixture.nativeElement.querySelector('[data-testid="skin-layer-up-0"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[data-testid="skin-layer-down-0"]').disabled).toBe(false);
  });

  it('sets the edges harder when it is asked to', () => {
    const box: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="skin-strong-edges"]');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(skins.recipeOf('light').contrast).toBe('high');
  });
});

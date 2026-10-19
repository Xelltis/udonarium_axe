import { ComponentFixture, TestBed } from '@angular/core/testing';
import { keyboardShortcutsOf, ShortcutSheetSection } from '@axe/domain/ui/keyboard-shortcuts';
import { UiShortcutSheetComponent } from '@axe/ui/components/shortcut-sheet/shortcut-sheet.component';

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

describe('UiShortcutSheetComponent', () => {
  let fixture: ComponentFixture<UiShortcutSheetComponent>;
  const planted: HTMLElement[] = [];

  const sections: ShortcutSheetSection[] = [
    { scope: 'tabletop', shortcuts: keyboardShortcutsOf('tabletop').filter((shortcut) => shortcut.id === 'target') },
    { scope: 'selection', shortcuts: keyboardShortcutsOf('selection').filter((shortcut) => shortcut.id !== 'add') },
  ];

  function render(): HTMLElement {
    fixture = TestBed.createComponent(UiShortcutSheetComponent);
    fixture.componentRef.setInput('sections', sections);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function sheetOf(element: HTMLElement): HTMLElement {
    return element.querySelector<HTMLElement>('[data-testid="shortcut-sheet"]')!;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UiShortcutSheetComponent] });
  });

  afterEach(() => {
    fixture?.destroy();
    for (const element of planted.splice(0)) element.remove();
  });

  it('lists each place under its own heading, its keys beside what they do', () => {
    const element = render();

    expect(element.querySelector('[data-testid="shortcut-sheet-tabletop"] h3')?.textContent?.trim()).toBe('卓');
    const lines = [...element.querySelectorAll('dt')].map((term) => [
      term.textContent?.trim(),
      term.nextElementSibling?.textContent?.trim(),
    ]);
    expect(lines[0]).toEqual(['T', '選んだキャラクターだけをターゲットにする']);
  });

  it('writes a click or a drag after the keys held for it', () => {
    const terms = [...render().querySelectorAll('[data-testid="shortcut-sheet-selection"] dt')].map((term) =>
      term.textContent?.trim()
    );

    expect(terms).toContain('ドラッグ');
    expect(terms).toContain('Shift+ドラッグ');
    expect(terms).toContain('Shift+Alt+クリック');
  });

  it('puts itself clear of what the guide writes', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1200);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const names = document.createElement('span');
    names.setAttribute('data-shortcut-sheet-avoid', '');
    names.getBoundingClientRect = () => rect(0, 0, 400, 800);
    document.body.appendChild(names);
    planted.push(names);

    const sheet = sheetOf(render());
    Object.defineProperty(sheet, 'offsetHeight', { value: 300 });
    await fixture.whenStable();
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(sheet.style.visibility).toBe('');
    expect(sheet.style.width).toBe('680px');
    expect(parseFloat(sheet.style.left)).toBeGreaterThanOrEqual(408);
  });

  it('lays itself out wide and short where only a band is left clear', async () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1280);
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const names = document.createElement('span');
    names.setAttribute('data-shortcut-sheet-avoid', '');
    names.getBoundingClientRect = () => rect(0, 0, 1280, 500);
    document.body.appendChild(names);
    planted.push(names);

    const sheet = sheetOf(render());
    Object.defineProperty(sheet, 'offsetHeight', { get: () => 300_000 / parseFloat(sheet.style.width) });
    await fixture.whenStable();
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(parseFloat(sheet.style.width)).toBeGreaterThan(960);
    expect(parseFloat(sheet.style.top)).toBeGreaterThanOrEqual(508);
  });
});

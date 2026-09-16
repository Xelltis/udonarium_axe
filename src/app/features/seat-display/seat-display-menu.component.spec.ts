import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LanguageService } from '@axe/application/i18n/language.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { SeatDisplayMenuComponent } from '@axe/features/seat-display/seat-display-menu.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('SeatDisplayMenuComponent', () => {
  let fixture: ComponentFixture<SeatDisplayMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeatDisplayMenuComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    PeerCursor.createMyCursor();
  });

  afterEach(() => {
    fixture?.destroy();
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  function render(): HTMLElement {
    fixture = TestBed.createComponent(SeatDisplayMenuComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function byTestId(host: HTMLElement, id: string): HTMLButtonElement {
    const found = host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
    if (!found) throw new Error(`no ${id}`);
    return found;
  }

  function pressed(host: HTMLElement, prefix: string): string[] {
    return [...host.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"][aria-pressed="true"]`)].map(
      (button) => button.dataset['testid']!
    );
  }

  it('marks the choice in force for every setting, as each service holds it', () => {
    TestBed.inject(ViewModePreferenceService).choose('flat');
    TestBed.inject(ThemeService).theme.set('dark');
    TestBed.inject(MotionService).set('off');
    TestBed.inject(RenderLiteService).set('on');
    const host = render();

    expect(pressed(host, 'seat-view-')).toEqual(['seat-view-flat']);
    expect(pressed(host, 'seat-theme-')).toEqual(['seat-theme-dark']);
    expect(pressed(host, 'seat-motion-')).toEqual(['seat-motion-off']);
    expect(pressed(host, 'seat-render-lite-')).toEqual(['seat-render-lite-on']);
    expect(pressed(host, 'seat-lang-')).toEqual([`seat-lang-${TestBed.inject(LanguageService).currentLang()}`]);
  });

  it('sets each setting to the choice pressed', () => {
    const host = render();

    byTestId(host, 'seat-view-perspective').click();
    byTestId(host, 'seat-theme-light').click();
    byTestId(host, 'seat-motion-on').click();
    byTestId(host, 'seat-render-lite-off').click();
    fixture.detectChanges();

    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('perspective');
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(TestBed.inject(MotionService).setting()).toBe('on');
    expect(TestBed.inject(RenderLiteService).setting()).toBe('off');
    expect(pressed(host, 'seat-theme-')).toEqual(['seat-theme-light']);
  });

  it('switches the language to the one pressed', () => {
    const setLang = vi.spyOn(TestBed.inject(LanguageService), 'setLang').mockResolvedValue();
    const host = render();

    byTestId(host, 'seat-lang-ko').click();

    expect(setLang).toHaveBeenCalledWith('ko');
  });

  it('says what auto has settled on only while auto is chosen', () => {
    TestBed.inject(ViewModePreferenceService).choose('auto');
    const host = render();
    expect(host.textContent).toMatch(/いまは (2D|3D)/);

    byTestId(host, 'seat-view-flat').click();
    fixture.detectChanges();
    expect(host.textContent).not.toMatch(/いまは/);
  });

  it('shows and hides each widget, and shows which are out', () => {
    const widgets = TestBed.inject(WidgetVisibilityService);
    const wasShown = widgets.clock();
    const host = render();
    const clock = byTestId(host, 'seat-widget-clock');
    expect(clock.getAttribute('aria-pressed')).toBe(String(wasShown));

    clock.click();
    fixture.detectChanges();

    expect(widgets.clock()).toBe(!wasShown);
    expect(clock.getAttribute('aria-pressed')).toBe(String(!wasShown));
  });

  it('offers the hotbar to a player but not to someone watching', () => {
    const host = render();
    expect(host.querySelector('[data-testid="seat-widget-hotbar"]')).not.toBeNull();

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="seat-widget-hotbar"]')).toBeNull();
    expect(host.querySelector('[data-testid="seat-widget-clock"]')).not.toBeNull();
  });

  it('offers the way back to the phone layout only on a narrow screen held on the desktop one', () => {
    vi.spyOn(TestBed.inject(ViewportService), 'isCompact').mockReturnValue(false);
    const mobile = TestBed.inject(MobileLayoutService);
    mobile.prefersDesktop.set(true);
    expect(render().querySelector('[data-testid="seat-use-mobile"]')).toBeNull();
    fixture.destroy();

    vi.spyOn(TestBed.inject(ViewportService), 'isCompact').mockReturnValue(true);
    const host = render();
    byTestId(host, 'seat-use-mobile').click();

    expect(mobile.prefersDesktop()).toBe(false);
  });

  it('asks to be closed on Escape, on its close button and on a press outside it', () => {
    const host = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    document.body.appendChild(host);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    host.querySelector<HTMLButtonElement>('ui-icon-button button')!.click();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(closed).toHaveBeenCalledTimes(3);
  });

  it('stays open for a press inside it, and leaves a press on its opener to the opener', () => {
    const host = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    document.body.appendChild(host);
    const opener = document.createElement('button');
    opener.setAttribute('data-seat-display-toggle', '');
    document.body.appendChild(opener);

    byTestId(host, 'seat-theme-dark').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    opener.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(closed).not.toHaveBeenCalled();
    opener.remove();
  });
});

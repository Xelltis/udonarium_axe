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

  function iconOf(button: HTMLElement): string {
    return button.querySelector('i')!.textContent!.trim();
  }

  it('shows each setting as the icon of the choice in force, named in its tooltip', () => {
    TestBed.inject(ViewModePreferenceService).choose('perspective');
    TestBed.inject(ThemeService).theme.set('dark');
    TestBed.inject(MotionService).set('off');
    TestBed.inject(RenderLiteService).set('on');
    const host = render();

    expect(iconOf(byTestId(host, 'seat-view'))).toBe('view_in_ar');
    expect(iconOf(byTestId(host, 'seat-theme'))).toBe('dark_mode');
    expect(byTestId(host, 'seat-theme').title).toBe('ダーク');
    expect(iconOf(byTestId(host, 'seat-motion'))).toBe('motion_photos_off');
    expect(byTestId(host, 'seat-motion').title).toBe('エフェクト: 停止');
    expect(iconOf(byTestId(host, 'seat-render-lite'))).toBe('blur_off');
    expect(byTestId(host, 'seat-lang').textContent!.trim()).toBe(
      TestBed.inject(LanguageService).currentLang().toUpperCase()
    );
  });

  it('moves each setting on to its next choice when pressed', () => {
    TestBed.inject(ViewModePreferenceService).choose('auto');
    TestBed.inject(ThemeService).theme.set('auto');
    TestBed.inject(MotionService).set('auto');
    TestBed.inject(RenderLiteService).set('auto');
    const host = render();

    byTestId(host, 'seat-view').click();
    byTestId(host, 'seat-theme').click();
    byTestId(host, 'seat-motion').click();
    byTestId(host, 'seat-render-lite').click();
    fixture.detectChanges();

    expect(TestBed.inject(ViewModePreferenceService).mode()).toBe('perspective');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
    expect(TestBed.inject(MotionService).setting()).toBe('on');
    expect(TestBed.inject(RenderLiteService).setting()).toBe('on');
    expect(iconOf(byTestId(host, 'seat-theme'))).toBe('dark_mode');
  });

  it('moves on to the next language when pressed', () => {
    const toggle = vi.spyOn(TestBed.inject(LanguageService), 'toggle').mockResolvedValue();
    const host = render();

    byTestId(host, 'seat-lang').click();

    expect(toggle).toHaveBeenCalledOnce();
  });

  it('names what auto has settled on while auto is chosen', () => {
    TestBed.inject(ViewModePreferenceService).choose('auto');
    const host = render();
    expect(byTestId(host, 'seat-view').title).toMatch(/自動（(2D|3D)）/);

    TestBed.inject(ViewModePreferenceService).choose('flat');
    fixture.detectChanges();
    expect(byTestId(host, 'seat-view').title).not.toMatch(/自動/);
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

  it('asks to be closed on Escape and on a press outside it', () => {
    const host = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    document.body.appendChild(host);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('stays open for a press inside it, and leaves a press on its opener to the opener', () => {
    const host = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    document.body.appendChild(host);
    const opener = document.createElement('button');
    opener.setAttribute('data-seat-display-toggle', '');
    document.body.appendChild(opener);

    byTestId(host, 'seat-theme').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    opener.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(closed).not.toHaveBeenCalled();
    opener.remove();
  });
});

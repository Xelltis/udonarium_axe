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
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { SeatDisplayMenuComponent, SeatMenuKind } from '@axe/features/seat-display/seat-display-menu.component';
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

  function render(kind: SeatMenuKind = 'display'): HTMLElement {
    fixture = TestBed.createComponent(SeatDisplayMenuComponent);
    fixture.componentRef.setInput('kind', kind);
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

  function nameOf(button: HTMLElement): string | null {
    return button.getAttribute('data-label');
  }

  it('shows each setting as the icon of the choice in force, named beside it', () => {
    TestBed.inject(ViewModePreferenceService).choose('perspective');
    TestBed.inject(ThemeService).theme.set('dark');
    TestBed.inject(MotionService).set('off');
    TestBed.inject(RenderLiteService).set('on');
    const host = render();

    expect(iconOf(byTestId(host, 'seat-view'))).toBe('view_in_ar');
    expect(iconOf(byTestId(host, 'seat-theme'))).toBe('dark_mode');
    expect(nameOf(byTestId(host, 'seat-theme'))).toBe('テーマ: ダーク');
    expect(iconOf(byTestId(host, 'seat-motion'))).toBe('motion_photos_off');
    expect(nameOf(byTestId(host, 'seat-motion'))).toBe('アニメーション: 停止');
    expect(iconOf(byTestId(host, 'seat-render-lite'))).toBe('blur_off');
    expect(byTestId(host, 'seat-lang').textContent!.trim()).toBe(
      TestBed.inject(LanguageService).currentLang().toUpperCase()
    );
  });

  it.each<SeatMenuKind>(['display', 'widgets'])(
    'names every button on the %s menu the way the drawer names its items, not with the slow browser tooltip',
    (kind) => {
      const host = render(kind);
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')];

      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(nameOf(button)).toBeTruthy();
        expect(button.getAttribute('aria-label')).toBe(nameOf(button));
        expect(button.hasAttribute('title')).toBe(false);
      }
    }
  );

  it('keeps the settings and the widgets each on their own menu', () => {
    const display = render('display');
    expect(display.querySelector('[data-testid="seat-display"]')).not.toBeNull();
    expect(display.querySelector('[data-testid="seat-theme"]')).not.toBeNull();
    expect(display.querySelector('[data-testid^="seat-widget-"]')).toBeNull();

    fixture.componentRef.setInput('kind', 'widgets');
    fixture.detectChanges();
    expect(display.querySelector('[data-testid="seat-widgets"]')).not.toBeNull();
    expect(display.querySelector('[data-testid="seat-widget-clock"]')).not.toBeNull();
    expect(display.querySelector('[data-testid="seat-theme"]')).toBeNull();
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

  it('opens the skins from the display menu, and asks to be closed behind them', () => {
    const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});
    const host = render('display');
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    byTestId(host, 'seat-skin').click();

    expect(open).toHaveBeenCalledWith('skin');
    expect(closed).toHaveBeenCalledOnce();
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
    expect(nameOf(byTestId(host, 'seat-view'))).toMatch(/自動（(2D|3D)）/);

    TestBed.inject(ViewModePreferenceService).choose('flat');
    fixture.detectChanges();
    expect(nameOf(byTestId(host, 'seat-view'))).not.toMatch(/自動/);
  });

  it('shows and hides each widget, and shows which are out', () => {
    const widgets = TestBed.inject(WidgetVisibilityService);
    const wasShown = widgets.clock();
    const host = render('widgets');
    const clock = byTestId(host, 'seat-widget-clock');
    expect(clock.getAttribute('aria-pressed')).toBe(String(wasShown));

    clock.click();
    fixture.detectChanges();

    expect(widgets.clock()).toBe(!wasShown);
    expect(clock.getAttribute('aria-pressed')).toBe(String(!wasShown));
  });

  it('offers the hotbar to a player but not to someone watching', () => {
    const host = render('widgets');
    expect(host.querySelector('[data-testid="seat-widget-hotbar"]')).not.toBeNull();

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="seat-widget-hotbar"]')).toBeNull();
    expect(host.querySelector('[data-testid="seat-widget-clock"]')).not.toBeNull();
  });

  it('offers each role the switch for its own toolbar, and someone watching neither', () => {
    const host = render('widgets');
    const setRole = (role: PeerRole) => {
      PeerCursor.myCursor.role = role;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      fixture.detectChanges();
    };
    const offered = () =>
      ['seat-widget-plToolbar', 'seat-widget-gmToolbar'].filter((id) => host.querySelector(`[data-testid="${id}"]`));

    setRole(PeerRole.Player);
    expect(offered()).toEqual(['seat-widget-plToolbar']);

    setRole(PeerRole.GameMaster);
    expect(offered()).toEqual(['seat-widget-gmToolbar']);

    setRole(PeerRole.Guest);
    expect(offered()).toEqual([]);
  });

  it('shows and hides the toolbar from its switch', () => {
    const widgets = TestBed.inject(WidgetVisibilityService);
    PeerCursor.myCursor.role = PeerRole.Player;
    const host = render('widgets');
    const toolbar = byTestId(host, 'seat-widget-plToolbar');
    expect(toolbar.getAttribute('aria-pressed')).toBe('true');

    toolbar.click();
    fixture.detectChanges();

    expect(widgets.plToolbar()).toBe(false);
    expect(toolbar.getAttribute('aria-pressed')).toBe('false');

    // Turning it back on writes the choice to the browser only once the effect behind it runs.
    widgets.togglePlToolbar();
    fixture.detectChanges();
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

  it('asks to be closed when its menu asks, as on Escape', () => {
    render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(closed).toHaveBeenCalledOnce();
  });
});

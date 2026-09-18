import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { OwnedCharacterListPanelComponent } from '@axe/features/pl-tools/owned-character-list/owned-character-list-panel.component';
import { PlToolbarComponent } from '@axe/features/pl-tools/pl-toolbar/pl-toolbar.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('PlToolbarComponent', () => {
  let component: PlToolbarComponent;
  let fixture: ComponentFixture<PlToolbarComponent>;
  let panelStub: { open: ReturnType<typeof vi.fn>; openLazy: ReturnType<typeof vi.fn> };
  let objectChange: ObjectChangeService;

  beforeEach(async () => {
    panelStub = { open: vi.fn(), openLazy: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PlToolbarComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    // The bar is a widget this seat can put away, and the choice is kept in the browser, so it is
    // said here rather than inherited from whatever ran before.
    TestBed.inject(WidgetVisibilityService).plToolbar.set(true);
    fixture = TestBed.createComponent(PlToolbarComponent);
    component = fixture.componentInstance;
    objectChange = TestBed.inject(ObjectChangeService);
    PeerCursor.createMyCursor();
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  function bar(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.pl-toolbar');
  }

  function setRole(role: PeerRole): void {
    PeerCursor.myCursor.role = role;
    objectChange.notifyChanged(PeerCursor.myCursor.identifier);
  }

  it('carries the buffs on every piece to the next display, and shows which one is on', () => {
    const preference = TestBed.inject(BuffViewPreferenceService);
    preference.set('icon');
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('[data-testid="buff-view-cycle"]') as HTMLButtonElement;

    expect(button.querySelector('i')!.textContent).toBe('bubble_chart');

    button.click();
    fixture.detectChanges();

    expect(preference.mode()).toBe('detail');
    expect(button.querySelector('i')!.textContent).toBe('format_list_bulleted');
    expect(button.title).toContain('詳細');
  });

  it('opens the list of the characters you own', async () => {
    (component as unknown as { openOwnedCharacterList: () => void }).openOwnedCharacterList();
    expect(panelStub.openLazy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ width: 420, height: 560 })
    );
    await expect(panelStub.openLazy.mock.calls[0][0]()).resolves.toBe(OwnedCharacterListPanelComponent);
  });

  it('opens that list from the range button, and no shape menu, while there is nothing to work on', async () => {
    const toolbar = component as unknown as { toggleRangeMenu: () => void; rangeOpen: () => boolean };

    toolbar.toggleRangeMenu();

    expect(toolbar.rangeOpen()).toBe(false);
    expect(panelStub.openLazy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ width: 420, height: 560 })
    );
    await expect(panelStub.openLazy.mock.calls[0][0]()).resolves.toBe(OwnedCharacterListPanelComponent);
  });

  it('shows the toolbar to a player alone', async () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()).not.toBeNull();

    setRole(PeerRole.GameMaster);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()).toBeNull();

    setRole(PeerRole.Guest);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()).toBeNull();
  });

  it('stays where it was dragged across a change of role', async () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = bar();
    expect(el).not.toBeNull();
    el!.style.left = '360px';
    el!.style.top = '240px';

    setRole(PeerRole.GameMaster);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()).toBeNull();

    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();

    const restored = bar();
    expect(restored).not.toBeNull();
    expect(restored!.style.left).toBe('360px');
    expect(restored!.style.top).toBe('240px');
  });

  it('hides from a player who turns it off in the widget menu, and comes back where it was', async () => {
    const widgets = TestBed.inject(WidgetVisibilityService);
    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();
    bar()!.style.left = '360px';

    widgets.togglePlToolbar();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()).toBeNull();

    widgets.togglePlToolbar();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(bar()!.style.left).toBe('360px');
    localStorage.removeItem('ui-widgets');
  });

  it('switches the resource bars and the buffs over the pieces off and on again', async () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();
    const overlay = TestBed.inject(PieceOverlayPreferenceService);
    const press = (id: string) =>
      (fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();

    try {
      press('toolbar-resource-bars');
      press('toolbar-buffs');
      expect(overlay.resourceBars()).toBe(false);
      expect(overlay.buffs()).toBe(false);

      press('toolbar-resource-bars');
      press('toolbar-buffs');
      expect(overlay.resourceBars()).toBe(true);
      expect(overlay.buffs()).toBe(true);
    } finally {
      localStorage.removeItem('ui-piece-overlay');
    }
  });

  it('carries none of the widget switches, which belong to the display settings', async () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    await fixture.whenStable();
    const icons = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ui-icon-button i')).map((icon) =>
      icon.textContent?.trim()
    );

    for (const widget of ['apps', 'schedule', 'radio_button_checked', 'network_check', 'play_circle']) {
      expect(icons).not.toContain(widget);
    }
  });

  describe('folding', () => {
    afterEach(() => localStorage.removeItem('ui-toolbars'));

    function tool(testId: string): HTMLElement | null {
      return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    }

    it('folds down to its title and opens again, and remembers which', async () => {
      setRole(PeerRole.Player);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(tool('buff-view-cycle')).not.toBeNull();

      tool('pl-toolbar-fold')!.click();
      fixture.detectChanges();

      expect(bar()).not.toBeNull();
      expect(bar()!.textContent).toContain('PLツール');
      expect(tool('buff-view-cycle')).toBeNull();
      expect(TestBed.inject(ToolbarFoldService).isFolded('pl')).toBe(true);

      tool('pl-toolbar-fold')!.click();
      fixture.detectChanges();

      expect(tool('buff-view-cycle')).not.toBeNull();
      expect(TestBed.inject(ToolbarFoldService).isFolded('pl')).toBe(false);
    });

    it('closes the range menu along with the bar', async () => {
      setRole(PeerRole.Player);
      fixture.detectChanges();
      await fixture.whenStable();
      const toolbar = component as unknown as { rangeOpen: { set: (open: boolean) => void; (): boolean } };
      toolbar.rangeOpen.set(true);

      tool('pl-toolbar-fold')!.click();
      tool('pl-toolbar-fold')!.click();

      expect(toolbar.rangeOpen()).toBe(false);
    });
  });
});

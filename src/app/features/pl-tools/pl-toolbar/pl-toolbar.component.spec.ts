import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { FIRST_PERSON_PIECE_STORAGE_KEY } from '@axe/application/ui/first-person-preference.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { parseMenuLayout } from '@axe/domain/ui/menu-layout';
import { ButtonGuideEventHandlerService } from '@axe/features/button-guide/button-guide-event-handler.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
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

  it('opens the inventory, which it carries from the start', () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});

    (fixture.nativeElement.querySelector('[data-testid="fab-entry-inventory"]') as HTMLButtonElement).click();

    expect(open).toHaveBeenCalledWith('inventory');
  });

  it('writes out the name of every button beside it while the guide is out, and only then', () => {
    setRole(PeerRole.Player);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ui-button-guide')).toBeNull();

    TestBed.inject(ButtonGuideService).show();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.pl-toolbar ui-button-guide')).toBeTruthy();
    const named = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.pl-toolbar [data-guide-label]'));
    expect(named.map((each) => each.getAttribute('data-guide-label'))).toContain('インベントリ');
    TestBed.inject(ButtonGuideService).hide();
  });

  describe('once somebody has put the guide on the bar', () => {
    afterEach(() => {
      TestBed.inject(ButtonGuideService).hide();
      TestBed.inject(MenuLayoutService).reset('plToolbar');
    });

    function arrange(): void {
      TestBed.inject(MenuLayoutService).save(
        'plToolbar',
        parseMenuLayout(
          JSON.stringify([
            { id: 'buttonGuide', command: 'buttonGuide', label: '操作ガイド' },
            { id: 'inventory', command: 'inventory', label: '持ち物' },
          ])
        )!
      );
      setRole(PeerRole.Player);
      fixture.detectChanges();
    }

    function guideButton(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('[data-testid="fab-entry-buttonGuide"]');
    }

    it('brings the guide out from the bar, and names what is on it by the names it was given', () => {
      arrange();

      guideButton().click();
      fixture.detectChanges();

      expect(TestBed.inject(ButtonGuideService).shown()).toBe(true);
      const named = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('.pl-toolbar [data-guide-label]'));
      expect(named.map((each) => each.getAttribute('data-guide-label'))).toEqual(
        expect.arrayContaining(['操作ガイド', '持ち物'])
      );
    });

    it('keeps the guide out when the button is pressed again, though the press puts it away first', () => {
      TestBed.inject(ButtonGuideEventHandlerService);
      arrange();
      const guide = TestBed.inject(ButtonGuideService);
      guide.show();
      TestBed.tick();

      guideButton().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      guideButton().click();

      expect(guide.shown()).toBe(true);
    });
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

  describe('looking out of a piece', () => {
    let table: GameTable;

    beforeEach(() => {
      localStorage.removeItem(FIRST_PERSON_PIECE_STORAGE_KEY);
      table = new GameTable();
      table.width = 12;
      table.height = 12;
      table.gridSize = 50;
      table.initialize();
      setRole(PeerRole.Player);
    });

    afterEach(() => localStorage.removeItem(FIRST_PERSON_PIECE_STORAGE_KEY));

    function pieceNamed(name: string): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.location = { name: 'table', x: 100, y: 100 };
      character.owner = PeerCursor.myCursor.userId;
      objectChange.notifyChanged(character.identifier);
      return character;
    }

    function button(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('[data-testid="first-person-enter"]') as HTMLButtonElement;
    }

    function seats(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="first-person-seat"]'));
    }

    it('goes straight in when the seat has one piece to look out of', async () => {
      const piece = pieceNamed('斥候');
      fixture.detectChanges();
      await fixture.whenStable();

      button().click();
      fixture.detectChanges();

      expect(TestBed.inject(FirstPersonService).piece()?.identifier).toBe(piece.identifier);
      expect(seats()).toHaveLength(0);
    });

    it('asks which piece when the seat has several', async () => {
      pieceNamed('斥候');
      pieceNamed('狩人');
      fixture.detectChanges();
      await fixture.whenStable();

      button().click();
      fixture.detectChanges();

      const first = TestBed.inject(FirstPersonService);
      expect(first.showing()).toBe(false);
      expect(seats().map((seat) => seat.textContent?.trim())).toEqual(['斥候', '狩人']);

      seats()[1].click();
      fixture.detectChanges();

      expect(first.piece()?.name).toBe('狩人');
      expect(seats()).toHaveLength(0);
    });

    it('refuses the press, and says why, while the seat has no piece on the table', async () => {
      fixture.detectChanges();
      await fixture.whenStable();

      expect(button().getAttribute('aria-disabled')).toBe('true');
      expect(button().title).toContain('見られるコマがいません');

      button().click();
      fixture.detectChanges();

      expect(TestBed.inject(FirstPersonService).showing()).toBe(false);
    });

    it('leaves the view again on the same button', async () => {
      const piece = pieceNamed('斥候');
      const first = TestBed.inject(FirstPersonService);
      first.enterSeat(piece.identifier);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(button().title).toBe('卓に戻る');

      button().click();
      fixture.detectChanges();

      expect(first.showing()).toBe(false);
    });

    async function sharedByGameMaster(): Promise<void> {
      const master = new PeerCursor();
      master.initialize();
      master.role = PeerRole.GameMaster;
      objectChange.notifyChanged(master.identifier);
      const piece = pieceNamed('斥候');
      table.sharedViewPiece = piece.identifier;
      objectChange.notifyChanged(table.identifier);
      fixture.detectChanges();
      await fixture.whenStable();
    }

    it('does not offer to leave a view the game master is holding everyone in', async () => {
      await sharedByGameMaster();

      const first = TestBed.inject(FirstPersonService);
      expect(first.forced()).toBe(true);
      expect(button().title).not.toBe('卓に戻る');

      button().click();
      fixture.detectChanges();

      expect(first.showing()).toBe(true);
    });

    it('stands the button down while the game master is sharing a view, and says so', async () => {
      await sharedByGameMaster();

      expect(button().getAttribute('aria-disabled')).toBe('true');
      expect(button().title).toBe('GM が共有中');
    });
  });
});

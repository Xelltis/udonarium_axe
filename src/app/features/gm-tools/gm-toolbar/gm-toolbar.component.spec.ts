import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GUEST_PERSONA, VisionService } from '@axe/application/tabletop/vision.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameObjectListPanelComponent } from '@axe/features/gm-object-list/game-object-list-panel.component';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { NpcBarService } from '@axe/features/gm-tools/npc-bar/npc-bar.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GmToolbarComponent', () => {
  let component: GmToolbarComponent;
  let fixture: ComponentFixture<GmToolbarComponent>;
  let panelStub: { open: ReturnType<typeof vi.fn>; openLazy: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    panelStub = { open: vi.fn(), openLazy: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [GmToolbarComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.overrideProvider(PanelService, { useValue: panelStub });
    // The bar is a widget this seat can put away, and the choice is kept in the browser, so it is
    // said here rather than inherited from whatever ran before.
    TestBed.inject(WidgetVisibilityService).gmToolbar.set(true);
    fixture = TestBed.createComponent(GmToolbarComponent);
    component = fixture.componentInstance;
  });

  it('switches the resource bars and the buffs over the pieces off and on again', async () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
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

  it('carries none of the widget switches, which belong to the display settings', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
    fixture.detectChanges();
    const icons = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ui-icon-button i')).map((icon) =>
      icon.textContent?.trim()
    );

    for (const widget of ['apps', 'schedule', 'radio_button_checked', 'network_check', 'play_circle']) {
      expect(icons).not.toContain(widget);
    }
  });

  it('leads with the object list and the non-player bar, then the party', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
    fixture.detectChanges();
    const icons = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('ui-icon-button i')).map((icon) =>
      icon.textContent?.trim()
    );

    expect(icons.slice(1, 4)).toEqual(['category', 'groups', 'group_work']);
  });

  it('offers no brush of its own, the painting having moved to the map editor', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="move-block-toggle"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="move-block-erase"]')).toBeNull();
  });

  it('opens the object list', async () => {
    (component as unknown as { openObjectList: () => void }).openObjectList();
    expect(panelStub.openLazy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ width: 460, height: 620 })
    );
    await expect(panelStub.openLazy.mock.calls[0][0]()).resolves.toBe(GameObjectListPanelComponent);
  });

  it('opens and closes the non-player bar', () => {
    const bar = TestBed.inject(NpcBarService);
    expect(bar.isOpen()).toBe(false);
    (component as unknown as { toggleNpcBar: () => void }).toggleNpcBar();
    expect(bar.isOpen()).toBe(true);
    (component as unknown as { toggleNpcBar: () => void }).toggleNpcBar();
    expect(bar.isOpen()).toBe(false);
  });

  it('takes up and puts down a players point of view', () => {
    const vision = TestBed.inject(VisionService);
    const persona = component as unknown as { selectPersona: (id: string | null) => void };

    expect(vision.previewAsUserId()).toBeNull();
    persona.selectPersona('player-1');
    expect(vision.previewAsUserId()).toBe('player-1');
    expect(vision.viewer().isGameMaster).toBe(false);

    persona.selectPersona(null);
    expect(vision.previewAsUserId()).toBeNull();
  });

  describe('looking as a guest', () => {
    afterEach(() => {
      for (const cursor of TestBed.inject(ObjectStore).getObjects<PeerCursor>(PeerCursor)) cursor.destroy();
      PeerCursor.myCursor = null!;
      TestBed.inject(VisionService).previewAsUserId.set(null);
    });

    function openPersonaMenu(): void {
      PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
      fixture.detectChanges();
      (component as unknown as { togglePersona: () => void }).togglePersona();
      fixture.detectChanges();
    }

    function peer(userId: string, role: PeerRole): void {
      const cursor = new PeerCursor(`cursor-${userId}`);
      cursor.userId = userId;
      cursor.name = userId;
      cursor.role = role;
      cursor.initialize();
    }

    it('is offered with nobody else in the room, as offline', () => {
      openPersonaMenu();
      const guest = fixture.nativeElement.querySelector('[data-testid="persona-guest"]') as HTMLElement;

      guest.click();

      const vision = TestBed.inject(VisionService);
      expect(vision.previewAsUserId()).toBe(GUEST_PERSONA);
      expect(vision.viewer().isGameMaster).toBe(false);
    });

    it('names itself on the bar while it is on', () => {
      openPersonaMenu();
      (fixture.nativeElement.querySelector('[data-testid="persona-guest"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.persona-dropdown')).toBeNull();
      expect(fixture.nativeElement.textContent).toContain('見学');
    });

    it('stands for every guest, so none of them is listed on their own', () => {
      peer('a-player', PeerRole.Player);
      peer('a-guest', PeerRole.Guest);
      openPersonaMenu();

      const listed = (fixture.nativeElement.querySelector('.persona-dropdown') as HTMLElement).textContent;
      expect(listed).toContain('a-player');
      expect(listed).not.toContain('a-guest');
    });
  });

  it('opens and closes that menu', () => {
    const persona = component as unknown as { togglePersona: () => void; personaOpen: () => boolean };
    expect(persona.personaOpen()).toBe(false);
    persona.togglePersona();
    expect(persona.personaOpen()).toBe(true);
  });

  describe('releaseOrphanedOwnership', () => {
    beforeEach(() => {});

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('releases what an absent owner holds, once confirmed', async () => {
      const card = Card.create('カード', 'front.png', 'back.png');
      card.owner = 'ghost-user';
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);

      await (component as unknown as { releaseOrphanedOwnership: () => Promise<void> }).releaseOrphanedOwnership();

      expect(card.owner).toBe('');
    });

    it('releases nothing when the confirmation is dismissed', async () => {
      const card = Card.create('カード', 'front.png', 'back.png');
      card.owner = 'ghost-user';
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);

      await (component as unknown as { releaseOrphanedOwnership: () => Promise<void> }).releaseOrphanedOwnership();

      expect(card.owner).toBe('ghost-user');
    });
  });

  describe('where the toolbar sits across a change of role', () => {
    let objectChange: ObjectChangeService;

    beforeEach(() => {
      objectChange = TestBed.inject(ObjectChangeService);
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.role = PeerRole.GameMaster;
    });

    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    function bar(): HTMLElement | null {
      return fixture.nativeElement.querySelector('.npc-bar-dropzone');
    }

    function setRole(role: PeerRole): void {
      PeerCursor.myCursor.role = role;
      objectChange.notifyChanged(PeerCursor.myCursor.identifier);
    }

    it('stays where it was dragged through a round trip of roles', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const el = bar();
      expect(el).not.toBeNull();

      el!.style.left = '480px';
      el!.style.top = '320px';

      setRole(PeerRole.Player);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(bar()).toBeNull();

      setRole(PeerRole.GameMaster);
      fixture.detectChanges();
      await fixture.whenStable();

      const restored = bar();
      expect(restored).not.toBeNull();
      expect(restored!.style.left).toBe('480px');
      expect(restored!.style.top).toBe('320px');
    });

    it('hides from the game master who turns it off in the widget menu, and comes back where it was', async () => {
      const widgets = TestBed.inject(WidgetVisibilityService);
      fixture.detectChanges();
      await fixture.whenStable();
      bar()!.style.left = '480px';

      widgets.toggleGmToolbar();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(bar()).toBeNull();

      widgets.toggleGmToolbar();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(bar()!.style.left).toBe('480px');
      localStorage.removeItem('ui-widgets');
    });
  });

  describe('folding', () => {
    afterEach(() => localStorage.removeItem('ui-toolbars'));

    function tool(testId: string): HTMLElement | null {
      return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
    }

    it('folds down to its title, keeping the player toolbar as it was, and opens again', () => {
      PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
      fixture.detectChanges();
      const tools = () => fixture.nativeElement.querySelectorAll('ui-icon-button').length;
      const open = tools();

      tool('gm-toolbar-fold')!.click();
      fixture.detectChanges();

      expect(tools()).toBe(1);
      expect(fixture.nativeElement.textContent).toContain('GMツール');
      expect(fixture.nativeElement.querySelector('app-npc-bar')).toBeNull();
      expect(TestBed.inject(ToolbarFoldService).isFolded('gm')).toBe(true);
      expect(TestBed.inject(ToolbarFoldService).isFolded('pl')).toBe(false);

      tool('gm-toolbar-fold')!.click();
      fixture.detectChanges();

      expect(tools()).toBe(open);
    });

    it('closes the persona list along with the bar', () => {
      PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
      fixture.detectChanges();
      const persona = component as unknown as { togglePersona: () => void; personaOpen: () => boolean };
      persona.togglePersona();

      tool('gm-toolbar-fold')!.click();

      expect(persona.personaOpen()).toBe(false);
    });
  });
});

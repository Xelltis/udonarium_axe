import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { Card } from '@axe/domain/card/card';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameObjectListPanelComponent } from '@axe/features/gm-object-list/game-object-list-panel.component';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { NpcBarService } from '@axe/features/gm-tools/npc-bar/npc-bar.service';
import { MapEditorPanelComponent } from '@axe/features/map-editor/editor/map-editor-panel.component';
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
    fixture = TestBed.createComponent(GmToolbarComponent);
    component = fixture.componentInstance;
  });

  it('brings a hidden recording widget back', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
    const widgets = TestBed.inject(WidgetVisibilityService);
    widgets.recording.set(false);
    fixture.detectChanges();

    const button = Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('radio_button_checked')
    )!;
    expect(button).toBeDefined();

    button.click();
    expect(widgets.recording()).toBe(true);
  });

  it('offers no brush of its own, the painting having moved to the map editor', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="move-block-toggle"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="move-block-erase"]')).toBeNull();
  });

  describe('the view everyone was put in', () => {
    let table: GameTable;

    beforeEach(() => {
      PeerCursor.myCursor = Object.assign(new PeerCursor('me'), { role: PeerRole.GameMaster });
      table = new GameTable();
      table.width = 12;
      table.height = 12;
      table.gridSize = 50;
      table.initialize();
    });

    function pieceNamed(name: string, owner = ''): GameCharacter {
      const character = GameCharacter.create(name, 1, '');
      character.location = { name: 'table', x: 100, y: 100 };
      character.owner = owner;
      return character;
    }

    function sharingButton(): HTMLButtonElement {
      return fixture.nativeElement.querySelector('[data-testid="first-person-share"]') as HTMLButtonElement;
    }

    function choices(): HTMLElement[] {
      return Array.from(fixture.nativeElement.querySelectorAll('[data-testid="first-person-share-choice"]'));
    }

    function stopEntry(): HTMLElement | null {
      return fixture.nativeElement.querySelector('[data-testid="first-person-share-stop"]');
    }

    it('lists the pieces on the table, saying which a player holds', () => {
      pieceNamed('冒険者', 'player-1');
      pieceNamed('門番');
      fixture.detectChanges();

      sharingButton().click();
      fixture.detectChanges();

      const listed = choices();
      expect(listed.map((entry) => entry.querySelector('span')?.textContent)).toEqual(['冒険者', '門番']);
      expect(listed[0].textContent).toContain('PL');
      expect(listed[1].textContent).not.toContain('PL');
    });

    it('puts everyone in the piece that was chosen', () => {
      const piece = pieceNamed('斥候', 'player-1');
      fixture.detectChanges();

      sharingButton().click();
      fixture.detectChanges();
      choices()[0].click();
      fixture.detectChanges();

      expect(table.sharedViewPiece).toBe(piece.identifier);
      expect(choices()).toHaveLength(0);
    });

    it('offers no way out while nobody has been put anywhere', () => {
      pieceNamed('門番');
      fixture.detectChanges();

      sharingButton().click();
      fixture.detectChanges();

      expect(stopEntry()).toBeNull();
    });

    it('lets everyone go, even when the piece named has left the table', () => {
      table.sharedViewPiece = 'gone';
      fixture.detectChanges();

      expect(sharingButton().title).toContain('卓にいません');

      sharingButton().click();
      fixture.detectChanges();
      stopEntry()!.click();

      expect(table.sharedViewPiece).toBe('');
    });
  });

  it('opens the object list', async () => {
    (component as unknown as { openObjectList: () => void }).openObjectList();
    expect(panelStub.openLazy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ width: 460, height: 620 })
    );
    await expect(panelStub.openLazy.mock.calls[0][0]()).resolves.toBe(GameObjectListPanelComponent);
  });

  it('opens the map editor', async () => {
    (component as unknown as { openMapEditor: () => void }).openMapEditor();
    expect(panelStub.openLazy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ width: 1100, height: 740 })
    );
    await expect(panelStub.openLazy.mock.calls[0][0]()).resolves.toBe(MapEditorPanelComponent);
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
  });
});

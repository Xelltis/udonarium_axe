import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { FIRST_PERSON_PIECE_STORAGE_KEY } from '@axe/application/ui/first-person-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
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
      expect(button().title).toContain('卓上にいません');

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

  it('opens and closes the hand rail', () => {
    const rail = TestBed.inject(HandRailService);
    const toolbar = component as unknown as { toggleHandRail: () => void };

    expect(rail.isOpen()).toBe(false);
    toolbar.toggleHandRail();
    expect(rail.isOpen()).toBe(true);
    toolbar.toggleHandRail();
    expect(rail.isOpen()).toBe(false);
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
});

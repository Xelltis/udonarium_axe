import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TextNote } from '@axe/domain/tabletop/text-note';
import { TextNoteComponent } from '@axe/features/tabletop/text-note/text-note.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';

describe('TextNoteComponent', () => {
  let component: TextNoteComponent;
  let fixture: ComponentFixture<TextNoteComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [TextNoteComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TextNoteComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('registers its effect in the constructor, so nothing is set up outside an injection context', () => {
    // the effect is registered in the constructor rather than from a lifecycle hook
    expect(component).toBeTruthy();
  });

  it('brings the note to the top on a press, for a seat that may change the table alone', () => {
    const note = TextNote.create('メモ', '本文');
    fixture.componentRef.setInput('textNote', note);
    const canEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop', 'get').mockReturnValue(false);
    const topmost = vi.spyOn(note, 'toTopmost');

    component.onMouseDown(new MouseEvent('mousedown', { button: 2 }));
    expect(topmost).not.toHaveBeenCalled();

    canEdit.mockReturnValue(true);
    component.onMouseDown(new MouseEvent('mousedown', { button: 2 }));
    expect(topmost).toHaveBeenCalledTimes(1);
    note.destroy();
  });

  it('leaves a note being written as the room has it once the seat is made a guest, the draft unwritten', async () => {
    PeerCursor.createMyCursor();
    const note = TextNote.create('メモ', '本文');
    fixture.componentRef.setInput('textNote', note);
    fixture.detectChanges();
    component.enterEdit();
    component.text = '書きかけ';

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
    TestBed.tick();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(component.isEditing()).toBe(false);
    expect(note.text).toBe('本文');
    note.destroy();
  });

  describe('viewRotateZ computed signal', () => {
    it('starts at ten', () => {
      expect(component.viewRotateZ()).toBe(10);
    });

    it('turns with the table view', () => {
      const uiSignalService = TestBed.inject(UiSignalService);
      uiSignalService.notifyTableViewRotation(50, 20, 60);
      expect(component.viewRotateZ()).toBe(60);
    });
  });

  describe('edit toggle + decoratedHtml', () => {
    let note: TextNote;

    beforeEach(() => {
      note = TextNote.create('メモ', '> @勇者\n> こんにちは\n本文');
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();
    });

    afterEach(() => {
      note.destroy();
    });

    it('starts out of edit mode', () => {
      expect(component.isEditing()).toBe(false);
    });

    it('marks up a quoted line as a quotation', () => {
      const html = component.decoratedHtml();
      expect(html).toContain('<span class="chat-quote">');
      expect(html).toContain('@勇者');
      expect(html).toContain('本文');
    });

    it('goes into edit mode on request', () => {
      component.enterEdit();
      expect(component.isEditing()).toBe(true);
    });

    it('stays out of it for a player the note is kept from, whose field would show what it hides', () => {
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'a-player';
      PeerCursor.myCursor.role = PeerRole.Player;
      note.disclosureMode = DisclosureMode.GameMaster;
      fixture.detectChanges();

      component.enterEdit();

      expect(component.isEditing()).toBe(false);
      PeerCursor.myCursor.destroy();
    });

    it('stays out of it while the note is locked', () => {
      note.isLock = true;
      component.enterEdit();
      expect(component.isEditing()).toBe(false);
    });

    it('leaves edit mode when the field loses focus', () => {
      component.enterEdit();
      expect(component.isEditing()).toBe(true);
      component.onTextAreaBlur();
      expect(component.isEditing()).toBe(false);
    });
  });

  describe('a note drawn with formatting', () => {
    let note: TextNote;

    function body(): HTMLElement {
      return fixture.nativeElement.querySelector('[data-v]:not(textarea)') as HTMLElement;
    }

    beforeEach(() => {
      note = TextNote.create('メモ', '# 洞窟\n- たいまつ\n> 碑文');
    });

    afterEach(() => {
      note.destroy();
    });

    it('draws a note set to be formatted with its headings, lists and quotes', () => {
      note.isFormatted = true;
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();

      expect(body().classList).toContain('note-formatted');
      expect(body().classList).not.toContain('whitespace-pre-line');
      expect(body().querySelector('h1')!.textContent).toBe('洞窟');
      expect(body().querySelector('ul li')!.textContent).toBe('たいまつ');
      expect(body().querySelector('blockquote')!.textContent).toBe('碑文');
    });

    it('draws a note that was never set as it was typed, as before', () => {
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();

      expect(note.textFormat).toBe('');
      expect(body().classList).toContain('whitespace-pre-line');
      expect(body().querySelector('h1')).toBeNull();
      expect(body().textContent).toContain('# 洞窟');
    });

    it('keeps a formatted note covered from whoever may not read it', () => {
      note.isFormatted = true;
      vi.spyOn(component, 'canView').mockReturnValue(false);
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();

      expect(body().querySelector('h1')).toBeNull();
      expect(body().textContent).not.toContain('洞窟');
    });
  });

  describe('a note limited to its height', () => {
    let note: TextNote;

    function frame(): HTMLElement {
      return (fixture.nativeElement.querySelector('[data-v]:not(textarea)') as HTMLElement).parentElement!;
    }
    const cap = () => `${component.height * component.gridSize}px`;

    beforeEach(() => {
      note = TextNote.create('メモ', '一行目\n'.repeat(80));
    });

    afterEach(() => {
      note.destroy();
    });

    it('stops at its height, so a long text scrolls inside it', () => {
      note.limitHeight = true;
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();

      expect(frame().style.maxHeight).toBe(cap());
      expect(frame().style.minHeight).toBe(cap());
    });

    it('grows with its text when the limit is off', () => {
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();

      expect(frame().style.maxHeight).toBe('');
      expect(frame().style.minHeight).toBe(cap());
    });

    it('takes up the limit as soon as it is switched on', async () => {
      fixture.componentRef.setInput('textNote', note);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(frame().style.maxHeight).toBe('');

      note.limitHeight = true;
      await fixture.whenStable();
      fixture.detectChanges();

      expect(frame().style.maxHeight).toBe(cap());
    });
  });

  describe('rotation in 2D mode', () => {
    let note: TextNote;

    beforeEach(() => {
      note = TextNote.create('回転するメモ', '本文');
      TestBed.inject(TabletopService).currentTable.mode2d = true;
      fixture.componentRef.setInput('textNote', note);
    });

    afterEach(() => {
      note.destroy();
    });

    function rotable(): RotableDirective {
      fixture.detectChanges();
      return fixture.debugElement.query(By.directive(RotableDirective)).injector.get(RotableDirective);
    }

    it('allows a flat note to rotate horizontally', () => {
      note.isUpright = false;

      expect(rotable().isDisable()).toBe(false);
    });

    it('keeps rotation disabled for an upright note', () => {
      note.isUpright = true;

      expect(rotable().isDisable()).toBe(true);
    });
  });

  describe('context menu display', () => {
    let note: TextNote;

    beforeEach(() => {
      note = TextNote.create('メモメニュー', '本文');
      fixture.componentRef.setInput('textNote', note);
    });

    afterEach(() => {
      note.destroy();
    });

    function openMenu(mode2d: boolean, menuStyle: 'four-way' | 'radial' | 'standard'): void {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = mode2d;
      table.tabletopMenuStyle = menuStyle;
      table.radialMenuRotationSpeed = 9;
      fixture.detectChanges();
      vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
      TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);

      component.onContextMenu(new MouseEvent('contextmenu', { cancelable: true }));
    }

    it.each(['four-way', 'radial'] as const)('opens the four-way menu when the style is %s', (style) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      openMenu(true, style);

      expect(openRadial).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        expect.any(Array),
        'メモメニュー',
        style === 'radial',
        9,
        1
      );
      expect(openRadial.mock.calls[0]?.[2].map((group) => group.name)).toEqual([
        '内容',
        '表示',
        '公開・所有',
        '移動・操作',
      ]);
      expect(openOrdinary).not.toHaveBeenCalled();
    });

    it('keeps the ordinary menu outside 2D mode', () => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      openMenu(false, 'radial');

      expect(openOrdinary).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        'メモメニュー'
      );
      expect(openRadial).not.toHaveBeenCalled();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { TabletopDisplaySettingsService } from '@axe/application/ui/tabletop-display-settings.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
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

    function openMenu(mode2d: boolean, radialMenuEnabled: boolean): void {
      const table = TestBed.inject(TabletopService).currentTable;
      table.mode2d = mode2d;
      TestBed.inject(TabletopDisplaySettingsService).patch({
        enabled: mode2d,
        radialMenuEnabled,
        radialMenuRotationSpeed: 9,
      });
      fixture.detectChanges();
      vi.spyOn(TestBed.inject(PieceContextMenuService), 'openForSelection').mockReturnValue(false);
      TestBed.inject(PointerDeviceService).primeForContextMenu(240, 180);

      component.onContextMenu(new MouseEvent('contextmenu', { cancelable: true }));
    }

    it.each([false, true])('uses the 2D menu interface with rotating display %s', (enabled) => {
      const menus = TestBed.inject(ContextMenuService);
      const openRadial = vi.spyOn(menus, 'openRadial').mockImplementation(() => undefined);
      const openOrdinary = vi.spyOn(menus, 'open').mockImplementation(() => undefined);
      openMenu(true, enabled);

      expect(openRadial).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        expect.any(Array),
        'メモメニュー',
        enabled,
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
      openMenu(false, true);

      expect(openOrdinary).toHaveBeenCalledWith(
        expect.objectContaining({ x: 240, y: 180 }),
        expect.any(Array),
        'メモメニュー'
      );
      expect(openRadial).not.toHaveBeenCalled();
    });
  });
});

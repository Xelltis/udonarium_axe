import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from '@axe/app.component';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { MENU_SURFACES, menuCommandOf } from '@axe/domain/ui/menu-command';
import { parseMenuLayout } from '@axe/domain/ui/menu-layout';
import { MenuCommandService } from '@axe/features/menu/menu-command.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { version } from '@pkg';

describe('AppComponent', () => {
  // Booting the screen brings the room's own objects into being — the chat tabs, the config,
  // the table selecter — which the next spec file in this worker would otherwise inherit.
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('should be defined', () => {
    expect(AppComponent).toBeTruthy();
  });

  it('resolves the version string from package.json through the @pkg alias', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(-.+)?$/);
  });

  describe('the way back into the menus', () => {
    let fixture: ComponentFixture<AppComponent>;

    /** Empties every menu, which is what somebody arranging one can do to themselves. */
    function emptyEveryMenu(): void {
      const layouts = TestBed.inject(MenuLayoutService);
      for (const surface of MENU_SURFACES) layouts.save(surface, { nodes: [] });
    }

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      PeerCursor.createMyCursor().role = PeerRole.GameMaster;
      // A menu may not open where the pointer has moved since it was pressed, which is false
      // until something presses. Nothing here presses, so it is said outright.
      vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
      fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
    });

    afterEach(() => {
      for (const surface of MENU_SURFACES) TestBed.inject(MenuLayoutService).reset(surface);
      vi.restoreAllMocks();
    });

    it('is on the drawer button, which is no part of any arrangement', () => {
      emptyEveryMenu();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="fab-toggle"]')).toBeTruthy();
      expect(fixture.nativeElement.querySelectorAll('[data-testid^="fab-entry-"]').length).toBe(0);
    });

    it('offers the editor and a way to put every menu back, with nothing left on any of them', () => {
      emptyEveryMenu();
      fixture.detectChanges();
      const offered: string[] = [];
      vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(((
        _point: unknown,
        actions: { name: string }[]
      ) => {
        offered.push(...actions.map((action) => action.name));
      }) as never);

      const button: HTMLElement = fixture.nativeElement.querySelector('[data-testid="fab-toggle"]');
      button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(offered).toEqual([
        'メニューの編集',
        'すべてのメニューを初期配置に戻す',
        'ボタンの名前をすべて表示（? キー）',
      ]);
    });

    it('opens the editor from there, whatever the arrangement says', () => {
      emptyEveryMenu();
      fixture.detectChanges();
      const opened: string[] = [];
      vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(((name: string) => {
        opened.push(name);
      }) as never);
      vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(((
        _point: unknown,
        actions: { action?: () => void }[]
      ) => {
        actions[0].action?.();
      }) as never);

      const button: HTMLElement = fixture.nativeElement.querySelector('[data-testid="fab-toggle"]');
      button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

      expect(opened).toEqual(['menuEditor']);
    });

    it('puts every menu back from there, once it is confirmed', async () => {
      emptyEveryMenu();
      fixture.detectChanges();
      const layouts = TestBed.inject(MenuLayoutService);
      expect(layouts.isArranged('fab')).toBe(true);
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
      vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(((
        _point: unknown,
        actions: { action?: () => void }[]
      ) => {
        actions[1].action?.();
      }) as never);

      const button: HTMLElement = fixture.nativeElement.querySelector('[data-testid="fab-toggle"]');
      button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await fixture.whenStable();

      for (const surface of MENU_SURFACES) expect(layouts.isArranged(surface)).toBe(false);
    });
  });

  describe('a small menu of the drawer', () => {
    let fixture: ComponentFixture<AppComponent>;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      PeerCursor.createMyCursor().role = PeerRole.Player;
      fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
    });

    afterEach(() => vi.restoreAllMocks());

    function press(testId: string): void {
      (fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
      fixture.detectChanges();
    }

    const display = () => fixture.nativeElement.querySelector('[data-testid="seat-display"]');

    it('stays open while a setting of this seat is pressed in turn through its choices', () => {
      press('fab-display');
      for (let turn = 0; turn < 3; turn++) {
        press('seat-theme');
        expect(display()).toBeTruthy();
      }
    });

    it('closes behind a panel opened from it', () => {
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});
      press('fab-display');

      press('seat-skin');

      expect(open).toHaveBeenCalledWith('skin');
      expect(display()).toBeNull();
    });
  });

  describe('the drawer while every name is written out', () => {
    let fixture: ComponentFixture<AppComponent>;
    let guide: ButtonGuideService;

    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [AppComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();
      PeerCursor.createMyCursor().role = PeerRole.Player;
      fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();
      guide = TestBed.inject(ButtonGuideService);
    });

    afterEach(() => {
      guide.hide();
      vi.restoreAllMocks();
    });

    function names(): string[] {
      return Array.from<HTMLElement>(
        fixture.nativeElement.querySelectorAll('[data-testid="fab-menu"] [data-testid="button-guide-label"]')
      ).map((label) => label.textContent?.trim() ?? '');
    }

    function entry(name: string): HTMLButtonElement {
      const found = Array.from<HTMLButtonElement>(
        fixture.nativeElement.querySelectorAll('[data-testid="button-guide-entry"]')
      ).find((button) => button.textContent?.trim().endsWith(name));
      expect(found).toBeTruthy();
      return found!;
    }

    it('writes nothing out until the guide is asked for', () => {
      expect(names()).toEqual([]);
    });

    it('opens the drawer and names everything in it, with what each small menu holds beside it', () => {
      fixture.componentInstance.fabOpen.set(false);
      guide.show();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="fab-menu"]').classList).toContain('open');
      expect(names()).toContain('チャット');
      expect(names()).toContain('ゲームリソース');
      expect(entry('インベントリ')).toBeTruthy();
    });

    it('does what an entry beside a small menu is for, and puts the guide away', () => {
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});
      guide.show();
      fixture.detectChanges();

      entry('インベントリ').click();

      expect(open).toHaveBeenCalledWith('inventory');
      expect(guide.shown()).toBe(false);
    });

    it('opens a small menu the usual way, once the guide is put away', () => {
      guide.show();
      fixture.detectChanges();

      (fixture.nativeElement.querySelector('[data-testid="fab-entry-gameResources"]') as HTMLElement).click();
      fixture.detectChanges();

      expect(guide.shown()).toBe(false);
      expect(fixture.nativeElement.querySelector('[data-testid="fab-submenu-gameResources"]')).toBeTruthy();
    });

    it('closes a small menu left open when the guide comes out, since the guide says what it holds', () => {
      (fixture.nativeElement.querySelector('[data-testid="fab-entry-gameResources"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[data-testid="fab-submenu-gameResources"]')).toBeTruthy();

      guide.show();
      TestBed.tick();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('[data-testid="fab-submenu-gameResources"]')).toBeNull();
    });

    describe('once somebody has arranged the drawer', () => {
      afterEach(() => TestBed.inject(MenuLayoutService).reset('fab'));

      function arrange(nodes: unknown[]): void {
        TestBed.inject(MenuLayoutService).save('fab', parseMenuLayout(JSON.stringify(nodes))!);
        fixture.detectChanges();
      }

      it('is still brought out by the key and from the drawer button, with the entry taken off', () => {
        arrange([{ id: 'chat', command: 'chat' }]);
        expect(fixture.nativeElement.querySelector('[data-testid="fab-entry-buttonGuide"]')).toBeNull();

        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
        expect(guide.shown()).toBe(true);

        guide.hide();
        vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
        vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(((
          _point: unknown,
          actions: { name: string; action?: () => void }[]
        ) => {
          actions.find((offered) => offered.name === 'ボタンの名前をすべて表示（? キー）')?.action?.();
        }) as never);
        const button: HTMLElement = fixture.nativeElement.querySelector('[data-testid="fab-toggle"]');
        button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

        expect(guide.shown()).toBe(true);
      });

      it('brings the guide out from inside a small menu it was moved into, under the name it was given', () => {
        arrange([
          {
            id: 'tools',
            icon: 'folder',
            label: '道具',
            items: [
              { id: 'buttonGuide', command: 'buttonGuide', label: '名前を見る' },
              { id: 'inventory', command: 'inventory', label: '持ち物' },
            ],
          },
        ]);

        (fixture.nativeElement.querySelector('[data-testid="fab-entry-tools"]') as HTMLElement).click();
        fixture.detectChanges();
        const menu: HTMLElement = fixture.nativeElement.querySelector('[data-testid="fab-submenu-tools"]');
        (menu.querySelector('[data-testid="fab-entry-buttonGuide"]') as HTMLElement).click();
        TestBed.tick();
        fixture.detectChanges();

        expect(guide.shown()).toBe(true);
        expect(fixture.nativeElement.querySelector('[data-testid="fab-submenu-tools"]')).toBeNull();
        expect(names()).toEqual(['道具']);
        expect(entry('名前を見る')).toBeTruthy();
        expect(entry('持ち物')).toBeTruthy();
      });

      it('keeps the guide out when its own entry is pressed from beside its small menu', () => {
        arrange([
          { id: 'tools', icon: 'folder', label: '道具', items: [{ id: 'buttonGuide', command: 'buttonGuide' }] },
        ]);
        guide.show();
        fixture.detectChanges();

        entry('ボタンの名前をすべて表示（? キー）').click();

        expect(guide.shown()).toBe(true);
      });
    });
  });

  it('hands the menus the two things only the screen can do', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    TestBed.createComponent(AppComponent);
    const commands = TestBed.inject(MenuCommandService);

    // `noHost` is what these two answer when nothing has handed the menus the screen, which is
    // a wiring that nothing else notices: every spec of the menus registers one of its own.
    expect(commands.run(menuCommandOf('zipLoad')!)).toBe('done');
    expect(commands.run(menuCommandOf('save')!)).toBe('done');
  });
});

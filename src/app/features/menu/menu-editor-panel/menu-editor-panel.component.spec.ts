import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DEFAULT_MENU_LAYOUTS } from '@axe/domain/ui/builtin-menu-layouts';
import { isMenuGroup, MenuGroup } from '@axe/domain/ui/menu-layout';
import { parentOfMenuNode } from '@axe/domain/ui/menu-layout-edit';
import { MenuEditorPanelComponent } from '@axe/features/menu/menu-editor-panel/menu-editor-panel.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MenuEditorPanelComponent', () => {
  let fixture: ComponentFixture<MenuEditorPanelComponent>;
  let layouts: MenuLayoutService;

  const KEYS = ['axe.menu.fab', 'axe.menu.gmToolbar', 'axe.menu.plToolbar'];

  function seatAs(role: PeerRole): void {
    PeerCursor.createMyCursor().role = role;
  }

  function query<T extends HTMLElement>(testId: string): T | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  function rowIds(): string[] {
    return Array.from<HTMLElement>(fixture.nativeElement.querySelectorAll('[data-testid^="menu-editor-row-"]')).map(
      (row) => row.dataset['testid']!.replace('menu-editor-row-', '')
    );
  }

  function dragEvent(name: string, clientY = 0): Event {
    const fired = new Event(name, { bubbles: true, cancelable: true });
    Object.defineProperty(fired, 'clientY', { value: clientY });
    Object.defineProperty(fired, 'dataTransfer', {
      value: { effectAllowed: '', setDragImage: vi.fn(), setData: vi.fn() },
    });
    return fired;
  }

  /** Drags one row onto the upper or lower half of another, the way a pointer would. */
  async function drag(from: string, onto: string, side: 'before' | 'after'): Promise<void> {
    const target = query(`menu-editor-row-${onto}`)!;
    Object.defineProperty(target, 'getBoundingClientRect', { value: () => ({ top: 100, height: 20 }) });

    query(`menu-editor-grip-${from}`)!.dispatchEvent(dragEvent('dragstart'));
    target.dispatchEvent(dragEvent('dragover', side === 'after' ? 115 : 105));
    await settle();
    target.dispatchEvent(dragEvent('drop'));
    await settle();
  }

  function nodeIds(): string[] {
    return layouts
      .layoutOf('fab')()
      .nodes.map((node) => node.id);
  }

  /** Hands the panel a file the way the picker would. */
  async function readFile(file: File): Promise<void> {
    const input = query<HTMLInputElement>('menu-editor-file')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await settle();
    await settle();
  }

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    for (const key of KEYS) localStorage.removeItem(key);
    await TestBed.configureTestingModule({
      imports: [MenuEditorPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    layouts = TestBed.inject(MenuLayoutService);
    for (const surface of ['fab', 'gmToolbar', 'plToolbar'] as const) layouts.reset(surface);
    fixture = TestBed.createComponent(MenuEditorPanelComponent);
    seatAs(PeerRole.GameMaster);
    await settle();
  });

  afterEach(() => {
    for (const key of KEYS) localStorage.removeItem(key);
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  it('lists the drawer as it came, its small menus opened out beneath them', async () => {
    expect(rowIds().slice(0, 4)).toEqual(['peerMenu', 'chat', 'roomSettings', 'table']);
    expect(rowIds()).toContain('mapEditor');
  });

  it('puts a command on the menu, and keeps it', async () => {
    const choice: HTMLElement = fixture.nativeElement.querySelector('[data-testid^="menu-command-choice-"]');
    choice.click();
    await settle();

    expect(layouts.isArranged('fab')).toBe(true);
    expect(layouts.layoutOf('fab')().nodes.length).toBe(DEFAULT_MENU_LAYOUTS.fab.nodes.length + 1);
  });

  it('takes an entry off the menu', async () => {
    query<HTMLButtonElement>('menu-editor-remove-chat')!.click();
    await settle();

    expect(rowIds()).not.toContain('chat');
    expect(
      layouts
        .layoutOf('fab')()
        .nodes.map((node) => node.id)
    ).not.toContain('chat');
  });

  it('puts an entry in order when it is dragged past another', async () => {
    await drag('peerMenu', 'chat', 'after');

    expect(nodeIds().slice(0, 2)).toEqual(['chat', 'peerMenu']);
  });

  it('carries an entry into a small menu when it is dropped under its head', async () => {
    await drag('chat', 'table', 'after');

    expect(parentOfMenuNode(layouts.layoutOf('fab')(), 'chat')).toBe('table');
    expect(nodeIds()).not.toContain('chat');
  });

  it('carries an entry back out when it is dropped beside one on the menu itself', async () => {
    await drag('mapEditor', 'peerMenu', 'before');

    expect(parentOfMenuNode(layouts.layoutOf('fab')(), 'mapEditor')).toBeNull();
    expect(nodeIds()[0]).toBe('mapEditor');
  });

  it('will not carry a small menu into one of its own entries', async () => {
    await drag('table', 'mapEditor', 'after');
    expect(layouts.isArranged('fab')).toBe(false);

    await drag('table', 'peerMenu', 'before');

    expect(nodeIds()[0]).toBe('table');
  });

  it('calls an entry what somebody types', async () => {
    const name = query<HTMLInputElement>('menu-editor-name-chat')!;
    name.value = 'おしゃべり';
    name.dispatchEvent(new Event('input'));
    await settle();

    expect(
      layouts
        .layoutOf('fab')()
        .nodes.find((node) => node.id === 'chat')
    ).toMatchObject({
      label: 'おしゃべり',
    });
  });

  it('gives an entry another mark from the ones the picker offers', async () => {
    const choice = query('menu-editor-icon-chat')!.querySelector<HTMLElement>('[role="option"]')!;
    const mark = choice.title;

    choice.click();
    await settle();

    expect(
      layouts
        .layoutOf('fab')()
        .nodes.find((node) => node.id === 'chat')
    ).toMatchObject({ icon: mark });
  });

  it('takes a mark back off an entry, leaving it to wear its own again', async () => {
    query('menu-editor-icon-chat')!.querySelector<HTMLElement>('[role="option"]')!.click();
    await settle();
    expect(
      layouts
        .layoutOf('fab')()
        .nodes.find((node) => node.id === 'chat')
    ).toHaveProperty('icon');

    query<HTMLButtonElement>('menu-editor-icon-chat')!
      .querySelector<HTMLElement>('[data-testid="icon-picker-clear"]')!
      .click();
    await settle();

    expect(
      layouts
        .layoutOf('fab')()
        .nodes.find((node) => node.id === 'chat')
    ).not.toHaveProperty('icon');
  });

  it('makes an empty small menu, named for now and renamed in its own row', async () => {
    query<HTMLButtonElement>('menu-editor-add-group')!.click();
    await settle();

    const made = layouts.layoutOf('fab')().nodes.filter(isMenuGroup) as MenuGroup[];
    const fresh = made.find((group) => group.label === '新しい小窓');
    expect(fresh?.items).toEqual([]);

    const name = query<HTMLInputElement>(`menu-editor-name-${fresh!.id}`)!;
    name.value = 'よく使う';
    name.dispatchEvent(new Event('input'));
    await settle();

    expect(
      (layouts.layoutOf('fab')().nodes.filter(isMenuGroup) as MenuGroup[]).some((group) => group.label === 'よく使う')
    ).toBe(true);
  });

  it('puts the menu back the way it came once it is confirmed', async () => {
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    query<HTMLButtonElement>('menu-editor-remove-chat')!.click();
    await settle();
    expect(layouts.isArranged('fab')).toBe(true);

    query<HTMLButtonElement>('menu-editor-reset')!.click();
    await settle();

    expect(layouts.isArranged('fab')).toBe(false);
    expect(rowIds()).toContain('chat');
  });

  it('leaves the menu alone when the confirmation is dismissed', async () => {
    vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    query<HTMLButtonElement>('menu-editor-remove-chat')!.click();
    await settle();

    query<HTMLButtonElement>('menu-editor-reset')!.click();
    await settle();

    expect(layouts.isArranged('fab')).toBe(true);
  });

  it('has nothing to put back before anything has been arranged', () => {
    expect(query<HTMLButtonElement>('menu-editor-reset')!.disabled).toBe(true);
  });

  it("offers a master their own bar and not a player's", () => {
    expect(query('menu-editor-surface-gmToolbar')).toBeTruthy();
    expect(query('menu-editor-surface-plToolbar')).toBeNull();
  });

  it("offers a player their own bar and not the master's", async () => {
    seatAs(PeerRole.Player);
    await settle();

    expect(query('menu-editor-surface-plToolbar')).toBeTruthy();
    expect(query('menu-editor-surface-gmToolbar')).toBeNull();
  });

  it('offers a watcher the drawer alone', async () => {
    seatAs(PeerRole.Guest);
    await settle();

    expect(query('menu-editor-surface-fab')).toBeTruthy();
    expect(query('menu-editor-surface-gmToolbar')).toBeNull();
    expect(query('menu-editor-surface-plToolbar')).toBeNull();
  });

  describe('carrying an arrangement to another screen', () => {
    it('has nothing to write out before anything has been arranged', () => {
      expect(query<HTMLButtonElement>('menu-editor-write-out')!.disabled).toBe(true);
    });

    it('offers to write out once a menu has been arranged', async () => {
      query<HTMLButtonElement>('menu-editor-remove-chat')!.click();
      await settle();

      expect(query<HTMLButtonElement>('menu-editor-write-out')!.disabled).toBe(false);
    });

    it('takes the arrangements out of a file that holds them', async () => {
      const file = new File(['{"axeMenus":1,"layouts":{"fab":[{"id":"a","command":"jukebox"}]}}'], 'menus.json');

      await readFile(file);

      expect(
        layouts
          .layoutOf('fab')()
          .nodes.map((node) => node.id)
      ).toEqual(['a']);
      expect(query('menu-editor-failed')).toBeNull();
    });

    it('says so and changes nothing when the file holds no arrangement', async () => {
      await readFile(new File(['not an arrangement'], 'menus.json'));

      expect(layouts.isArranged('fab')).toBe(false);
      expect(query('menu-editor-failed')).toBeTruthy();
    });

    it('leaves alone the menus the file says nothing about', async () => {
      query<HTMLButtonElement>('menu-editor-surface-gmToolbar')!.click();
      await settle();
      query<HTMLButtonElement>('menu-editor-remove-darkness')!.click();
      await settle();
      const bar = layouts.layoutOf('gmToolbar')().nodes.length;

      await readFile(new File(['{"axeMenus":1,"layouts":{"fab":[{"id":"a","command":"jukebox"}]}}'], 'menus.json'));

      expect(layouts.layoutOf('gmToolbar')().nodes.length).toBe(bar);
    });
  });

  it('offers to make a small menu on the drawer alone, the bars having nowhere to open one', async () => {
    expect(query('menu-editor-add-group')).toBeTruthy();

    query<HTMLButtonElement>('menu-editor-surface-gmToolbar')!.click();
    await settle();

    expect(query('menu-editor-add-group')).toBeNull();
  });

  it('arranges the bar it is switched to, and not the one it left', async () => {
    query<HTMLButtonElement>('menu-editor-surface-gmToolbar')!.click();
    await settle();

    query<HTMLButtonElement>('menu-editor-remove-darkness')!.click();
    await settle();

    expect(layouts.isArranged('gmToolbar')).toBe(true);
    expect(layouts.isArranged('fab')).toBe(false);
  });
});

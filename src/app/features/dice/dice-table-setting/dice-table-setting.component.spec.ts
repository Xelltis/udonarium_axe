import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DiceTableSettingComponent } from '@axe/features/dice/dice-table-setting/dice-table-setting.component';
import { expectPanelDragRecovery, PanelDragTestHostComponent } from '@axe/testing/panel-drag-recovery';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DiceTableSettingComponent', () => {
  let component: DiceTableSettingComponent;
  let fixture: ComponentFixture<DiceTableSettingComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DiceTableSettingComponent, PanelDragTestHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DiceTableSettingComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lets the panel take the pointer again once the drag ends', async () => {
    await expectPanelDragRecovery(DiceTableSettingComponent);
  });

  describe('a seat that is only watching', () => {
    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, identifier: 'seat-cursor' } as PeerCursor;
    }

    it('makes no table', () => {
      beSeat(PeerRole.Guest);

      component.createDiceTable();

      expect(component.getDiceTables()).toHaveLength(0);
    });

    it('leaves a table where it is', () => {
      beSeat(PeerRole.Player);
      component.createDiceTable();
      const made = component.selectedTable!;
      beSeat(PeerRole.Guest);

      component.delete();

      expect(component.getDiceTables().map((table) => table.identifier)).toContain(made.identifier);
    });

    it('rewrites none of what a table answers', () => {
      beSeat(PeerRole.Player);
      component.createDiceTable();
      const table = component.selectedTable!;
      table.name = 'もとの名前';
      table.text = 'もとの表';
      beSeat(PeerRole.Guest);

      component.setTableName('あとの名前');
      component.setTableDice('1d100');
      component.setTableCommand('AFTER');
      component.tableText = 'あとの表';

      expect(table.name).toBe('もとの名前');
      expect(table.text).toBe('もとの表');
      expect(component.isWritable).toBe(false);
    });

    it('is not let into the palette to edit it', () => {
      beSeat(PeerRole.Player);
      component.createDiceTable();
      beSeat(PeerRole.Guest);

      component.toggleEditMode();

      expect(component.isEdit()).toBe(false);
    });

    async function drawn(): Promise<{ names: string[]; add: HTMLButtonElement | null }> {
      fixture.detectChanges();
      await fixture.whenStable();
      const icons = [...(fixture.nativeElement as HTMLElement).querySelectorAll('i.material-icons')];
      return {
        names: icons.map((icon) => icon.textContent?.trim() ?? ''),
        add: (icons.find((icon) => icon.textContent?.trim() === 'add')?.closest('button') ??
          null) as HTMLButtonElement | null,
      };
    }

    it('draws neither the way in nor the way out', async () => {
      beSeat(PeerRole.Guest);

      const { names, add } = await drawn();

      expect(add?.disabled).toBe(true);
      expect(names).not.toContain('delete');
    });

    it('draws both for a player', async () => {
      beSeat(PeerRole.Player);
      component.createDiceTable();

      const { names, add } = await drawn();

      expect(add?.disabled).toBe(false);
      expect(names).toContain('delete');
    });
  });

  describe('throwing a table away', () => {
    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'seat-cursor' } as PeerCursor;
    });

    afterEach(() => {
      for (const table of component.getDiceTables()) table.destroy();
      vi.restoreAllMocks();
    });

    function answer(yes: boolean) {
      return vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(yes);
    }

    it('asks first, naming the table, and keeps it on a no', async () => {
      component.createDiceTable();
      const made = component.selectedTable!;
      made.name = '遭遇表';
      const ask = answer(false);

      await component.delete();

      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('遭遇表'), okLabel: '削除', danger: true })
      );
      expect(component.getDiceTables()).toContain(made);
    });

    it('throws it away for everyone on a yes', async () => {
      component.createDiceTable();
      const made = component.selectedTable!;
      answer(true);

      await component.delete();

      expect(component.getDiceTables()).not.toContain(made);
    });

    it('keeps both when another table was picked while the question was open', async () => {
      component.createDiceTable();
      const first = component.selectedTable!;
      component.createDiceTable();
      const second = component.selectedTable!;
      component.selectedTable = first;
      vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockImplementation(async () => {
        component.selectedTable = second;
        return true;
      });

      await component.delete();

      expect(component.getDiceTables()).toEqual(expect.arrayContaining([first, second]));
    });
  });

  describe('setting up and tearing down', () => {
    it('returns an empty game type with no table selected', () => {
      component.selectedTable = null;
      expect(component.gameType()).toBe('');
    });

    it('returns an empty name', () => {
      component.selectedTable = null;
      expect(component.tableName()).toBe('');
    });

    it('returns an empty dice bot', () => {
      component.selectedTable = null;
      expect(component.tableDice()).toBe('');
    });

    it('returns an empty command', () => {
      component.selectedTable = null;
      expect(component.tableCommand()).toBe('');
    });

    it('returns an empty text', () => {
      component.selectedTable = null;
      expect(component.tableText).toBe('');
    });

    it('returns no palettes', () => {
      component.selectedTable = null;
      expect(component.palettes()).toEqual([]);
    });

    it('toggles the edit mode without throwing', () => {
      component.selectedTable = null;
      expect(() => component.toggleEditMode()).not.toThrow();
    });

    it('toggles it twice without throwing', () => {
      component.selectedTable = null;
      expect(() => {
        component.toggleEditMode();
        component.toggleEditMode();
      }).not.toThrow();
    });
  });

  describe('reacting to the synchronised fields', () => {
    // The change channel fires in a batch on a microtask, so a write is flushed before it is read.
    it('takes a command edited by another peer', async () => {
      const table = DiceTable.create();
      try {
        table.command = 'first';
        component.selectedTable = table;
        await Promise.resolve();
        const v1 = component.tableCommand();

        table.command = 'second';
        await Promise.resolve();
        const v2 = component.tableCommand();

        expect({ v1, v2 }).toEqual({ v1: 'first', v2: 'second' });
      } finally {
        table.destroy();
      }
    });

    it('recomputes the palettes when one changes', async () => {
      const table = DiceTable.create();
      try {
        component.selectedTable = table;
        await Promise.resolve();
        const initial = component.palettes();
        expect(initial.length).toBeGreaterThan(0);

        const palette = table.diceTablePalette!;
        palette.setPalette('1:新エントリ');
        palette.update();
        await Promise.resolve();

        expect(component.palettes()).toEqual(['1:新エントリ']);
      } finally {
        table.destroy();
      }
    });
  });

  describe('making and editing a table from the panel', () => {
    beforeEach(() => {
      PeerCursor.myCursor = { role: PeerRole.Player, identifier: 'seat-cursor' } as PeerCursor;
      for (const table of component.getDiceTables()) table.destroy();
    });

    afterEach(() => {
      for (const table of component.getDiceTables()) table.destroy();
    });

    /** Draws the panel and lets what ngModel writes into its boxes settle. */
    async function drawn(): Promise<HTMLElement> {
      fixture.detectChanges();
      await fixture.whenStable();
      return fixture.nativeElement as HTMLElement;
    }

    /** The button of the panel whose words are exactly the label. */
    function buttonNamed(host: HTMLElement, label: string): HTMLButtonElement | undefined {
      return [...host.querySelectorAll('button')].find(
        (button) => button.textContent?.replace(/^\s*(edit|check)/, '').trim() === label
      );
    }

    it('says there is no table yet, and makes the first one from the button under that', async () => {
      const host = await drawn();
      expect(host.textContent).toContain('ダイス表がありません');

      buttonNamed(host, '表を作成')!.click();
      await drawn();

      expect(component.getDiceTables()).toHaveLength(1);
      expect(host.querySelector('input[name="dice-table-name"]')).not.toBeNull();
      expect(host.textContent).not.toContain('ダイス表がありません');
    });

    it('makes another table from the add button at the head of the list, and picks it', async () => {
      component.createDiceTable();
      const first = component.selectedTable!;
      const host = await drawn();

      host.querySelector<HTMLButtonElement>('button[title="新しい表を作る"]')!.click();

      expect(component.getDiceTables()).toHaveLength(2);
      expect(component.selectedTable).not.toBe(first);
    });

    it('writes the title, the dice and the command typed into their boxes onto the table', async () => {
      component.createDiceTable();
      const table = component.selectedTable!;
      const host = await drawn();

      for (const [name, value] of [
        ['dice-table-name', '暴走表'],
        ['dice-table-dice', '2d6'],
        ['dice-table-command', 'runaway'],
      ]) {
        const box = host.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
        box.value = value;
        box.dispatchEvent(new Event('input'));
      }

      expect([table.name, table.dice, table.command]).toEqual(['暴走表', '2d6', 'runaway']);
    });

    it('opens the entries for editing with the edit button, saying so, and closes them with confirm', async () => {
      component.createDiceTable();
      let host = await drawn();
      expect(host.textContent).not.toContain('編集中');

      buttonNamed(host, '編集')!.click();
      host = await drawn();

      expect(host.textContent).toContain('編集中');
      expect(host.querySelector('textarea[name="dice-table-palette"]')).not.toBeNull();
      expect(buttonNamed(host, '編集')).toBeUndefined();

      buttonNamed(host, '確定')!.click();
      host = await drawn();

      expect(host.textContent).not.toContain('編集中');
      expect(host.querySelector('textarea[name="dice-table-palette"]')).toBeNull();
      expect(buttonNamed(host, '編集')).toBeDefined();
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopDisplayPreferenceService } from '@axe/application/ui/tabletop-display-preference.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { CutInListComponent } from '@axe/features/media/cut-in-list/cut-in-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInListComponent', () => {
  let component: CutInListComponent;
  let fixture: ComponentFixture<CutInListComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInListComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  let table: GameTable;

  beforeEach(() => {
    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(CutInListComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => table.destroy());

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('a seat that is only watching', () => {
    function beSeat(role: PeerRole): void {
      PeerCursor.myCursor = { role, identifier: 'seat-cursor' } as PeerCursor;
    }

    it('makes no cut-in', () => {
      beSeat(PeerRole.Guest);

      component.createCutIn();

      expect(component.getCutIns()).toHaveLength(0);
    });

    it('throws none away', () => {
      beSeat(PeerRole.Player);
      component.createCutIn();
      const made = component.selectedCutIn!;
      beSeat(PeerRole.Guest);

      component.delete();

      expect(component.getCutIns().map((cutIn) => cutIn.identifier)).toContain(made.identifier);
    });

    it('is handed the editors with nothing to change', () => {
      beSeat(PeerRole.Player);
      component.createCutIn();
      expect(component.isEditable).toBe(true);

      beSeat(PeerRole.Guest);

      expect(component.isEditable).toBe(false);
      expect(component.canEditCutIns).toBe(false);
    });

    async function drawnIcons(): Promise<string[]> {
      fixture.detectChanges();
      await fixture.whenStable();
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('i.material-icons')].map(
        (icon) => icon.textContent?.trim() ?? ''
      );
    }

    it('draws neither the way in nor the way out', async () => {
      beSeat(PeerRole.Guest);

      const icons = await drawnIcons();

      expect(icons).not.toContain('add');
      expect(icons).not.toContain('delete');
    });

    it('draws both for a player', async () => {
      beSeat(PeerRole.Player);
      component.createCutIn();

      const icons = await drawnIcons();

      expect(icons).toContain('add');
      expect(icons).toContain('delete');
    });
  });

  describe('how many ways a cut-in faces', () => {
    it('writes the choice to this screen, which is the one the cut-in is watched on', () => {
      component.multiDirectionMode = 'four-directions';

      expect(component.multiDirectionMode).toBe('four-directions');
      expect(TestBed.inject(TabletopDisplayPreferenceService).own().cutInMultiDirectionMode).toBe('four-directions');
      expect(table.cutInMultiDirectionMode).toBe('none');
    });

    it('shows what the table asks for until this screen is told otherwise', () => {
      table.cutInMultiDirectionMode = 'vertical';

      expect(component.multiDirectionMode).toBe('vertical');
    });

    it('reads a mode it does not know as facing one way', () => {
      component.multiDirectionMode = 'sideways' as never;

      expect(component.multiDirectionMode).toBe('none');
    });
  });
});

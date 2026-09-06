import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
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

  beforeEach(() => {
    fixture = TestBed.createComponent(CutInListComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('how many ways a cut-in faces', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      table.destroy();
    });

    it('writes the choice onto the table, which is what everyone around it watches', () => {
      component.multiDirectionMode = 'four-directions';

      expect(table.cutInMultiDirectionMode).toBe('four-directions');
      expect(TestBed.inject(TabletopService).currentTable.cutInMultiDirectionMode).toBe('four-directions');
    });

    it('keeps the choice to this screen once the reader takes it over', () => {
      table.cutInMultiDirectionMode = 'vertical';

      component.onThisScreenOnly = true;
      component.multiDirectionMode = 'four-directions';

      expect(component.multiDirectionMode).toBe('four-directions');
      expect(table.cutInMultiDirectionMode).toBe('vertical');

      component.onThisScreenOnly = false;

      expect(component.multiDirectionMode).toBe('vertical');
    });

    it('reads a mode it does not know as facing one way', () => {
      component.multiDirectionMode = 'sideways' as never;

      expect(table.cutInMultiDirectionMode).toBe('none');
    });
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SeatDisplayPreferenceService } from '@axe/application/ui/seat-display-preference.service';
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

  describe('how many ways a cut-in faces', () => {
    it('writes the choice to this screen, which is the one the cut-in is watched on', () => {
      component.multiDirectionMode = 'four-directions';

      expect(component.multiDirectionMode).toBe('four-directions');
      expect(TestBed.inject(SeatDisplayPreferenceService).own().cutInMultiDirectionMode).toBe('four-directions');
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

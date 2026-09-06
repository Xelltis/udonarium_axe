import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Config } from '@axe/domain/peer/config';
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
    it('writes the choice to the room, which is what everyone around the screen watches', () => {
      component.multiDirectionMode = 'four-directions';

      expect(Config.instance.tabletopDisplayAnswers.cutInMultiDirectionMode).toBe('four-directions');
    });

    it('keeps the choice to this screen once the reader takes it over', () => {
      component.multiDirectionMode = 'vertical';

      component.onThisScreenOnly = true;
      component.multiDirectionMode = 'four-directions';

      expect(component.multiDirectionMode).toBe('four-directions');
      expect(Config.instance.tabletopDisplayAnswers.cutInMultiDirectionMode).toBe('vertical');

      component.onThisScreenOnly = false;

      expect(component.multiDirectionMode).toBe('vertical');
    });

    it('reads a mode it does not know as facing one way', () => {
      component.multiDirectionMode = 'sideways' as never;

      expect(component.multiDirectionMode).toBe('none');
    });
  });
});

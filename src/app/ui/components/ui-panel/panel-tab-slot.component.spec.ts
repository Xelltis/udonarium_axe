import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { PanelTabSlotComponent } from '@axe/ui/components/ui-panel/panel-tab-slot.component';

describe('PanelTabSlotComponent', () => {
  let fixture: ComponentFixture<PanelTabSlotComponent>;

  function ground(): HTMLElement {
    return fixture.nativeElement.querySelector('div') as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelTabSlotComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    fixture = TestBed.createComponent(PanelTabSlotComponent);
  });

  it('stands the ground where the bar leaves off', () => {
    fixture.componentRef.setInput('top', '28px');
    fixture.detectChanges();

    expect(ground().style.top).toBe('28px');
    expect(ground().style.padding).toBe('8px');
  });

  it('shows what it holds while it is the panel being looked at', () => {
    fixture.detectChanges();

    expect(ground().style.display).toBe('');
  });

  it('keeps what it holds standing when another panel is looked at instead', () => {
    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();

    expect(ground().style.display).toBe('none');
  });

  it('lets what it holds spill out of it when it is asked to', () => {
    fixture.componentRef.setInput('overflowVisible', true);
    fixture.detectChanges();

    expect(ground().style.overflow).toBe('visible');
  });

  it('offers somewhere for a panel to be built', () => {
    fixture.detectChanges();

    expect(fixture.componentInstance.content()).toBeTruthy();
    expect(fixture.componentInstance.scrollable().nativeElement).toBe(ground());
  });
});

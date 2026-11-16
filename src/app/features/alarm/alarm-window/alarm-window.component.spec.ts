import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlarmWindowComponent } from '@axe/features/alarm/alarm-window/alarm-window.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AlarmWindowComponent', () => {
  let component: AlarmWindowComponent;
  let fixture: ComponentFixture<AlarmWindowComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AlarmWindowComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(AlarmWindowComponent);
    component = fixture.componentInstance;
  });

  it('shows the title and the time it was opened with, needing no alarm in the room', () => {
    component.title = '休憩';
    component.time = '30';
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('休憩');
    expect(text).toContain('30');
  });
});

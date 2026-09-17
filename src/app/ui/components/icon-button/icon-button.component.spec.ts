import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';

describe('UiIconButtonComponent', () => {
  let fixture: ComponentFixture<UiIconButtonComponent>;

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UiIconButtonComponent] });
    fixture = TestBed.createComponent(UiIconButtonComponent);
    fixture.componentRef.setInput('icon', 'schedule');
    fixture.componentRef.setInput('label', 'Clock');
    fixture.detectChanges();
  });

  it('shows the icon and names itself for the pointer and the reader', () => {
    expect(button().querySelector('i')!.textContent?.trim()).toBe('schedule');
    expect(button().title).toBe('Clock');
    expect(button().getAttribute('data-testid')).toBeNull();
  });

  it('says it was pressed', () => {
    const pressed: MouseEvent[] = [];
    fixture.componentInstance.press.subscribe((event) => pressed.push(event));
    button().click();
    expect(pressed).toHaveLength(1);
  });

  it('lights up while active, and can be dimmed or faded', () => {
    expect(button().classList.contains('text-ui-accent')).toBe(false);
    fixture.componentRef.setInput('active', true);
    fixture.componentRef.setInput('dim', true);
    fixture.componentRef.setInput('faded', true);
    fixture.componentRef.setInput('testId', 'probe');
    fixture.detectChanges();
    expect(button().classList.contains('text-ui-accent')).toBe(true);
    expect(button().classList.contains('bg-ui-accent-bg')).toBe(true);
    expect(button().classList.contains('text-ui-dim')).toBe(true);
    expect(button().classList.contains('opacity-45')).toBe(true);
    expect(button().getAttribute('data-testid')).toBe('probe');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelBarButtonComponent } from '@axe/ui/components/ui-panel/panel-bar-button.component';

describe('PanelBarButtonComponent', () => {
  let fixture: ComponentFixture<PanelBarButtonComponent>;

  function button(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('button');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PanelBarButtonComponent] });
    fixture = TestBed.createComponent(PanelBarButtonComponent);
    fixture.componentRef.setInput('icon', 'close');
    fixture.componentRef.setInput('label', '閉じる');
    fixture.detectChanges();
  });

  it('shows the icon and names itself for the pointer and the reader', () => {
    expect(button().querySelector('i')!.textContent?.trim()).toBe('close');
    expect(button().querySelector('i')!.getAttribute('aria-hidden')).toBe('true');
    expect(button().title).toBe('閉じる');
    expect(button().getAttribute('aria-label')).toBe('閉じる');
    expect(button().getAttribute('data-testid')).toBeNull();
    expect(button().hasAttribute('aria-pressed')).toBe(false);
    expect(button().disabled).toBe(false);
  });

  it('says it was pressed', () => {
    const pressed = vi.fn();
    fixture.componentInstance.press.subscribe(pressed);
    button().click();
    expect(pressed).toHaveBeenCalledTimes(1);
  });

  it('says whether the switch it stands for is on', () => {
    fixture.componentRef.setInput('active', true);
    fixture.detectChanges();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    expect(button().classList.contains('text-ui-accent!')).toBe(true);

    fixture.componentRef.setInput('active', false);
    fixture.detectChanges();
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(button().classList.contains('text-ui-accent!')).toBe(false);
  });

  it('can be found by a test id, grown for a thumb, and held back', () => {
    fixture.componentRef.setInput('testId', 'panel-rotate-90');
    fixture.componentRef.setInput('compact', true);
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    expect(button().getAttribute('data-testid')).toBe('panel-rotate-90');
    expect(button().classList.contains('size-10!')).toBe(true);
    expect(button().disabled).toBe(true);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { PanelTabStripComponent } from '@axe/ui/components/ui-panel/panel-tab-strip.component';

describe('PanelTabStripComponent', () => {
  let fixture: ComponentFixture<PanelTabStripComponent>;

  function pills(): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLElement[];
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelTabStripComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    fixture = TestBed.createComponent(PanelTabStripComponent);
    fixture.componentRef.setInput('tabs', ['Chat', 'Sheet']);
    fixture.componentRef.setInput('active', 1);
    fixture.detectChanges();
  });

  it('names every panel the frame holds', () => {
    expect(pills().map((pill) => pill.querySelector('span')?.textContent)).toEqual(['Chat', 'Sheet']);
  });

  it('marks the one being looked at', () => {
    expect(pills().map((pill) => pill.getAttribute('aria-selected'))).toEqual(['false', 'true']);
  });

  it('says which one was pressed', () => {
    let chosen = -1;
    fixture.componentInstance.chose.subscribe((index) => (chosen = index));

    pills()[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

    expect(chosen).toBe(0);
  });

  it('says which one was asked to go, without choosing it as well', () => {
    let closed = -1;
    let chosen = -1;
    fixture.componentInstance.closed.subscribe((index) => (closed = index));
    fixture.componentInstance.chose.subscribe((index) => (chosen = index));

    const clear = fixture.nativeElement.querySelector('[data-testid="panel-tab-clear-0"]') as HTMLElement;
    clear.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    clear.click();

    expect(closed).toBe(0);
    expect(chosen).toBe(-1);
  });

  it('keeps a drag on it from taking the frame with it', () => {
    const strip = fixture.nativeElement.querySelector('[role="tablist"]') as HTMLElement;

    expect(strip.classList.contains('panel-no-drag')).toBe(true);
  });
});

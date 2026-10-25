import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';

@Component({
  selector: 'text-tooltip-host',
  template: `<span class="truncate" [appTextTooltip]="name">{{ name }}</span>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [TextTooltipDirective],
})
class TextTooltipHostComponent {
  name = 'とても長い名前のBGM（戦闘・ボス・第二形態）.mp3';
}

describe('TextTooltipDirective', () => {
  let fixture: ComponentFixture<TextTooltipHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextTooltipHostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(TextTooltipHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => fixture.destroy());

  function label(): HTMLElement {
    return fixture.nativeElement.querySelector('span');
  }

  function cutShort(element: HTMLElement): void {
    Object.defineProperty(element, 'scrollWidth', { configurable: true, value: 240 });
    Object.defineProperty(element, 'clientWidth', { configurable: true, value: 80 });
  }

  function hover(element: HTMLElement): void {
    element.dispatchEvent(new MouseEvent('mouseenter', { clientX: 10, clientY: 10 }));
  }

  const tooltipsIn = (doc: Document) => doc.body.querySelectorAll('.app-text-tooltip');

  it('shows nothing for a name that fits', () => {
    hover(label());

    expect(tooltipsIn(document)).toHaveLength(0);
  });

  it('shows the whole name of one cut short, and takes it away as the pointer leaves', () => {
    cutShort(label());

    hover(label());

    expect(tooltipsIn(document)).toHaveLength(1);
    expect(tooltipsIn(document)[0].textContent).toBe('とても長い名前のBGM（戦闘・ボス・第二形態）.mp3');

    label().dispatchEvent(new MouseEvent('mouseleave'));

    expect(tooltipsIn(document)).toHaveLength(0);
  });

  it('follows the pointer while it is over the name, and not once it has left', () => {
    cutShort(label());
    hover(label());
    const tooltip = tooltipsIn(document)[0] as HTMLElement;

    label().dispatchEvent(new MouseEvent('mousemove', { clientX: 60, clientY: 40 }));
    expect(tooltip.style.top).toBe('58px');

    label().dispatchEvent(new MouseEvent('mouseleave'));
    label().dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 90 }));
    expect(tooltipsIn(document)).toHaveLength(0);
  });

  it('opens in the window the name is shown in, for a panel taken out to a window of its own', () => {
    const other = document.implementation.createHTMLDocument('panel window');
    const span = label();
    other.body.appendChild(span);
    cutShort(span);

    hover(span);

    expect(tooltipsIn(other)).toHaveLength(1);
    expect(tooltipsIn(document)).toHaveLength(0);
    span.dispatchEvent(new MouseEvent('mouseleave'));
  });
});

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { UiButtonGuideComponent } from '@axe/ui/components/button-guide/button-guide.component';

@Component({
  imports: [UiButtonGuideComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="bar" style="position: fixed">
    <button type="button" data-guide-label="Inventory" data-at="0"></button>
    <button type="button" data-guide-label="Hide the bars" data-at="1"></button>
    <button type="button" data-guide-label="Folded away" data-at="hidden"></button>
    <button type="button" data-at="2"></button>
    @if (shown()) {
      <ui-button-guide />
    }
  </div>`,
})
class HostComponent {
  readonly shown = signal(false);
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

describe('UiButtonGuideComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HTMLElement;

  /** Lays the bar out near the top left of the window, its buttons in a row, the hidden one nowhere. */
  function layOut(): void {
    const bar = host.querySelector<HTMLElement>('.bar')!;
    bar.getBoundingClientRect = () => rect(100, 20, 200, 44);
    Object.defineProperty(bar, 'clientWidth', { value: 200 });
    Object.defineProperty(bar, 'clientHeight', { value: 44 });
    for (const button of Array.from(bar.querySelectorAll<HTMLElement>('[data-at]'))) {
      const at = button.dataset['at'];
      button.getBoundingClientRect = () =>
        at === 'hidden' ? rect(0, 0, 0, 0) : rect(108 + Number(at) * 36, 26, 32, 32);
    }
  }

  async function showGuide(): Promise<void> {
    fixture.componentInstance.shown.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function labels(): string[] {
    return Array.from(host.querySelectorAll('[data-testid="button-guide-label"]')).map(
      (label) => label.textContent?.trim() ?? ''
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    layOut();
  });

  afterEach(() => {
    fixture.destroy();
    host.remove();
  });

  it('writes out the name of every button on the bar that is laid out and has one', async () => {
    await showGuide();

    expect(labels()).toEqual(['Inventory', 'Hide the bars']);
  });

  it('hangs the names below a bar in the left half of the window, in a column off its right end', async () => {
    await showGuide();
    const [first, second] = Array.from(host.querySelectorAll<HTMLElement>('[data-testid="button-guide-label"]'));

    expect(first.style.bottom).toBe('');
    expect(first.style.left).toBe('210px');
    expect(second.style.left).toBe('210px');
    expect(parseFloat(first.style.top)).toBeGreaterThan(parseFloat(second.style.top));
  });

  it('draws nothing that takes a press', async () => {
    await showGuide();

    const drawn = Array.from(host.querySelectorAll('ui-button-guide *'));

    expect(drawn).toHaveLength(6);
    for (const each of drawn) expect(each.className).toContain('pointer-events-none');
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { PortraitChoice } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { PortraitStripComponent } from '@axe/ui/components/portrait-strip/portrait-strip.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function choices(count: number): PortraitChoice[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: index === 1 ? '' : `表情${index}`,
    url: `blob:face-${index}`,
  }));
}

describe('PortraitStripComponent', () => {
  let fixture: ComponentFixture<PortraitStripComponent>;
  let picked: number[];

  async function setup(count: number, selected = 0): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PortraitStripComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(PortraitStripComponent);
    fixture.componentRef.setInput('choices', choices(count));
    fixture.componentRef.setInput('selectedIndex', selected);
    picked = [];
    fixture.componentInstance.picked.subscribe((index) => picked.push(index));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const track = () => fixture.nativeElement.querySelector('[role="listbox"]') as HTMLElement;
  const buttons = () => [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];

  it('shows every portrait as a picture, the chosen one marked', async () => {
    await setup(4, 2);

    expect(buttons().map((button) => button.querySelector('img')?.getAttribute('src'))).toEqual([
      'blob:face-0',
      'blob:face-1',
      'blob:face-2',
      'blob:face-3',
    ]);
    expect(buttons().map((button) => button.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ]);
  });

  it('names each portrait, and one without a name by its number', async () => {
    await setup(3);

    expect(buttons().map((button) => button.title)).toEqual(['表情0', '立ち絵 2', '表情2']);
  });

  it('tells which portrait was pressed, and nothing when it was already the one', async () => {
    await setup(3, 0);

    buttons()[2].click();
    buttons()[0].click();

    expect(picked).toEqual([2]);
  });

  it('steps to the portrait beside it with the arrow keys, stopping at either end', async () => {
    await setup(3, 0);

    track().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    track().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));

    expect(picked).toEqual([1]);
  });

  describe('sliding along a row longer than it shows', () => {
    function overflowing(scrollWidth: number, clientWidth: number): void {
      Object.defineProperty(track(), 'scrollWidth', { configurable: true, value: scrollWidth });
      Object.defineProperty(track(), 'clientWidth', { configurable: true, value: clientWidth });
    }

    it('turns the wheel into a slide sideways', async () => {
      await setup(20);
      overflowing(560, 200);
      const wheel = new WheelEvent('wheel', { deltaY: 90, cancelable: true });

      track().dispatchEvent(wheel);

      expect(track().scrollLeft).toBe(90);
      expect(wheel.defaultPrevented).toBe(true);
    });

    it('leaves the wheel to the page when every portrait shows', async () => {
      await setup(3);
      overflowing(100, 200);
      const wheel = new WheelEvent('wheel', { deltaY: 90, cancelable: true });

      track().dispatchEvent(wheel);

      expect(track().scrollLeft).toBe(0);
      expect(wheel.defaultPrevented).toBe(false);
    });

    it('brings the chosen portrait into view when the choice changes', async () => {
      await setup(20, 0);
      overflowing(560, 200);
      buttons().forEach((button, index) => {
        Object.defineProperty(button, 'offsetLeft', { configurable: true, value: index * 28 });
        Object.defineProperty(button, 'offsetWidth', { configurable: true, value: 24 });
      });

      fixture.componentRef.setInput('selectedIndex', 12);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(track().scrollLeft).toBe(12 * 28 + 24 - 200);
    });
  });
});

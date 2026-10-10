import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { PortraitChoice } from '@axe/ui/components/portrait-picker/portrait-picker.component';
import { PortraitSliderComponent } from '@axe/ui/components/portrait-slider/portrait-slider.component';

function choices(count: number): PortraitChoice[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    name: index === 1 ? '' : `表情${index}`,
    url: `blob:face-${index}`,
  }));
}

describe('PortraitSliderComponent', () => {
  let fixture: ComponentFixture<PortraitSliderComponent>;
  let picked: number[];

  async function setup(count: number, selected = 0): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PortraitSliderComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(PortraitSliderComponent);
    fixture.componentRef.setInput('choices', choices(count));
    fixture.componentRef.setInput('selectedIndex', selected);
    picked = [];
    fixture.componentInstance.picked.subscribe((index) => picked.push(index));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  const slider = () => fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
  const shown = () =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('span')].map((span) => span.textContent!.trim());

  function slideTo(value: number): void {
    slider().value = String(value);
    slider().dispatchEvent(new Event('input'));
  }

  it('runs from the first portrait to the last, resting on the one chosen', async () => {
    await setup(9, 3);

    expect(slider().min).toBe('0');
    expect(slider().max).toBe('8');
    expect(slider().value).toBe('3');
  });

  it('says where the portrait it rests on is among them, then its name', async () => {
    await setup(9, 3);

    expect(shown()).toEqual(['4/9', '表情3']);
    expect(slider().getAttribute('aria-valuetext')).toBe('表情3');
  });

  it('names a portrait without a name by its number', async () => {
    await setup(9, 1);

    expect(shown()).toEqual(['2/9', '立ち絵 2']);
  });

  it('draws the bar up to the knob in the accent colour', async () => {
    await setup(9, 2);

    expect(slider().style.getPropertyValue('--seek-progress')).toBe('25%');
  });

  it('chooses each portrait the knob is moved to, and not the one it already rests on', async () => {
    await setup(9, 0);

    slideTo(5);
    slideTo(0);

    expect(picked).toEqual([5]);
  });

  it('steps to the next portrait with the wheel turned down, and back with it turned up', async () => {
    await setup(3, 1);
    const down = new WheelEvent('wheel', { deltaY: 100, cancelable: true });

    slider().dispatchEvent(down);
    slider().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));

    expect(picked).toEqual([2, 0]);
    expect(down.defaultPrevented).toBe(true);
  });

  it('goes no further with the wheel at either end', async () => {
    await setup(3, 2);

    slider().dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));

    expect(picked).toEqual([]);
  });

  it('follows a choice made elsewhere', async () => {
    await setup(9, 0);

    fixture.componentRef.setInput('selectedIndex', 7);
    fixture.detectChanges();

    expect(slider().value).toBe('7');
    expect(shown()).toEqual(['8/9', '表情7']);
  });
});

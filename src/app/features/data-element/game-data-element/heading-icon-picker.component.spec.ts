import { TestBed } from '@angular/core/testing';
import { HeadingIconPickerComponent } from '@axe/features/data-element/game-data-element/heading-icon-picker.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('HeadingIconPickerComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HeadingIconPickerComponent], providers: [...TEST_PROVIDERS] });
  });

  function drawn(icon = '') {
    const fixture = TestBed.createComponent(HeadingIconPickerComponent);
    fixture.componentRef.setInput('icon', icon);
    fixture.detectChanges();
    return fixture;
  }

  it('opens the grid from its button, and hands the icon chosen back, closing the grid', () => {
    const fixture = drawn();
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((icon) => picked.push(icon));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    const choices = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button[title]');
    choices[1].click();
    fixture.detectChanges();

    expect(picked).toEqual([choices[1].title]);
    expect(fixture.componentInstance.open()).toBe(false);
  });

  it('offers taking the icon away only where there is one', () => {
    const none = drawn();
    none.componentInstance.open.set(true);
    none.detectChanges();
    const shown = drawn('star');
    shown.componentInstance.open.set(true);
    shown.detectChanges();
    const clears = (fixture: typeof none) =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].filter(
        (button) => !button.title && !button.querySelector('i')
      ).length;

    expect(clears(none)).toBe(0);
    expect(clears(shown)).toBe(1);
  });
});

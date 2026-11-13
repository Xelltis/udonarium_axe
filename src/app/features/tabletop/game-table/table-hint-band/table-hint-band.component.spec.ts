import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableHintBandComponent } from '@axe/features/tabletop/game-table/table-hint-band/table-hint-band.component';

@Component({
  selector: 'band-host',
  template: `<table-hint-band [band]="band()" [icon]="icon()" data-testid="band">
    <span data-testid="words">words</span>
  </table-hint-band>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TableHintBandComponent],
})
class BandHostComponent {
  readonly band = input.required<'top' | 'bottom'>();
  readonly icon = input('');
}

describe('TableHintBandComponent', () => {
  function render(band: 'top' | 'bottom', icon = ''): HTMLElement {
    TestBed.configureTestingModule({ imports: [BandHostComponent] });
    const fixture = TestBed.createComponent(BandHostComponent);
    fixture.componentRef.setInput('band', band);
    fixture.componentRef.setInput('icon', icon);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="band"]')!;
  }

  it('stands at the foot of the screen with its icon ahead of the words', () => {
    const band = render('bottom', 'mouse');

    expect(band.classList).toContain('bottom-28');
    expect(band.querySelector('i')?.textContent).toBe('mouse');
    expect(band.querySelector('[data-testid="words"]')?.textContent).toBe('words');
    expect(band.firstElementChild?.tagName).toBe('I');
  });

  it('stands at the head of the screen, with no icon where none is given', () => {
    const band = render('top');

    expect(band.classList).toContain('top-4');
    expect(band.classList).not.toContain('bottom-28');
    expect(band.querySelector('i')).toBeNull();
    expect(band.textContent?.trim()).toBe('words');
  });
});

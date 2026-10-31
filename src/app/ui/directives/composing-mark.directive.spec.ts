import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ComposingMarkDirective, whenNotComposing } from '@axe/ui/directives/composing-mark.directive';

@Component({
  imports: [ComposingMarkDirective],
  template: '<textarea uiComposingMark></textarea>',
})
class HostComponent {}

describe('ComposingMarkDirective', () => {
  function box(): HTMLTextAreaElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
  }

  it('runs at once where no word is being made', () => {
    const run = vi.fn();

    whenNotComposing(box(), run);

    expect(run).toHaveBeenCalledOnce();
  });

  it('waits for the word being made, and runs a moment after it is made', async () => {
    const area = box();
    const run = vi.fn();
    area.dispatchEvent(new CompositionEvent('compositionstart'));

    whenNotComposing(area, run);
    expect(run).not.toHaveBeenCalled();

    area.dispatchEvent(new CompositionEvent('compositionend'));
    expect(run).not.toHaveBeenCalled();
    await new Promise((done) => setTimeout(done));

    expect(run).toHaveBeenCalledOnce();
    expect(area.hasAttribute('data-composing')).toBe(false);
  });

  it('runs once the box a word was being made in is taken away, with no word made', () => {
    vi.useFakeTimers();
    try {
      const area = box();
      const run = vi.fn();
      area.dispatchEvent(new CompositionEvent('compositionstart'));
      whenNotComposing(area, run);

      area.remove();
      vi.advanceTimersByTime(1000);

      expect(run).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

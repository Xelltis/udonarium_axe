import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KeepTouchDirective } from '@axe/ui/directives/keep-touch.directive';
import { afterEach, describe, expect, it, vi } from 'vitest';

@Component({
  template: `<div (touchstart)="reached($event)"><span appKeepTouch></span><b [appKeepTouch]="kept()"></b></div>`,
  imports: [KeepTouchDirective],
})
class HostComponent {
  readonly kept = signal(false);
  readonly reached = vi.fn();
}

describe('KeepTouchDirective', () => {
  afterEach(() => vi.restoreAllMocks());

  function touch(element: Element): void {
    element.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
  }

  it('keeps a touch starting on the element from what holds it, where asked', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    touch(host.querySelector('span')!);
    expect(fixture.componentInstance.reached).not.toHaveBeenCalled();

    touch(host.querySelector('b')!);
    expect(fixture.componentInstance.reached).toHaveBeenCalledTimes(1);

    fixture.componentInstance.kept.set(true);
    fixture.detectChanges();
    touch(host.querySelector('b')!);
    expect(fixture.componentInstance.reached).toHaveBeenCalledTimes(1);
  });

  it('hears the touch without holding up scrolling', () => {
    const added = vi.spyOn(HTMLElement.prototype, 'addEventListener');
    TestBed.createComponent(HostComponent).detectChanges();

    const touches = added.mock.calls.filter(
      ([type, , options]) => type === 'touchstart' && typeof options === 'object'
    );
    expect(touches.map(([, , options]) => options)).toEqual([{ passive: true }, { passive: true }]);
  });
});

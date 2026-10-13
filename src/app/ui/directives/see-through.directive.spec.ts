import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SeeThroughService } from '@axe/application/ui/see-through.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { SeeThroughDirective } from '@axe/ui/directives/see-through.directive';

@Component({
  selector: 'see-through-host',
  template: `@if (shown()) {
    <img appSeeThrough src="https://example.test/piece.png" />
  }`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SeeThroughDirective],
})
class SeeThroughHostComponent {
  readonly shown = signal(true);
}

describe('SeeThroughDirective', () => {
  function mount() {
    TestBed.configureTestingModule({ imports: [SeeThroughHostComponent], providers: [...TEST_PROVIDERS] });
    const service = TestBed.inject(SeeThroughService);
    const hover = vi.spyOn(service, 'hover').mockImplementation(() => undefined);
    const unwatch = vi.spyOn(service, 'unwatch');
    const fixture = TestBed.createComponent(SeeThroughHostComponent);
    fixture.detectChanges();
    const picture = (fixture.nativeElement as HTMLElement).querySelector('img')!;
    return { fixture, picture, hover, unwatch };
  }

  function move(picture: HTMLImageElement, init: PointerEventInit, offsetX = 12, offsetY = 34): void {
    const event = new PointerEvent('pointermove', { pointerType: 'mouse', ...init });
    Object.defineProperty(event, 'offsetX', { value: offsetX });
    Object.defineProperty(event, 'offsetY', { value: offsetY });
    picture.dispatchEvent(event);
  }

  afterEach(() => vi.restoreAllMocks());

  it('asks whether a mouse moving over the picture with no button held is over a clear part', () => {
    const { picture, hover } = mount();

    move(picture, { buttons: 0 });

    expect(hover).toHaveBeenCalledWith(picture, 12, 34);
  });

  it('leaves the picture whole while a button is held, as in the middle of a drag', () => {
    const { picture, hover } = mount();

    move(picture, { buttons: 1 });

    expect(hover).not.toHaveBeenCalled();
  });

  it('leaves a touch to the service, which hands it on as it lands', () => {
    const { picture, hover } = mount();

    move(picture, { buttons: 0, pointerType: 'touch' });

    expect(hover).not.toHaveBeenCalled();
  });

  it('stops watching the picture once it is no longer drawn', () => {
    const { fixture, picture, unwatch } = mount();

    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();

    expect(unwatch).toHaveBeenCalledWith(picture);
  });
});

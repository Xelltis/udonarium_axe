import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, Injector, input } from '@angular/core';
import { WidgetLayoutService, WidgetSpot } from '@axe/application/ui/widget-layout.service';
import { placeWidget, rememberWidget } from '@axe/application/ui/widget-place';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';

export type WidgetFallback = (element: HTMLElement) => WidgetSpot;

@Directive({ selector: '[appWidgetPlace]' })
export class WidgetPlaceDirective {
  private readonly layout = inject(WidgetLayoutService);
  private readonly injector = inject(Injector);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly draggable = inject(DraggableDirective, { self: true, optional: true });

  readonly name = input.required<string>({ alias: 'appWidgetPlace' });
  readonly fallback = input.required<WidgetFallback>({ alias: 'widgetFallback' });
  readonly enabled = input(true, { alias: 'widgetPlaceEnabled' });

  private placed = false;

  constructor() {
    effect((onCleanup) => {
      if (!this.enabled()) return;
      const name = this.name();
      const pending = afterNextRender(
        () => {
          placeWidget(this.layout, name, this.element, () => this.fallback()(this.element));
          this.placed = true;
        },
        { injector: this.injector }
      );
      onCleanup(() => pending.destroy());
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.placed) this.remember();
    });
    this.draggable?.onend.subscribe(() => this.remember());
    this.draggable?.onsettle.subscribe(() => this.remember());
  }

  /**
   * Writes where the widget now sits into the saved layout, so it opens there next time.
   *
   * Called when a drag ends, when the window settles, and when the widget goes away; does
   * nothing while placing is turned off.
   */
  remember(): void {
    if (this.enabled()) rememberWidget(this.layout, this.name(), this.element);
  }
}

import { afterNextRender, DestroyRef, Directive, effect, ElementRef, inject, input } from '@angular/core';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

@Directive({
  selector: '[appSelectable]',
})
export class SelectableDirective {
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  readonly target = input.required<TabletopObject | null | undefined>({ alias: 'appSelectable' });

  private readonly handlePointerDown = (event: PointerEvent) => this.onPointerDown(event);

  constructor() {
    effect(() => {
      const obj = this.target();
      const selected = obj ? this.selectionSignalService.selectedObjects().has(obj.identifier) : false;
      const el = this.elementRef.nativeElement;
      if (selected) {
        el.classList.add('app-selected');
      } else {
        el.classList.remove('app-selected');
      }
    });

    afterNextRender(() => {
      const el = this.elementRef.nativeElement;
      el.addEventListener('pointerdown', this.handlePointerDown, { capture: true });
    });

    this.destroyRef.onDestroy(() => {
      this.elementRef.nativeElement.removeEventListener('pointerdown', this.handlePointerDown, { capture: true });
    });
  }

  private onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    const obj = this.target();
    if (!obj) return;
    if (this.selectionSignalService.press(obj.identifier, obj.aliasName, event.ctrlKey || event.metaKey)) {
      event.stopPropagation();
      event.preventDefault();
    }
  }
}

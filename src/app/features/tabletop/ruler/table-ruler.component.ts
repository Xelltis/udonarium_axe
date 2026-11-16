import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PlacedRulerService } from '@axe/application/tabletop/placed-ruler.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { RulerGrabDirective } from '@axe/features/tabletop/ruler/ruler-grab.directive';
import { buildTableRulerContextMenu } from '@axe/features/tabletop/ruler/table-ruler-context-menu';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';

/**
 * A ruler left lying on the table, over a table drawn on a canvas: a box on the screen round where the
 * canvas draws its line, cut to it, by which it is dragged about and right-clicked, and a handle at
 * each end, brought out by the pointer resting on it, by which that end is laid again. What it
 * measures is said over it by the rulers' overlay.
 */
@Component({
  selector: 'table-ruler',
  templateUrl: './table-ruler.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HudPlaceDirective, RulerGrabDirective],
  host: {
    class: 'group',
    '[attr.data-object-id]': 'ruler().identifier',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TableRulerComponent {
  readonly ruler = input.required<TableRuler>();

  private readonly placed = inject(PlacedRulerService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly permission = inject(RolePermissionService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly pointer = inject(PointerDeviceService);
  private readonly tabletop = inject(TabletopService);
  private readonly t = inject(TRANSLATE_FN);

  /** The ruler as this seat sees it now, or null where it may not see it. */
  protected readonly shown = computed(() => this.placed.placedOf(this.ruler().identifier));

  /** Whether this seat may move the ruler: one that may change the table, while the ruler is not locked. */
  protected readonly movable = computed(() => {
    this.objectChange.versionOf(this.ruler().identifier)();
    return this.permission.canEditTabletop() && !this.ruler().isLock;
  });

  /** Where its ends stand, for the handles that lay them again. */
  protected readonly ends = computed(() => {
    const shown = this.shown();
    if (!shown) return null;
    const at = (point: { x: number; y: number; z: number }) => ({
      surface: 'floor',
      x: point.x,
      y: point.y,
      height: point.z,
    });
    return { from: at(shown.from), to: at(shown.to) };
  });

  constructor() {
    const overlap = inject(TabletopOverlapService);
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let registered: string | null = null;
    queueMicrotask(() => {
      registered = this.ruler().identifier;
      overlap.register(this.ruler(), element, () => ({ width: 0, height: 0 }));
    });
    inject(DestroyRef).onDestroy(() => {
      if (registered) overlap.unregister(registered, element);
    });
  }

  /** Opens the ruler's right-click menu at the pointer, for a seat that may change the table. */
  protected onContextMenu(e: Event): void {
    e.stopPropagation();
    e.preventDefault();
    const shown = this.shown();
    if (!shown || !this.permission.canEditTabletop() || !this.pointer.isAllowedToOpenContextMenu) return;
    const menu = buildTableRulerContextMenu(this.ruler(), shown, this.tabletop.gridSize(), this.t);
    this.contextMenu.open(this.pointer.pointers[0], menu, this.ruler().name);
  }

  protected onPicked(): void {
    SoundEffect.play(PresetSound.cardPick);
  }

  protected onPut(): void {
    SoundEffect.play(PresetSound.cardPut);
  }
}

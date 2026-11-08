import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { GroundBrushService, GroundBrushSettings } from '@axe/application/tabletop/ground-brush.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { GroundBrushKind } from '@axe/domain/tabletop/ground/ground-brush';
import { GROUND_PAINT_LAYERS, GroundPaintLayer } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/** How many times the point pressed is read again at the height of the ground found there. */
const GROUND_REFINEMENTS = 4;

/**
 * The band the master shapes the ground of a table drawn on a canvas with, at the foot of the screen
 * while the ground brush is on: what the brush does, how wide and hard it is, what it paints, and the
 * stroke to take back. While it shows, a press on the table lays the brush where it lands on the
 * ground, from the press to its letting go, instead of whatever the press would do.
 */
@Component({
  selector: 'ground-brush-band',
  templateUrl: './ground-brush-band.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class GroundBrushBandComponent {
  private readonly brush = inject(GroundBrushService);
  private readonly ground = inject(GroundService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly tabletop = inject(TabletopService);
  private readonly rolePermission = inject(RolePermissionService);

  protected readonly zIndex = Z_TABLE_BANDS;
  protected readonly settings = this.brush.settings;
  protected readonly undoable = this.brush.undoable;
  /** How many in the room see the table flat, their version knowing nothing of the ground. */
  protected readonly unaware = computed(() => this.ground.unawarePeers().length);
  protected readonly kinds: readonly GroundBrushKind[] = ['raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'];
  protected readonly layers = GROUND_PAINT_LAYERS;
  /** Whether the band shows: the brush is on, for a master. */
  protected readonly shown = computed(() => this.brush.active() && this.rolePermission.canEditShared());

  private pressed: number | null = null;
  private last: { x: number; y: number } | null = null;

  constructor() {
    const onDown = (event: PointerEvent) => this.press(event);
    const onMove = (event: PointerEvent) => this.drag(event);
    const onUp = (event: PointerEvent) => this.letGo(event);
    effect((onCleanup) => {
      if (!this.shown()) return;
      window.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      onCleanup(() => {
        window.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        this.endStroke();
      });
    });
    inject(DestroyRef).onDestroy(() => this.endStroke());
  }

  protected choose(change: Partial<GroundBrushSettings>): void {
    this.settings.update((settings) => ({ ...settings, ...change }));
  }

  protected chooseNumber(key: 'radius' | 'strength', event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(value) && value > 0) this.choose({ [key]: value });
  }

  protected chooseLayer(layer: GroundPaintLayer): void {
    this.choose({ kind: 'paint', layer });
  }

  protected undo(): void {
    this.brush.undo();
  }

  protected close(): void {
    this.brush.active.set(false);
  }

  /** Starts a stroke where a press on the table lands on the ground, and keeps the press from the table. */
  private press(event: PointerEvent): void {
    if (event.button !== 0 || this.pressed !== null) return;
    const target = event.target as Element | null;
    if (!target?.closest('#app-table-layer') || target.closest('[data-ground-brush-band]')) return;
    const at = this.groundPointAt(event.clientX, event.clientY);
    if (!at) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pressed = event.pointerId;
    this.last = at;
    this.brush.begin(at.x, at.y);
  }

  /** Lays the stroke on as the press moves, a dab each time it has gone a quarter of the brush. */
  private drag(event: PointerEvent): void {
    if (this.pressed !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const at = this.groundPointAt(event.clientX, event.clientY);
    if (!at || !this.last) return;
    if (Math.hypot(at.x - this.last.x, at.y - this.last.y) < this.settings().radius / 4) return;
    this.last = at;
    this.brush.dab(at.x, at.y);
  }

  private letGo(event: PointerEvent): void {
    if (this.pressed !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.endStroke();
  }

  private endStroke(): void {
    if (this.pressed === null) return;
    this.pressed = null;
    this.last = null;
    this.brush.end();
  }

  /**
   * Where a point of the page lands on the ground of the board, in cells: found on the board, then read
   * again at the height the ground stands there, a few times, which settles on the ground the line of
   * sight meets. Null off the board.
   */
  private groundPointAt(pageX: number, pageY: number): { x: number; y: number } | null {
    const gridSize = this.tabletop.currentTableVersion().gridSize;
    if (!(gridSize > 0)) return null;
    let height = 0;
    let at = this.surfaces.pointOn('floor', pageX, pageY, height);
    for (let i = 0; i < GROUND_REFINEMENTS && at; i++) {
      height = this.ground.heightPxAt(at.localX, at.localY);
      at = this.surfaces.pointOn('floor', pageX, pageY, height);
    }
    return at ? { x: at.localX / gridSize, y: at.localY / gridSize } : null;
  }
}

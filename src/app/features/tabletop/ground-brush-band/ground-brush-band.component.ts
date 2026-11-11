import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject } from '@angular/core';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { GroundBrushService, GroundBrushSettings } from '@axe/application/tabletop/ground-brush.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { GroundBrushKind } from '@axe/domain/tabletop/ground/ground-brush';
import { GROUND_PAINT_LAYERS, GroundPaintLayer } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { ADOPT_TOUCH_EVENT, type AdoptedTouch } from '@axe/features/tabletop/game-table/table-touch-gesture';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * One thing the band says the brush or the view is worked by: the ways it is done, each the keys or
 * the presses pressed together, and what it does.
 */
interface GuideItem {
  readonly ways: readonly (readonly string[])[];
  readonly does: string;
}

/** How the brush and the view are worked with the mouse and the keys. */
const MOUSE_GUIDE: readonly GuideItem[] = [
  { ways: [['drag']], does: 'shape' },
  { ways: [['arrows'], ['middleDrag']], does: 'move' },
  { ways: [['shift', 'leftRight'], ['rightDrag']], does: 'turn' },
  { ways: [['shift', 'upDown']], does: 'tilt' },
  { ways: [['wheel'], ['ctrl', 'upDown']], does: 'zoom' },
];

/**
 * How the brush and the view are worked with fingers: one shapes the ground, and a second hands both
 * to the view, which they turn, tilt and zoom together and move once one of them is lifted.
 */
const TOUCH_GUIDE: readonly GuideItem[] = [
  { ways: [['swipe']], does: 'shape' },
  { ways: [['twoThenOne']], does: 'move' },
  { ways: [['twist']], does: 'turn' },
  { ways: [['twoUpDown']], does: 'tilt' },
  { ways: [['pinch']], does: 'zoom' },
];

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
  private readonly viewport = inject(ViewportService);

  protected readonly zIndex = Z_TABLE_BANDS;
  protected readonly settings = this.brush.settings;
  protected readonly undoable = this.brush.undoable;
  /** How many in the room see the table flat, their version knowing nothing of the ground. */
  protected readonly unaware = computed(() => this.ground.unawarePeers().length);
  protected readonly kinds: readonly GroundBrushKind[] = ['raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'];
  protected readonly layers = GROUND_PAINT_LAYERS;
  /** How the brush and the view are worked, with a finger or with the mouse and the keys. */
  protected readonly guide = computed(() => (this.viewport.isTouch() ? TOUCH_GUIDE : MOUSE_GUIDE));
  /** Whether the strength reads as how high a raise or a cut goes, in cells, rather than as how far the rest go. */
  protected readonly strengthIsHeight = computed(() => {
    const kind = this.settings().kind;
    return kind === 'raise' || kind === 'lower';
  });
  /** The strength as the share of the way the rest take the ground, in hundredths. */
  protected readonly sharePercent = computed(() => Math.round(this.settings().strength * 100));
  /** Whether the band shows: the brush is on, for a master. */
  protected readonly shown = computed(() => this.brush.active() && this.rolePermission.canEditShared());

  private pressed: number | null = null;
  /** Whether a finger, rather than a mouse or a pen, is shaping the ground. */
  private pressedByTouch = false;
  /** Where the press shaping the ground came down, and where on the page it stands now. */
  private pressedOn: Element | null = null;
  private pressedAt: { x: number; y: number } | null = null;
  private last: { x: number; y: number } | null = null;
  /** The fingers handed over to the view, which shape no ground until every one is lifted. */
  private readonly handedOver = new Set<number>();

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
        this.handedOver.clear();
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

  /**
   * Gives the keys back to the view once a slider has been set with the pointer: the slider took them
   * as it was pressed, and the arrow keys the band says move the view would move it instead.
   */
  protected handBackKeys(event: Event): void {
    (event.target as HTMLElement).blur();
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

  /**
   * Starts a stroke where a press on the table lands on the ground, and keeps the press from the table.
   * A second finger on the table hands both over to the view instead, and any more go to it with them.
   */
  private press(event: PointerEvent): void {
    if (this.handedOver.size > 0) {
      if (event.pointerType === 'touch') this.handedOver.add(event.pointerId);
      return;
    }
    if (this.pressed !== null) {
      if (this.pressedByTouch && event.pointerType === 'touch') this.handOver(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    if (!target?.closest('#app-table-layer') || target.closest('[data-ground-brush-band]')) return;
    const at = this.groundPointAt(event.clientX, event.clientY);
    if (!at) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pressed = event.pointerId;
    this.pressedByTouch = event.pointerType === 'touch';
    this.pressedOn = target;
    this.pressedAt = { x: event.clientX, y: event.clientY };
    this.last = at;
    this.brush.begin(at.x, at.y);
  }

  /**
   * Hands the finger shaping the ground over to the view once a second comes down, as two fingers are
   * there to turn, tilt or zoom it: the stroke is taken back, and the first finger joins the table's
   * gesture where it stands, the second coming down on the table as it would.
   */
  private handOver(second: number): void {
    const first = this.pressed!;
    const on = this.pressedOn;
    const at = this.pressedAt;
    this.pressed = null;
    this.pressedOn = null;
    this.pressedAt = null;
    this.last = null;
    this.brush.cancel();
    this.handedOver.add(first);
    this.handedOver.add(second);
    if (!on || !at) return;
    const detail: AdoptedTouch = { pointerId: first, clientX: at.x, clientY: at.y };
    on.dispatchEvent(new CustomEvent(ADOPT_TOUCH_EVENT, { bubbles: true, detail }));
  }

  /** Lays the stroke on as the press moves, a dab each time it has gone a quarter of the brush. */
  private drag(event: PointerEvent): void {
    if (this.pressed !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pressedAt = { x: event.clientX, y: event.clientY };
    const at = this.groundPointAt(event.clientX, event.clientY);
    if (!at || !this.last) return;
    if (Math.hypot(at.x - this.last.x, at.y - this.last.y) < this.settings().radius / 4) return;
    this.last = at;
    this.brush.dab(at.x, at.y);
  }

  private letGo(event: PointerEvent): void {
    if (this.handedOver.delete(event.pointerId)) return;
    if (this.pressed !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.endStroke();
  }

  private endStroke(): void {
    if (this.pressed === null) return;
    this.pressed = null;
    this.pressedOn = null;
    this.pressedAt = null;
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

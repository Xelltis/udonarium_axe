import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import type { HudLay } from '@axe/application/tabletop/hud-frame.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { rotationSnapStep } from '@axe/domain/tabletop/rotation-snap';
import { type FacePoint, seenLinePath, type TurnFoot, turnFrame } from '@axe/domain/tabletop/turn-frame';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { TextTooltipDirective } from '@axe/ui/directives/text-tooltip.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** Where a thing that turns stands: the face it is on, how far off the face its foot is, and its foot. */
export interface TurnStand {
  readonly surface: string;
  readonly height: number;
  readonly foot: TurnFoot;
}

/** A knob or a mark of the frame, in the frame's own pixels, and whether the eye sees it past the thing. */
interface FramePoint extends FacePoint {
  readonly seen: boolean;
}

/** How large the knobs at the frame's corners are drawn, in the face's own pixels, as a piece's are. */
const KNOB_PX = 28;

/** How large the icon in a knob is drawn. */
const KNOB_ICON_PX = 18;

/** How long the mark on the frame's front is, along the front edge, in the face's own pixels. */
const FRONT_MARK_PX = 14;

/**
 * How long the frame stays out once the pointer has left the thing, so that the pointer can cross
 * what the canvas draws of the thing, as a block's side, on its way from the top to the frame round
 * its foot.
 */
const HOVER_GRACE_MS = 600;

/**
 * The frame that turns a thing lying or standing on the table: a rounded rectangle lying on the face
 * round the thing's foot, a knob at each of its corners where a turn is taken hold of, and a mark on
 * the side the thing faces, which turns with it and so tells which way it faces. Pressed anywhere on
 * the line or a knob, it turns the
 * thing through the `appRotable` it stands in, whose `.rotate-grab` they all are.
 *
 * It comes out as a piece's ring does: where the main pointer can hover, while it is over the thing
 * and for a moment after; where it cannot, round the thing last pressed alone; and always while it is
 * turned. While the thing is in hand and not turned it is kept but not drawn. What
 * the thing itself stands before is left out, so the frame is drawn round the thing and behind it,
 * rather than over it.
 */
@Component({
  selector: 'turn-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turn-frame.component.html',
  imports: [HudPlaceDirective, TextTooltipDirective, TranslocoModule],
})
export class TurnFrameComponent {
  /** The identifier of the thing the frame turns, which its frame is drawn with. */
  readonly owner = input.required<string>();
  /** Where the thing stands. */
  readonly stand = input.required<TurnStand>();
  /**
   * Whether the knobs at the corners are drawn even where the thing stands before them, as a board
   * leaning over its own foot would hide the two behind it.
   */
  readonly cornersAlwaysSeen = input(false);

  private readonly selection = inject(SelectionSignalService);
  private readonly viewport = inject(ViewportService);
  private readonly pick = inject(TablePickService);
  private readonly camera = inject(TableCameraService);
  private readonly tabletop = inject(TabletopService);
  private readonly guide = inject(RotationGuideService);
  private readonly rotable = inject(RotableDirective, { optional: true });
  private readonly held = inject(HeldPieceService);

  /** Whether the pointer is over the thing, which brings the frame out where the main pointer can hover. */
  private readonly hovered = signal(false);

  /** Whether the thing is being turned now. */
  protected readonly turning = computed(() => this.rotable?.turning() ?? false);

  /**
   * Whether the thing is in hand and not being turned, from a press on it until it is put down or the
   * turn takes its first step: the frame is kept, for a press on it to be turned by, but not drawn.
   */
  protected readonly carried = computed(() => !this.turning() && this.held.held()?.identifier === this.owner());

  /** Whether the frame is out. */
  protected readonly shown = computed(
    () =>
      this.turning() || (this.viewport.canHover() ? this.hovered() : this.selection.pressedObject() === this.owner())
  );

  protected readonly frame = computed(() => turnFrame(this.stand().foot));

  /** The rectangle the frame is laid on. */
  protected readonly lay = computed<HudLay>(() => {
    const frame = this.frame();
    const stand = this.stand();
    return {
      surface: stand.surface,
      height: stand.height,
      corners: frame.corners,
      width: frame.width,
      depth: frame.depth,
    };
  });

  /**
   * Whether each point of a list, in the frame's own pixels, is seen past the thing; all of them while
   * it is in hand or turned.
   */
  private readonly seenOf = computed(() => {
    if (!this.shown()) return null;
    this.camera.version();
    const frame = this.frame();
    const stand = this.stand();
    const hides = this.turning() || this.carried() ? null : this.pick.sightOf(this.owner());
    return (points: readonly FacePoint[]): boolean[] =>
      points.map((point) => {
        if (!hides) return true;
        const onFace = frame.faceOf(point);
        return !hides(stand.surface, onFace.x, onFace.y, stand.height);
      });
  });

  /** The path of what the eye sees of the frame's line, in the frame's own pixels. */
  protected readonly linePath = computed(() => {
    const seenOf = this.seenOf();
    const line = this.frame().line;
    return seenOf ? seenLinePath(line, seenOf(line)) : '';
  });

  /** The knobs at the frame's corners, round from its top left, each with whether it is seen. */
  protected readonly knobs = computed<readonly FramePoint[]>(() => {
    const seenOf = this.seenOf();
    const knobs = this.frame().knobs;
    if (!seenOf) return [];
    const seen = this.cornersAlwaysSeen() ? knobs.map(() => true) : seenOf(knobs);
    return knobs.map((knob, at) => ({ ...knob, seen: seen[at] }));
  });

  /** The mark on the frame's front, as a small arrow pointing out the way the thing faces, where it is seen. */
  protected readonly frontMark = computed(() => {
    const seenOf = this.seenOf();
    const { front } = this.frame();
    if (!seenOf || !seenOf([front])[0]) return null;
    const half = FRONT_MARK_PX / 2;
    return `M ${front.x - half} ${front.y - 1} L ${front.x + half} ${front.y - 1} L ${front.x} ${front.y + half} Z`;
  });

  /** Where the turn read out while the thing is turned stands: beyond the mark on the side it faces. */
  protected readonly readoutAt = computed(() => {
    const frame = this.frame();
    const stand = this.stand();
    const front = frame.faceOf({ x: frame.front.x, y: frame.front.y + FRONT_MARK_PX * 2 });
    return { surface: stand.surface, x: front.x, y: front.y, height: stand.height };
  });

  /** The angle the thing stands at while it is turned, as the turn under way reads it out. */
  protected readonly angle = computed(() => (this.turning() ? (this.guide.turn()?.angle ?? null) : null));

  /** The step a held Alt turns the thing by on the table in view. */
  protected readonly snapStep = computed(() => rotationSnapStep(this.tabletop.gridType()));

  protected readonly knobPx = KNOB_PX;
  protected readonly knobIconPx = KNOB_ICON_PX;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const root = host.closest('[data-hud-box]') ?? host.parentElement;
      if (!root) return;
      let leaving: ReturnType<typeof setTimeout> | null = null;
      const stay = () => {
        if (leaving !== null) clearTimeout(leaving);
        leaving = null;
      };
      const over = () => {
        stay();
        this.hovered.set(true);
      };
      const leave = () => {
        stay();
        leaving = setTimeout(() => {
          leaving = null;
          this.hovered.set(false);
        }, HOVER_GRACE_MS);
      };
      root.addEventListener('pointerover', over);
      root.addEventListener('pointerleave', leave);
      this.hovered.set(root.matches(':hover'));
      destroyRef.onDestroy(() => {
        stay();
        root.removeEventListener('pointerover', over);
        root.removeEventListener('pointerleave', leave);
      });
    });
  }
}

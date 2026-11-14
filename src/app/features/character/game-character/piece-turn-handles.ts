import { computed, inject, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { rotationSnapStep, shownAngle } from '@axe/domain/tabletop/rotation-snap';
import { hexPedestalGrabStyle } from '@axe/ui/tabletop/hex-pedestal-style';

/** How far the ring that turns a piece reaches past its pedestal, whatever the size of the piece. */
const TURN_RING_REACH_PX = 14;
/** Where the knobs stand round the ring, clockwise from the side the piece faces: there, and behind it. */
const TURN_KNOB_ANGLES = [0, 180] as const;
/** How many points round the ring are looked at to leave out of it what the piece hides. */
const TURN_RING_SAMPLES = 48;

/** What the handles that turn and tip a piece read of the piece as it is drawn. */
export interface PieceTurnHandlesHost {
  /** The piece the handles are of, read as a signal; nothing before one is bound. */
  character(): GameCharacter | null | undefined;
  /** How many cells across the piece is. */
  size(): number;
  /** How many pixels a cell of the table in view is across. */
  gridSize(): number;
  /** The way the piece faces on the table, in degrees. */
  rotate(): number;
  /** How far the piece is tipped, in degrees, read as a signal. */
  roll(): number;
  /** Whether the piece is seen flat from above, where no handle tips it. */
  flat(): boolean;
  /** Whether the piece has a picture, which the handle that tips it stands beside. Asked only of a bound piece. */
  hasPicture(): boolean;
  /** The hex pedestal the piece stands on, or null where its pedestal is round. */
  hexPedestal(): HexFlowerParams | null;
  /** Whether the ring is turning the piece just now. */
  turningByRing(): boolean;
  /** Whether the handle that tips the piece is tipping it just now. */
  tippingByHandle(): boolean;
  /** How large a handle is drawn, in pixels. */
  handleSizePx(): number;
  /** How far the handle that tips the piece stands clear of its picture, in pixels. */
  handleGapPx(): number;
}

/**
 * The handles that turn and tip a piece over a table drawn on a canvas: the ring round its pedestal
 * with its knobs, the handle beside the top of its picture, and what is read out while either is held.
 *
 * Made where services can be injected, as the piece's component makes its fields.
 */
export class PieceTurnHandles {
  private readonly selection = inject(SelectionSignalService);
  private readonly viewport = inject(ViewportService);
  private readonly heldPiece = inject(HeldPieceService);
  private readonly pieces = inject(TablePiecesService);
  private readonly tableCamera = inject(TableCameraService);
  private readonly pick = inject(TablePickService);
  private readonly surfaces = inject(TableSurfaceService);
  private readonly rotationGuide = inject(RotationGuideService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);

  constructor(private readonly host: PieceTurnHandlesHost) {}

  /**
   * The handle that tips the piece over, over a table drawn on a canvas: the corner of the picture it
   * stands against, its top right, and how far off that corner its middle lies, on the screen. It
   * stands beside the top of the picture, clear of it, so that a press on the picture takes hold of
   * the piece, and clear of the knobs on the ring round the pedestal below it.
   */
  readonly rollHandles = computed(() => {
    const clear = this.host.handleSizePx() / 2 + this.host.handleGapPx();
    return [{ testId: 'roll-grab-head', corner: 1 as const, dx: clear, dy: this.host.handleSizePx() / 2 }];
  });

  /**
   * Which handle of the piece is held just now: the ring that turns it, the one that tips it, or
   * none; from the first step of a turn by it until the turn ends, however it ends.
   */
  readonly turning = computed<'turn' | 'roll' | null>(() => {
    if (this.host.turningByRing()) return 'turn';
    if (this.host.tippingByHandle()) return 'roll';
    return null;
  });

  /**
   * Whether this is the piece pressed on the table as a finger presses and not in hand, which has its
   * handles out as one the pointer is over does: the piece a finger last pressed, or, where the main
   * pointer cannot hover and so brings nothing out by passing over a piece, the piece last pressed by
   * anything, a pen's or a trackpad's press there being taken as a finger's.
   * Only that piece follows whether it is in hand, which changes with each step of a drag.
   */
  readonly pressChosen = computed(() => {
    const id = this.host.character()?.identifier;
    if (!id) return false;
    const selection = this.selection;
    const chosen = selection.touchedObject() === id || (!this.viewport.canHover() && selection.pressedObject() === id);
    return chosen && !this.carried();
  });

  /**
   * Whether the handles take a press at all. Where the main pointer cannot hover, as the styles that
   * bring the handles out on hover ask, nothing brings them out by passing over a piece, so only those
   * of the piece last pressed do, as no other's are drawn; a tap beside a piece then reaches the
   * table. Where it can, every piece's do, brought out by it over the piece, and a finger's press on
   * them is taken as any other.
   */
  readonly pressable = computed(() => this.viewport.canHover() || this.pressChosen() || this.turning() !== null);

  /** The way the piece faces while it is turned, in whole degrees, as the turn under way reads it out. */
  readonly angle = computed(() => this.rotationGuide.turn()?.angle ?? shownAngle(this.host.rotate()));

  /** The step a held Alt turns the piece by on the table in view. */
  readonly snapStep = computed(() => rotationSnapStep(this.tabletopService.gridType()));

  /**
   * The ring round the pedestal that turns the piece, in the pedestal's own pixels: where a press
   * takes hold of it, the pedestal cut out of a hex one, as the rim of a hex pedestal is the
   * pedestal; the ring drawn, but for what the piece hides of it; and the middles of the knobs on the
   * side the piece faces and behind it, which turn with it and so tell which way it faces, each with
   * whether it is shown: a knob behind the picture is hidden by it as the ring is, and one standing
   * where the handle that tips the piece is drawn gives way to it. Both stay while the piece is turned,
   * so that the one in hand is never taken away.
   */
  readonly ring = computed(() => {
    const { grab, middle, radius } = this.ringShape();
    const point = (angle: number, about: number, reach: number) => {
      const radians = (angle * Math.PI) / 180;
      return { x: about + reach * Math.sin(radians), y: about - reach * Math.cos(radians) };
    };
    const seen = this.ringSeen();
    const clear = this.knobsClearOfRoll();
    const turning = this.turning() === 'turn';
    const knobs = TURN_KNOB_ANGLES.map((angle, at) => ({
      ...point(angle, middle, radius),
      facing: angle === 0,
      seen: turning || (seen[Math.round(angle / (360 / TURN_RING_SAMPLES)) % TURN_RING_SAMPLES] && clear[at]),
    }));
    return { grab, ring: ringBoxStyle(middle, radius), knobs, arc: ringPathOf(seen, radius), radius };
  });

  /**
   * Whether the piece is in hand, from the press on it until it is put down, however that ends: while
   * it is, nothing round its pedestal is weighed.
   */
  private readonly carried = computed(() => {
    const id = this.host.character()?.identifier;
    return !!id && this.heldPiece.held()?.identifier === id;
  });

  /** The piece's picture as it is drawn now, kept as long as it is drawn the same, or null where none is. */
  private readonly ownPicture = computed(() => {
    const id = this.host.character()?.identifier;
    return id ? (this.pieces.sprites().find((sprite) => sprite.id === `${id}#picture`) ?? null) : null;
  });

  /**
   * How the piece's picture stands before the eye as it is drawn now, weighed only while the handles
   * are out and the piece is not being carried: followed as the camera moves and the picture changes.
   */
  private readonly pictureSight = computed(() => {
    const looked =
      (this.viewport.canHover() && this.hovered() && !this.carried()) ||
      this.pressChosen() ||
      this.turning() === 'turn';
    const picture = looked ? this.ownPicture() : null;
    if (!picture) return null;
    this.tableCamera.version();
    return this.pick.pictureSightOf(picture);
  });

  /** The middle of the pedestal on the face it stands on, at the height the ring round it is drawn at. */
  readonly ringMiddle = computed(() => {
    const char = this.host.character();
    if (!char) return null;
    this.objectChange.versionOf(char.identifier)();
    const middle = (this.host.size() * this.host.gridSize()) / 2;
    const foot = this.pieces.footOf(char);
    return { ...foot, x: foot.x + middle, y: foot.y + middle };
  });

  /**
   * Whether each knob round the ring stands clear, on the screen, of the handle that tips the piece,
   * beside the top of its picture.
   */
  private readonly knobsClearOfRoll = computed<readonly boolean[]>(() => {
    if (this.turning() === 'turn' || this.host.flat()) return TURN_KNOB_ANGLES.map(() => true);
    const sight = this.pictureSight();
    const middle = this.ringMiddle();
    if (!sight || !middle || !this.host.hasPicture()) {
      return TURN_KNOB_ANGLES.map(() => true);
    }
    const corner = sight.cornerOnPage(1);
    const [handle] = this.rollHandles();
    const roll = { x: corner.x + handle.dx, y: corner.y + handle.dy };
    const radius = this.ringShape().radius;
    return TURN_KNOB_ANGLES.map((angle) => {
      const radians = ((this.host.rotate() + angle) * Math.PI) / 180;
      const x = middle.x + radius * Math.sin(radians);
      const y = middle.y - radius * Math.cos(radians);
      const page = this.surfaces.pageOf(middle.surface, x, y, middle.height);
      return !page || Math.hypot(page.x - roll.x, page.y - roll.y) >= this.host.handleSizePx();
    });
  });

  /**
   * Whether the pointer is over the piece, which brings its handles out where the main pointer can
   * hover; where it cannot, a finger's or a pen's passing over a piece says so too, and brings
   * nothing out, so a reader weighs it only where the viewport says the main pointer can hover.
   */
  readonly hovered = signal(false);

  /**
   * Which of the points round the ring, clockwise from the side the piece faces, the eye sees: those
   * the piece's own picture stands in front of are left out, so that the ring is drawn round the
   * piece and behind it rather than over it.
   */
  readonly ringSeen = computed<readonly boolean[]>(() => {
    const sight = this.pictureSight();
    const middle = this.ringMiddle();
    const radius = this.ringShape().radius;
    return Array.from({ length: TURN_RING_SAMPLES }, (_, at) => {
      if (!sight || !middle) return true;
      const angle = ((this.host.rotate() + (at * 360) / TURN_RING_SAMPLES) * Math.PI) / 180;
      const x = middle.x + radius * Math.sin(angle);
      const y = middle.y - radius * Math.cos(angle);
      return !sight.hides(middle.surface, x, y, middle.height);
    });
  });

  /** Where the ring round the pedestal lies, in the pedestal's own pixels: a hex one's round the hex. */
  private readonly ringShape = computed(() => {
    const width = this.host.size() * this.host.gridSize();
    const hex = this.host.hexPedestal();
    const grab = hex
      ? hexPedestalGrabStyle(hex, { reachPx: TURN_RING_REACH_PX, pedestalCutOut: true })
      : ringBoxStyle(width / 2, width / 2 + TURN_RING_REACH_PX);
    return { grab, middle: hex ? hex.L / 2 : width / 2, radius: parseFloat(grab['width']) / 2 };
  });

  /**
   * The marks round the ring at every step a held Alt turns the piece to, the table's own directions
   * that stay put as the ring turns with the piece, on what the eye sees of the ring, in its own
   * pixels.
   */
  readonly ticks = computed(() => {
    const radius = this.ring().radius;
    const seen = this.ringSeen();
    const step = this.snapStep();
    const marks: { x: number; y: number }[] = [];
    for (let table = 0; table < 360; table += step) {
      const angle = (((table - this.host.rotate()) % 360) + 360) % 360;
      if (!seen[Math.round(angle / (360 / TURN_RING_SAMPLES)) % TURN_RING_SAMPLES]) continue;
      const radians = (angle * Math.PI) / 180;
      marks.push({ x: radius + radius * Math.sin(radians), y: radius - radius * Math.cos(radians) });
    }
    return marks;
  });

  /**
   * How far the piece leans, read out while it is tipped: in degrees either way of upright, and a
   * wedge from upright to it round a dial 20 across, with the point it reaches.
   */
  readonly rollGauge = computed(() => {
    const degrees = Math.round(((((this.host.roll() % 360) + 540) % 360) - 180) * 10) / 10;
    const radians = (degrees * Math.PI) / 180;
    const tip = { x: 10 + 7.5 * Math.sin(radians), y: 10 - 7.5 * Math.cos(radians) };
    const sweep = degrees >= 0 ? 1 : 0;
    const wedge = degrees === 0 ? '' : `M10 10 L10 2.5 A7.5 7.5 0 0 ${sweep} ${tip.x} ${tip.y} Z`;
    return { degrees: Math.round(degrees), wedge, tip };
  });
}

/** The box of a circle round a middle of a pedestal, in the pedestal's own pixels, as a style. */
function ringBoxStyle(middle: number, radius: number): Record<string, string> {
  return {
    width: `${radius * 2}px`,
    height: `${radius * 2}px`,
    left: `${middle - radius}px`,
    top: `${middle - radius}px`,
    borderRadius: '50%',
  };
}

/**
 * The ring round a pedestal as a path, in the ring's own pixels: the whole circle where every point
 * round it is seen, or else each run of points seen, round from where one is not.
 */
export function ringPathOf(seen: readonly boolean[], radius: number): string {
  const count = seen.length;
  if (seen.every(Boolean)) {
    return `M${radius} 0 A${radius} ${radius} 0 1 1 ${radius} ${radius * 2} A${radius} ${radius} 0 1 1 ${radius} 0`;
  }
  const pointAt = (at: number) => {
    const radians = (at * 2 * Math.PI) / count;
    return `${radius + radius * Math.sin(radians)} ${radius - radius * Math.cos(radians)}`;
  };
  const hidden = seen.indexOf(false);
  let path = '';
  let drawing = false;
  for (let step = 1; step <= count; step++) {
    const at = (hidden + step) % count;
    if (!seen[at]) {
      drawing = false;
      continue;
    }
    path += `${drawing ? 'L' : 'M'}${pointAt(at)} `;
    drawing = true;
  }
  return path.trim();
}

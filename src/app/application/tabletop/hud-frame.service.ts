import { effect, EffectRef, inject, Injectable, Injector, untracked } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { tableEyeMatrix } from '@axe/domain/tabletop/camera/table-camera';
import { PageBox, PiecePageBoxes, piecePageBoxes } from '@axe/domain/tabletop/world/page-boxes';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';

/**
 * Where an element of the screen over a table drawn on a canvas is put against the part of the piece
 * it goes with: over the part, stretched to its box, or above or below its middle, at the size the
 * part is drawn at, as a name hangs over a piece.
 */
export type HudPlace = 'box' | 'above' | 'below';

/** What an element is put against: a piece, and a part of it, or the whole piece where none is named. */
export interface HudAnchor {
  readonly owner: string;
  readonly part?: string;
  readonly place?: HudPlace;
}

interface Placed {
  anchor: HudAnchor;
  written: string | null;
}

/**
 * Puts the elements of the screen over a table drawn on a canvas where the pieces they go with are
 * drawn, in the frame after the camera or the pieces move, by writing their styles rather than
 * through change detection.
 *
 * The element put against a whole piece is its root, put on the page; it is drawn over the root of
 * a piece drawn further off. Every other element of a piece lies in that root and is put against it.
 * An element whose piece or part is not drawn is hidden.
 */
@Injectable({ providedIn: 'root' })
export class HudFrameService {
  private readonly camera = inject(TableCameraService);
  private readonly pieces = inject(TablePiecesService);
  private readonly injector = inject(Injector);
  private readonly placed = new Map<HTMLElement, Placed>();
  private following: EffectRef | null = null;
  private frame: number | null = null;

  /** Puts an element against a piece from now on. Hands back the way to stop. */
  place(element: HTMLElement, anchor: HudAnchor): () => void {
    const placed: Placed = { anchor, written: null };
    this.placed.set(element, placed);
    this.follow();
    this.writeSoon();
    return () => {
      if (this.placed.get(element) !== placed) return;
      this.placed.delete(element);
      if (this.placed.size === 0) {
        this.following?.destroy();
        this.following = null;
      }
    };
  }

  /** Where every piece drawn on the table shows on the page now, or null before the camera is set. */
  boxesNow(): Map<string, PiecePageBoxes> | null {
    const scene = this.camera.sceneMatrix();
    const view = this.camera.view;
    const layout = this.camera.layout;
    if (!scene || !view || !layout) return null;
    return piecePageBoxes(
      untracked(this.pieces.sprites),
      untracked(this.pieces.coins),
      scene,
      eyeAxesOf(tableEyeMatrix(view, layout))
    );
  }

  /** Puts every element where it goes now, rather than in the next frame. */
  writeNow(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.write();
  }

  private follow(): void {
    if (this.following) return;
    this.following = effect(
      () => {
        this.camera.version();
        this.pieces.sprites();
        this.pieces.coins();
        untracked(() => this.writeSoon());
      },
      { injector: this.injector }
    );
  }

  private writeSoon(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.write();
    });
  }

  private write(): void {
    const boxes = this.boxesNow();
    if (!boxes) return;
    const ranks = new Map(
      [...boxes].sort(([, a], [, b]) => a.nearness - b.nearness).map(([owner], rank) => [owner, rank + 1])
    );
    for (const [element, placed] of this.placed) {
      const piece = boxes.get(placed.anchor.owner);
      const style = piece ? styleOf(placed.anchor, piece, ranks.get(placed.anchor.owner) ?? 0) : null;
      const written = style ? JSON.stringify(style) : '';
      if (written === placed.written) continue;
      placed.written = written;
      element.style.visibility = style ? '' : 'hidden';
      if (!style) continue;
      element.style.transform = style.transform;
      element.style.width = style.width;
      element.style.height = style.height;
      element.style.zIndex = style.zIndex;
    }
  }
}

interface HudStyle {
  readonly transform: string;
  readonly width: string;
  readonly height: string;
  readonly zIndex: string;
}

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

/** The style that puts an element against a piece drawn in these boxes. */
function styleOf(anchor: HudAnchor, piece: PiecePageBoxes, rank: number): HudStyle | null {
  const whole = piece.whole;
  if (anchor.part === undefined) {
    return {
      transform: `translate(${px(whole.left)}, ${px(whole.top)})`,
      width: px(whole.width),
      height: px(whole.height),
      zIndex: String(rank),
    };
  }
  const part = piece.parts.get(anchor.part);
  if (!part) return null;
  const within: PageBox = { ...part, left: part.left - whole.left, top: part.top - whole.top };
  const place = anchor.place ?? 'box';
  if (place === 'box') {
    return {
      transform: `translate(${px(within.left)}, ${px(within.top)})`,
      width: px(within.width),
      height: px(within.height),
      zIndex: '',
    };
  }
  const middle = within.left + within.width / 2;
  const edge = place === 'above' ? within.top : within.top + within.height;
  const shift = place === 'above' ? '-100%' : '0';
  return {
    transform: `translate(${px(middle)}, ${px(edge)}) scale(${Math.round(part.scale * 1000) / 1000}) translate(-50%, ${shift})`,
    width: '',
    height: '',
    zIndex: '',
  };
}

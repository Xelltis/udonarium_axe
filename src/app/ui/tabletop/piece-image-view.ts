import { computed, linkedSignal, Signal } from '@angular/core';
import { BillboardFacing, NOT_TURNED } from '@axe/application/ui/billboard-frame.service';
import { supersampleFactor, supersampleInsetPercent, supersampleTransform } from '@axe/ui/tabletop/supersample';

export interface PieceImageViewInputs {
  imageUrl: Signal<string>;
  isPoster: Signal<boolean>;
  sizePx: Signal<number>;
  specifiedHeightPx: Signal<number | null>;
  billboardEnabled: Signal<boolean>;
  billboardFacing: Signal<BillboardFacing>;
  squarePoster?: boolean;
  /** Whether the picture is held to the ground the piece stands on, rather than towering over it. */
  fitInCell?: Signal<boolean>;
}

export interface PieceImageView {
  readonly naturalSize: Signal<{ width: number; height: number } | null>;
  /** Whether the picture is drawn inside a box of the piece's own ground rather than above it. */
  readonly fitsInCell: Signal<boolean>;
  readonly supersample: Signal<number>;
  readonly supersamplePercent: Signal<string>;
  readonly supersampleInset: Signal<string>;
  readonly boxHeightPx: Signal<number | null>;
  readonly komaFacing: Signal<BillboardFacing>;
  readonly pieceFacing: Signal<BillboardFacing>;
  readonly posterTransform: Signal<string>;
  onImageLoad(event: Event): void;
}

/**
 * Works out how a piece's picture is sized and transformed from its inputs, as signals a piece
 * component binds in its template.
 *
 * The picture's natural size is unknown until `onImageLoad` is called from the image's load
 * event, and forgotten again whenever the image URL changes; until then no supersampling is
 * applied.
 */
export function pieceImageView(inputs: PieceImageViewInputs): PieceImageView {
  const natural = linkedSignal<string, { width: number; height: number } | null>({
    source: inputs.imageUrl,
    computation: () => null,
  });
  const squarePoster = () => inputs.squarePoster === true && inputs.isPoster();
  /**
   * Whether the picture is held inside the ground the piece stands on.
   *
   * A poster lies on the ground and has always been held to it. A piece asked to be held is
   * measured the same way: by whichever of its sides runs out of room first, so the whole
   * picture is inside the cell rather than the cell inside the picture.
   */
  const fitsInCell = computed(() => !inputs.isPoster() && (inputs.fitInCell?.() ?? false));

  const supersample = computed(() => {
    const size = natural();
    if (!size) return 1;
    if (squarePoster() || fitsInCell()) return supersampleFactor(Math.min(size.width, size.height), inputs.sizePx());
    const specified = inputs.specifiedHeightPx();
    if (specified !== null) return supersampleFactor(size.height, specified);
    return supersampleFactor(size.width, inputs.sizePx());
  });

  const boxHeightPx = computed(() => {
    const size = natural();
    if (fitsInCell()) return inputs.sizePx();
    if (!size || supersample() <= 1 || squarePoster()) return null;
    const specified = inputs.specifiedHeightPx();
    if (specified !== null) return specified;
    return (inputs.sizePx() * size.height) / size.width;
  });

  /** What the picture is turned by, which is nothing at all where the piece does not billboard. */
  const inner = (): BillboardFacing => (inputs.billboardEnabled() ? inputs.billboardFacing() : NOT_TURNED);

  return {
    naturalSize: natural.asReadonly(),
    fitsInCell,
    supersample,
    supersamplePercent: computed(() => supersample() * 100 + '%'),
    supersampleInset: computed(() => supersampleInsetPercent(supersample()) + '%'),
    boxHeightPx,
    komaFacing: computed<BillboardFacing>(() => {
      const factor = supersample();
      const outer = `translateX(-50%) translateX(${inputs.sizePx() / 2}px)`;
      const facing = inner();
      return (rotation) => supersampleTransform({ factor, anchor: 'bottom', outer, inner: facing(rotation) });
    }),
    pieceFacing: computed<BillboardFacing>(() => {
      const factor = supersample();
      const facing = inner();
      return (rotation) => supersampleTransform({ factor, anchor: 'bottom', inner: facing(rotation) });
    }),
    posterTransform: computed(() => supersampleTransform({ factor: supersample(), anchor: 'center' })),
    onImageLoad(event: Event): void {
      const img = event.target as HTMLImageElement;
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      natural.set({ width: img.naturalWidth, height: img.naturalHeight });
    },
  };
}

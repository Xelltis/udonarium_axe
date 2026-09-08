import { computed, linkedSignal, Signal } from '@angular/core';
import { supersampleFactor, supersampleInsetPercent, supersampleTransform } from '@axe/ui/tabletop/supersample';

export interface PieceImageViewInputs {
  imageUrl: Signal<string>;
  isPoster: Signal<boolean>;
  sizePx: Signal<number>;
  specifiedHeightPx: Signal<number | null>;
  billboardEnabled: Signal<boolean>;
  billboardTransform: Signal<string>;
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
  readonly komaTransform: Signal<string>;
  readonly pieceTransform: Signal<string>;
  readonly posterTransform: Signal<string>;
  onImageLoad(event: Event): void;
}

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

  const inner = () => (inputs.billboardEnabled() ? inputs.billboardTransform() : '');

  return {
    naturalSize: natural.asReadonly(),
    fitsInCell,
    supersample,
    supersamplePercent: computed(() => supersample() * 100 + '%'),
    supersampleInset: computed(() => supersampleInsetPercent(supersample()) + '%'),
    boxHeightPx,
    komaTransform: computed(() =>
      supersampleTransform({
        factor: supersample(),
        anchor: 'bottom',
        outer: `translateX(-50%) translateX(${inputs.sizePx() / 2}px)`,
        inner: inner(),
      })
    ),
    pieceTransform: computed(() => supersampleTransform({ factor: supersample(), anchor: 'bottom', inner: inner() })),
    posterTransform: computed(() => supersampleTransform({ factor: supersample(), anchor: 'center' })),
    onImageLoad(event: Event): void {
      const img = event.target as HTMLImageElement;
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
      natural.set({ width: img.naturalWidth, height: img.naturalHeight });
    },
  };
}

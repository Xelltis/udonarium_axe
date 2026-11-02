import { SurfaceFrame } from '@axe/domain/tabletop/surface-space';
import { pointOnFace, TableWorldSprite, turnedOnFace } from '@axe/domain/tabletop/world/table-sprites';

/** The aliases a card and a stack of cards are known by. */
export const CARD_KIND = 'card';
export const CARD_STACK_KIND = 'card-stack';

/** How far the page lifts a card or a stack off the face it lies on, and how much more for each step up the pile. */
const LIFT_PX = 0.15;
const LIFT_PER_ZINDEX_PX = 0.001;

/** How much smaller a card peeked at is drawn than the back it is peeked through, and how clear. */
const PEEK_SCALE = 0.9;
const PEEK_OPACITY = 0.8;

/** The rim round the top card of a stack, the corners of a stack, and how big an empty stack is, in table pixels. */
const STACK_RIM_PX = 5;
const STACK_RADIUS_PX = 5;
const EMPTY_STACK_PX = 100;
/** How thick a stack stands for each card in it, how thick at most, and in how many layers at most. */
const STACK_PX_PER_CARD = 1;
const STACK_MAX_THICKNESS_PX = 60;
const STACK_MAX_LAYERS = 30;
/** The colours a stack's layers take in turn, as the edges of the cards in it. */
const STACK_LAYER_COLOURS = ['#f5efe2', '#2a1f0d'] as const;

/** A picture and how big it is, in its own pixels. */
export interface SizedPicture {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

/** Where a piece lying on a face stands: the face, its corner, and how far off the face it lies. */
interface LyingPlace {
  readonly id: string;
  readonly frame: SurfaceFrame;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Which of the pieces lying in one place is on top: the greater over the lesser. */
  readonly zindex: number;
  readonly rotateDeg: number;
}

/** A card on the table, as much of it as is drawn. */
export interface CardLayout extends LyingPlace {
  /** How wide it is, in table pixels. */
  readonly widthPx: number;
  /** The picture of the face it shows, or null while that is not known. */
  readonly picture: SizedPicture | null;
  /** The front this seat peeks at over the back the card shows, or null where it does not. */
  readonly peek: SizedPicture | null;
}

/** A stack of cards on the table, as much of it as is drawn. */
export interface CardStackLayout extends LyingPlace {
  /** How wide its top card is, in table pixels. */
  readonly widthPx: number;
  readonly cardCount: number;
  /** Whether it stands as thick as its cards, as it does on the floor of a table seen in 3D. */
  readonly thick: boolean;
  /** Its top card's picture and how far that card is turned on it, or null for an empty stack. */
  readonly top: { readonly picture: SizedPicture | null; readonly rotateDeg: number } | null;
  /** The colour of the plate the top card lies on. */
  readonly plateColour: string;
}

/** A rounded box filled with one colour. */
function filled(colour: string, radiusPx: number) {
  return { kind: 'frame', bands: [{ widthPx: Number.MAX_SAFE_INTEGER, colour }], radiusPx } as const;
}

/**
 * The sprites a card is drawn with: the picture of the face it shows, lying on its face as wide as
 * the card and turned as the card is. Where this seat peeks at a card lying face down, the front
 * lies over the back, a little smaller and a little clear.
 */
export function cardSprites(card: CardLayout): TableWorldSprite[] {
  const picture = card.picture;
  const width = card.widthPx;
  if (!picture || !(width > 0) || !(picture.width > 0) || !(picture.height > 0)) return [];
  const height = (width * picture.height) / picture.width;
  const out = card.z + LIFT_PX + card.zindex * LIFT_PER_ZINDEX_PX;
  const facing = turnedOnFace(card.frame, card.rotateDeg);
  const centre = pointOnFace(card.frame, card.x + width / 2, card.y + height / 2, out);
  const sprites: TableWorldSprite[] = [
    {
      id: `${card.id}#face`,
      owner: card.id,
      kind: CARD_KIND,
      centre,
      widthPx: width,
      heightPx: height,
      facing,
      look: { kind: 'picture', url: picture.url },
      brightness: 1,
      twoSided: false,
      order: out,
    },
  ];
  const peek = card.peek;
  if (peek && peek.width > 0 && peek.height > 0) {
    const fit = Math.min(width / peek.width, height / peek.height) * PEEK_SCALE;
    sprites.push({
      id: `${card.id}#peek`,
      owner: card.id,
      kind: CARD_KIND,
      centre,
      widthPx: peek.width * fit,
      heightPx: peek.height * fit,
      facing,
      look: { kind: 'picture', url: peek.url },
      brightness: 1,
      opacity: PEEK_OPACITY,
      twoSided: false,
      order: out,
    });
  }
  return sprites;
}

/**
 * The sprites a stack of cards is drawn with. On the floor a stack of more than one card stands as
 * thick as its cards, in layers the colours of their edges; on its top lies a plate a little wider
 * than its top card, and on that the top card's picture, turned as that card is on the stack. An
 * empty stack is a bare plate.
 */
export function cardStackSprites(stack: CardStackLayout): TableWorldSprite[] {
  const width = stack.widthPx;
  if (!(width > 0)) return [];
  const top = stack.top;
  const picture = top?.picture ?? null;
  if (top && (!picture || !(picture.width > 0) || !(picture.height > 0))) return [];
  const pictureWidth = width - STACK_RIM_PX * 2;
  const pictureHeight = picture ? (pictureWidth * picture.height) / picture.width : 0;
  const height = top ? pictureHeight + STACK_RIM_PX * 2 : EMPTY_STACK_PX;
  const facing = turnedOnFace(stack.frame, stack.rotateDeg);
  const middleAcross = stack.x - STACK_RIM_PX + width / 2;
  const middleDown = stack.y - STACK_RIM_PX + height / 2;
  const base = stack.z + LIFT_PX + stack.zindex * LIFT_PER_ZINDEX_PX;
  const layered = stack.thick && stack.cardCount > 1;
  const thickness = layered ? Math.min(STACK_MAX_THICKNESS_PX, stack.cardCount * STACK_PX_PER_CARD) : 0;
  const sprite = (part: string, out: number, rest: Partial<TableWorldSprite>): TableWorldSprite => ({
    id: `${stack.id}#${part}`,
    owner: stack.id,
    kind: CARD_STACK_KIND,
    centre: pointOnFace(stack.frame, middleAcross, middleDown, out),
    widthPx: width,
    heightPx: height,
    facing,
    look: filled(stack.plateColour, STACK_RADIUS_PX),
    brightness: 1,
    twoSided: !stack.thick,
    order: out,
    ...rest,
  });
  const sprites: TableWorldSprite[] = [];
  if (layered) {
    const layers = Math.min(stack.cardCount - 1, STACK_MAX_LAYERS);
    for (let i = 0; i < layers; i++) {
      const out = base + (i * thickness) / layers;
      sprites.push(sprite(`layer-${i}`, out, { look: filled(STACK_LAYER_COLOURS[i % 2], STACK_RADIUS_PX) }));
    }
  }
  sprites.push(sprite('plate', base + thickness, {}));
  if (picture && top) {
    sprites.push(
      sprite('top', base + thickness, {
        widthPx: pictureWidth,
        heightPx: pictureHeight,
        facing: turnedOnFace(stack.frame, stack.rotateDeg + top.rotateDeg),
        look: { kind: 'picture', url: picture.url },
      })
    );
  }
  return sprites;
}

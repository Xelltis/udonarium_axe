import { COIN_EMBLEM_CENTRE, coinLaurel, coinStar, coinStarRays } from '@axe/domain/coin/coin-emblem';

/** How a side of a coin is struck: its metal, lit from the upper left, its rim, and the colours of its emblem. */
interface SideStyle {
  readonly metal: readonly [string, string, string];
  readonly border: string;
  readonly ring: string;
  readonly shade: string;
  readonly dots: string;
}

const STYLES: Record<'front' | 'back', SideStyle> = {
  front: {
    metal: ['#ffeeb4', '#e0ac45', '#a97c22'],
    border: '#8a5f18',
    ring: 'rgba(255,240,190,0.35)',
    shade: 'rgba(120,80,10,0.55)',
    dots: 'rgba(120,82,16,0.5)',
  },
  back: {
    metal: ['#f3dda0', '#c8933a', '#8d6519'],
    border: '#6f4a12',
    ring: 'rgba(240,220,170,0.3)',
    shade: 'rgba(90,60,8,0.6)',
    dots: 'rgba(102,68,12,0.5)',
  },
};

/** How wide the rim of a side is, how wide the bright ring inside it, and how far its shade reaches in, in table pixels. */
const BORDER_PX = 2;
const RING_PX = 3;
const SHADE_PX = 10;

/**
 * Paints a side of a coin as the page paints it, on a square canvas: round metal lit from the upper
 * left, a bright ring and a soft shade inside its rim, and over them its own picture filling the
 * coin, or the emblem struck on that side. `diameter` is how wide the coin is drawn, which the rim
 * and the ring are measured against.
 */
export function paintCoinSide(
  canvas: HTMLCanvasElement,
  side: 'front' | 'back',
  diameter: number,
  picture: HTMLImageElement | null
): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  const size = canvas.width;
  const scale = size / Math.max(diameter, 1);
  const style = STYLES[side];
  const middle = size / 2;
  const inside = middle - BORDER_PX * scale;
  context.clearRect(0, 0, size, size);
  context.save();
  context.beginPath();
  context.arc(middle, middle, middle, 0, Math.PI * 2);
  context.clip();
  const metal = context.createRadialGradient(
    size * 0.3,
    size * 0.28,
    0,
    size * 0.3,
    size * 0.28,
    size * Math.hypot(0.7, 0.72)
  );
  metal.addColorStop(0, style.metal[0]);
  metal.addColorStop(0.58, style.metal[1]);
  metal.addColorStop(1, style.metal[2]);
  context.fillStyle = metal;
  context.fillRect(0, 0, size, size);
  context.beginPath();
  context.arc(middle, middle, inside, 0, Math.PI * 2);
  context.clip();
  const shade = context.createRadialGradient(
    middle,
    middle,
    Math.max(0, inside - SHADE_PX * scale),
    middle,
    middle,
    inside
  );
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, style.shade);
  context.fillStyle = shade;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = style.ring;
  context.lineWidth = RING_PX * scale;
  context.beginPath();
  context.arc(middle, middle, inside - (RING_PX * scale) / 2, 0, Math.PI * 2);
  context.stroke();
  const left = middle - inside;
  if (picture) {
    coverWith(context, picture, left, inside * 2);
  } else {
    context.translate(left, left);
    context.scale((inside * 2) / 100, (inside * 2) / 100);
    if (side === 'front') strikeStar(context, style);
    else strikeLaurel(context, style);
  }
  context.restore();
  context.strokeStyle = style.border;
  context.lineWidth = BORDER_PX * scale;
  context.beginPath();
  context.arc(middle, middle, middle - (BORDER_PX * scale) / 2, 0, Math.PI * 2);
  context.stroke();
}

/** Draws a picture over a square, cut to fill it however its own proportions run, as the page fits it. */
function coverWith(context: CanvasRenderingContext2D, picture: HTMLImageElement, at: number, side: number): void {
  const width = picture.naturalWidth;
  const height = picture.naturalHeight;
  if (!(width > 0) || !(height > 0)) return;
  const cut = Math.min(width, height);
  context.drawImage(picture, (width - cut) / 2, (height - cut) / 2, cut, cut, at, at, side, side);
}

function polygon(context: CanvasRenderingContext2D, points: string, fill: string, down = 0): void {
  context.beginPath();
  for (const [i, point] of points.split(' ').entries()) {
    const [x, y] = point.split(',').map(Number);
    if (i === 0) context.moveTo(x, y + down);
    else context.lineTo(x, y + down);
  }
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function disc(context: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string): void {
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
}

/** The dotted ring an emblem is struck inside. */
function dottedRing(context: CanvasRenderingContext2D, colour: string): void {
  context.save();
  context.strokeStyle = colour;
  context.lineWidth = 2.4;
  context.lineCap = 'round';
  context.setLineDash([1.3, 4.4]);
  context.beginPath();
  context.arc(COIN_EMBLEM_CENTRE, COIN_EMBLEM_CENTRE, 40, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

/** The star struck on a coin's front, with the rays behind it and the stud in its middle. */
function strikeStar(context: CanvasRenderingContext2D, style: SideStyle): void {
  dottedRing(context, style.dots);
  polygon(context, coinStarRays, 'rgba(255,246,214,0.35)', 1.1);
  polygon(context, coinStarRays, 'rgba(146,100,22,0.26)');
  polygon(context, coinStar, 'rgba(255,246,214,0.55)', 1.4);
  polygon(context, coinStar, 'rgba(126,86,18,0.78)');
  disc(context, 50, 51, 4.6, 'rgba(255,246,214,0.5)');
  disc(context, 50, 50, 4.2, 'rgba(170,120,32,0.7)');
}

/** The laurel struck on a coin's back, with the diamond in its middle. */
function strikeLaurel(context: CanvasRenderingContext2D, style: SideStyle): void {
  dottedRing(context, style.dots);
  for (const [down, fill] of [
    [1.3, 'rgba(250,236,190,0.5)'],
    [0, 'rgba(112,76,14,0.72)'],
  ] as const) {
    for (const leaf of coinLaurel) {
      context.save();
      context.translate(leaf.cx, leaf.cy + down);
      context.rotate((leaf.rotate * Math.PI) / 180);
      context.beginPath();
      context.ellipse(0, 0, leaf.rx, leaf.ry, 0, 0, Math.PI * 2);
      context.fillStyle = fill;
      context.fill();
      context.restore();
    }
  }
  polygon(context, '50,33 61,50 50,67 39,50', 'rgba(250,236,190,0.5)', 1.4);
  polygon(context, '50,33 61,50 50,67 39,50', 'rgba(112,76,14,0.78)');
  polygon(context, '50,41 55.5,50 50,59 44.5,50', 'rgba(214,166,74,0.85)');
}

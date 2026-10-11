import { headingVector } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { MinimapTone, MinimapView } from '@axe/domain/tabletop/first-person/minimap-view';

export interface MinimapCanvas {
  canvas: { width: number; height: number };
  fillStyle: string | CanvasGradient | CanvasPattern | object;
  save(): void;
  restore(): void;
  clearRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, from: number, to: number): void;
  clip(): void;
  fill(): void;
}

export type MinimapPalette = Record<MinimapTone | 'background' | 'arrow', string>;

export const MINIMAP_PALETTE: MinimapPalette = {
  background: 'rgba(0, 0, 0, 0.55)',
  floor: 'rgba(214, 200, 170, 0.75)',
  wall: 'rgba(70, 64, 58, 0.95)',
  noEntry: 'rgba(190, 60, 60, 0.7)',
  doorShut: 'rgba(150, 90, 40, 0.95)',
  doorOpen: 'rgba(230, 180, 90, 0.8)',
  arrow: '#ffd54a',
};

export function paintMinimap(ctx: MinimapCanvas, view: MinimapView, palette: MinimapPalette = MINIMAP_PALETTE): void {
  const { width, height } = ctx.canvas;
  const size = Math.min(width, height);
  const middleX = width / 2;
  const middleY = height / 2;
  const scale = view.radiusPx > 0 ? size / 2 / view.radiusPx : 1;
  const at = (x: number, y: number) => ({
    x: middleX + (x - view.centre.x) * scale,
    y: middleY + (y - view.centre.y) * scale,
  });

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.arc(middleX, middleY, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = palette.background;
  ctx.fill();
  ctx.clip();

  for (const cell of view.cells) {
    ctx.beginPath();
    cell.outline.forEach((point, index) => {
      const drawn = at(point.x, point.y);
      if (index === 0) ctx.moveTo(drawn.x, drawn.y);
      else ctx.lineTo(drawn.x, drawn.y);
    });
    ctx.closePath();
    ctx.fillStyle = palette[cell.tone];
    ctx.fill();
  }

  const heading = headingVector(view.yaw);
  const reach = Math.max(4, size * 0.07);
  const sideX = -heading.y;
  const sideY = heading.x;
  ctx.beginPath();
  ctx.moveTo(middleX + heading.x * reach, middleY + heading.y * reach);
  ctx.lineTo(
    middleX - heading.x * reach * 0.6 + sideX * reach * 0.6,
    middleY - heading.y * reach * 0.6 + sideY * reach * 0.6
  );
  ctx.lineTo(
    middleX - heading.x * reach * 0.6 - sideX * reach * 0.6,
    middleY - heading.y * reach * 0.6 - sideY * reach * 0.6
  );
  ctx.closePath();
  ctx.fillStyle = palette.arrow;
  ctx.fill();
  ctx.restore();
}

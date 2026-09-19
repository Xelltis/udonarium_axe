import { containRect } from '@axe/domain/replay/replay-picture-fit';
import type { TablePhotoLayout } from '@axe/domain/replay/table-photo';
import {
  REPLAY_FRAME_FONT_FAMILY,
  type ReplayFrameAssets,
  type ReplayFrameCanvas,
  roundedRectPath,
} from '@axe/infrastructure/replay/replay-canvas';

export interface TablePhotoStyle {
  backdrop: string;
  cell: string;
  cellEdge: string;
  title: string;
  subtitle: string;
  name: string;
  nameBackdrop: string;
  fontFamily: string;
}

export const DEFAULT_TABLE_PHOTO_STYLE: TablePhotoStyle = {
  backdrop: '#12141b',
  cell: 'rgba(255, 255, 255, 0.05)',
  cellEdge: 'rgba(255, 255, 255, 0.16)',
  title: '#ffffff',
  subtitle: 'rgba(255, 255, 255, 0.72)',
  name: 'rgba(255, 255, 255, 0.94)',
  nameBackdrop: 'rgba(0, 0, 0, 0.45)',
  fontFamily: REPLAY_FRAME_FONT_FAMILY,
};

/**
 * Draws the table photo: a title and subtitle over a grid of cells, each showing a portrait and
 * a name plate. Text too long for its space is cut short with an ellipsis.
 */
export function paintTablePhoto(
  ctx: ReplayFrameCanvas,
  layout: TablePhotoLayout,
  assets: ReplayFrameAssets,
  title: string,
  subtitle: string,
  style: TablePhotoStyle = DEFAULT_TABLE_PHOTO_STYLE
): void {
  ctx.fillStyle = style.backdrop;
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = style.title;
  ctx.font = `600 ${layout.title.fontSize}px ${style.fontFamily}`;
  ctx.fillText(fitText(ctx, title, layout.title.maxWidth), layout.title.x, layout.title.y);

  ctx.fillStyle = style.subtitle;
  ctx.font = `${layout.subtitle.fontSize}px ${style.fontFamily}`;
  ctx.fillText(fitText(ctx, subtitle, layout.title.maxWidth), layout.subtitle.x, layout.subtitle.y);

  const inset = Math.round(layout.scale * 12);
  for (const cell of layout.cells) {
    ctx.fillStyle = style.cell;
    ctx.strokeStyle = style.cellEdge;
    ctx.lineWidth = Math.max(1, Math.round(layout.scale * 2));
    const rounded = roundedRectPath(ctx, cell.x, cell.y, cell.width, cell.height, layout.radius);
    if (rounded) {
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height);
      ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
    }

    // Draw inside the frame only, so neither the name plate nor the portrait escapes the rounded corners.
    ctx.save();
    if (rounded) ctx.clip();

    const image = assets.imageOf(cell.imageIdentifier);
    if (image) {
      const boxHeight = cell.height - layout.name.height - inset * 2;
      const box = containRect({ width: image.width, height: image.height }, cell.width - inset * 2, boxHeight);
      ctx.drawImage(
        image,
        Math.round(cell.x + (cell.width - box.width) / 2),
        Math.round(cell.y + inset + (boxHeight - box.height) / 2),
        Math.round(box.width),
        Math.round(box.height)
      );
    }

    ctx.fillStyle = style.nameBackdrop;
    ctx.fillRect(cell.x, cell.y + cell.height - layout.name.height, cell.width, layout.name.height);

    ctx.fillStyle = style.name;
    ctx.font = `${layout.name.fontSize}px ${style.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(
      fitText(ctx, cell.name, cell.width - inset * 2),
      Math.round(cell.x + cell.width / 2),
      Math.round(cell.y + cell.height - layout.name.height / 2 + layout.name.fontSize / 3)
    );
    ctx.textAlign = 'left';
    ctx.restore();
  }
}

/**
 * Trims to what fits.
 *
 * `fillText`'s maxWidth squashes the glyphs instead, turning a long room name into an unreadable line.
 * Cutting it short with an ellipsis at least stays readable.
 */
function fitText(ctx: ReplayFrameCanvas, text: string, maxWidth: number): string {
  if (text.length < 1 || maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;

  const characters = [...text];
  let fitted = '';
  for (const character of characters) {
    if (ctx.measureText(`${fitted}${character}…`).width > maxWidth) break;
    fitted += character;
  }
  return fitted.length > 0 ? `${fitted}…` : '';
}

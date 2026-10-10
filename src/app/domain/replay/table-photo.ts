/**
 * The layout of the keepsake photo.
 *
 * The portraits are laid out and the name of the room and the date printed on. Their
 * proportions differ from table to table, so the frames are all one size and each picture is fitted inside without cropping.
 *
 * Only the measurements are decided here; reading and drawing the pictures belongs elsewhere.
 */

export interface TablePhotoMember {
  readonly identifier: string;
  readonly name: string;
  readonly imageIdentifier: string;
}

export interface TablePhotoSize {
  readonly width: number;
  readonly height: number;
}

export interface TablePhotoCell {
  readonly identifier: string;
  readonly name: string;
  readonly imageIdentifier: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TablePhotoLayout {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: readonly TablePhotoCell[];
  readonly title: { readonly x: number; readonly y: number; readonly fontSize: number; readonly maxWidth: number };
  readonly subtitle: { readonly x: number; readonly y: number; readonly fontSize: number };
  readonly name: { readonly fontSize: number; readonly height: number };
  readonly radius: number;
  /** How many did not fit and were left out, which the caller reports rather than cutting them in silence. */
  readonly omitted: number;
}

export const TABLE_PHOTO_WIDE: TablePhotoSize = { width: 1920, height: 1080 };

/** Beyond this the faces are specks. Those over are not photographed, and their number is returned. */
const MAX_MEMBERS = 24;

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

/**
 * Lays out the keepsake photo: equal frames for up to 24 portraits on a grid kept near square,
 * with the last row centred, under a title and subtitle.
 *
 * Measurements are worked out for 1920 by 1080 and scaled to the size given. Anyone past the
 * limit is left out and counted in `omitted`.
 */
export function buildTablePhotoLayout(
  members: readonly TablePhotoMember[],
  size: TablePhotoSize = TABLE_PHOTO_WIDE
): TablePhotoLayout {
  const scale = Math.min(size.width / REFERENCE_WIDTH, size.height / REFERENCE_HEIGHT);
  const at = (value: number): number => Math.round(value * scale);

  const shown = members.slice(0, MAX_MEMBERS);
  const margin = at(72);
  const headerHeight = at(150);
  const gap = at(24);
  const nameHeight = at(44);

  const columns = columnsFor(shown.length);
  const rows = columns > 0 ? Math.ceil(shown.length / columns) : 0;

  const fieldWidth = size.width - margin * 2;
  const fieldHeight = size.height - headerHeight - margin;
  const cellWidth = columns > 0 ? (fieldWidth - gap * (columns - 1)) / columns : 0;
  const cellHeight = rows > 0 ? (fieldHeight - gap * (rows - 1)) / rows : 0;

  const cells: TablePhotoCell[] = shown.map((member, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    // A last row that is not full is centred on its own; left against the edge it does not read as a photograph.
    const inRow = Math.min(columns, shown.length - row * columns);
    const rowWidth = inRow * cellWidth + (inRow - 1) * gap;
    const left = margin + (fieldWidth - rowWidth) / 2;

    return {
      identifier: member.identifier,
      name: member.name,
      imageIdentifier: member.imageIdentifier,
      x: Math.round(left + column * (cellWidth + gap)),
      y: Math.round(headerHeight + row * (cellHeight + gap)),
      width: Math.round(cellWidth),
      height: Math.round(cellHeight),
    };
  });

  return {
    width: size.width,
    height: size.height,
    scale,
    columns,
    rows,
    cells,
    title: { x: margin, y: at(84), fontSize: at(52), maxWidth: size.width - margin * 2 },
    subtitle: { x: margin, y: at(124), fontSize: at(30) },
    name: { fontSize: at(28), height: nameHeight },
    radius: at(18),
    omitted: members.length - shown.length,
  };
}

/** How many across. It keeps the arrangement near square, with a ceiling so a single person does not sprawl. */
function columnsFor(count: number): number {
  if (count < 1) return 0;
  if (count <= 3) return count;
  if (count <= 8) return Math.ceil(count / 2);
  return Math.ceil(Math.sqrt(count));
}

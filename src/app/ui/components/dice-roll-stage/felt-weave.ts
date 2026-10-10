const TILE_PX = 128;

let weave: string | null | undefined;

/**
 * A faint weave of felt as a picture, to tile over a mat's colour so it reads as cloth rather than
 * a flat colour. It is drawn once, the same every time; where the page cannot draw, there is none.
 */
export function feltWeave(): string | null {
  if (weave !== undefined) return weave;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE_PX;
  const context = canvas.getContext('2d');
  if (!context) return (weave = null);
  const image = context.createImageData(TILE_PX, TILE_PX);
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < TILE_PX * TILE_PX; i++) {
    const shade = 236 + Math.floor(random() * 20);
    image.data[i * 4] = image.data[i * 4 + 1] = image.data[i * 4 + 2] = shade;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return (weave = canvas.toDataURL('image/png'));
}

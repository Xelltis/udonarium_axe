/** How a picture is fitted into the panel it papers. */
export const LAYER_FITS = ['cover', 'contain', 'tile', 'stretch'] as const;
export type LayerFit = (typeof LAYER_FITS)[number];

/** Where it sits once it is fitted. */
export const LAYER_ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type LayerAnchor = (typeof LAYER_ANCHORS)[number];

/** How many pictures one ladder may stack before the panel is doing too much work. */
export const MAX_LAYERS = 6;

/** What to draw at, for anyone making a picture for this. */
export const RECOMMENDED_LAYER_SIZE = { width: 1600, height: 1200 };

/** What a tiled texture wants instead, since it repeats rather than stretches. */
export const RECOMMENDED_TILE_SIZE = 256;

/**
 * One picture in the stack a skin papers its panels with.
 *
 * The stack is drawn in order, the first entry underneath. Each one carries its own fit,
 * its own corner and its own strength, so a paper grain can sit under a corner ornament
 * without either being forced to the other's shape.
 */
export interface SkinLayer {
  /** Also the key its bytes are kept under. */
  id: string;
  /** The file it came from, so the list means something to the person who built it. */
  name: string;
  /** How much of it shows, as a percentage. */
  opacity: number;
  fit: LayerFit;
  anchor: LayerAnchor;
}

export function newLayerId(): string {
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value: unknown, low: number, high: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
}

/** One layer read back out of what a browser or a file kept, with everything pulled into range. */
export function asLayer(value: unknown): SkinLayer | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw['id'] === 'string' && raw['id'].length > 0 ? raw['id'] : null;
  if (!id) return null;

  const fit = raw['fit'];
  const anchor = raw['anchor'];
  return {
    id,
    name: typeof raw['name'] === 'string' ? raw['name'].slice(0, 60) : '',
    opacity: Math.round(clamp(raw['opacity'], 0, 100, 100)),
    fit: (LAYER_FITS as readonly unknown[]).includes(fit) ? (fit as LayerFit) : 'cover',
    anchor: (LAYER_ANCHORS as readonly unknown[]).includes(anchor) ? (anchor as LayerAnchor) : 'center',
  };
}

export function asLayers(value: unknown): SkinLayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(asLayer)
    .filter((layer): layer is SkinLayer => layer !== null)
    .slice(0, MAX_LAYERS);
}

export function parseLayers(text: string | null): SkinLayer[] {
  if (!text) return [];
  try {
    return asLayers(JSON.parse(text));
  } catch {
    return [];
  }
}

/** Moves a layer up or down the stack, staying inside it. */
export function reorderLayers(layers: readonly SkinLayer[], id: string, by: number): SkinLayer[] {
  const from = layers.findIndex((layer) => layer.id === id);
  if (from < 0) return [...layers];
  const to = Math.max(0, Math.min(layers.length - 1, from + by));
  if (to === from) return [...layers];

  const moved = [...layers];
  const [held] = moved.splice(from, 1);
  moved.splice(to, 0, held);
  return moved;
}

/** The CSS three of the background shorthand, worked out from how the layer is fitted. */
export function layerPlacement(layer: SkinLayer): { size: string; position: string; repeat: string } {
  const place = layer.anchor.split('-').reverse().join(' ');
  switch (layer.fit) {
    case 'tile':
      return { size: 'auto', position: place, repeat: 'repeat' };
    case 'contain':
      return { size: 'contain', position: place, repeat: 'no-repeat' };
    case 'stretch':
      return { size: '100% 100%', position: place, repeat: 'no-repeat' };
    default:
      return { size: 'cover', position: place, repeat: 'no-repeat' };
  }
}

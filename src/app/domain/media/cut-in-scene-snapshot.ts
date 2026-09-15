import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';

/**
 * A scene written down flat, so an editor can put it back the way it was.
 *
 * The stack is not torn down and rebuilt on the way back: a layer still there is written
 * over, keeping its identifier. Making everything afresh would look to everyone else in
 * the room like every layer being deleted and a new one appearing, and would put the
 * whole scene back onto the wire for what may have been one number.
 */

const LAYER_FIELDS = [
  'name',
  'kind',
  'hidden',
  'locked',
  'x',
  'y',
  'width',
  'height',
  'anchorX',
  'anchorY',
  'scaleX',
  'scaleY',
  'rotation',
  'skewXDeg',
  'skewYDeg',
  'clip',
  'wipeShape',
  'wipe',
  'crumbleShape',
  'crumble',
  'opacity',
  'blur',
  'blendMode',
  'startMs',
  'endMs',
  'imageIdentifier',
  'objectFit',
  'objectPosX',
  'objectPosY',
  'text',
  'fontSizePx',
  'fontWeight',
  'fontFamily',
  'color',
  'textAlign',
  'strokeColor',
  'strokeWidthPx',
  'letterSpacingPx',
  'lineHeight',
  'vertical',
  'fillShape',
  'fillFrom',
  'fillMid',
  'fillTo',
  'fillAngleDeg',
  'fillScalePx',
  'effect',
  'effectStrength',
  'effectColor',
  'tracks',
] as const;

type LayerField = (typeof LAYER_FIELDS)[number];

export type CutInLayerSnapshot = { identifier: string } & Pick<CutInLayer, LayerField>;

export interface CutInSceneSnapshot {
  durationMs: number;
  sceneLoop: boolean;
  backgroundColor: string;
  sounds: string;
  /** In the order they are drawn. */
  layers: CutInLayerSnapshot[];
}

/** Writes the scene and each of its layers down flat, in drawing order. No scene gives an empty snapshot. */
export function snapshotScene(scene: CutInScene | null): CutInSceneSnapshot {
  if (!scene) return { durationMs: 0, sceneLoop: false, backgroundColor: '', sounds: '', layers: [] };

  return {
    durationMs: scene.durationMs,
    sceneLoop: scene.sceneLoop,
    backgroundColor: scene.backgroundColor,
    sounds: scene.sounds,
    layers: scene.layers.map((layer) => snapshotLayer(layer)),
  };
}

/** A copy of a snapshot whose layers can be changed without touching the original's. */
export function cloneSceneSnapshot(snapshot: CutInSceneSnapshot): CutInSceneSnapshot {
  return { ...snapshot, layers: snapshot.layers.map((layer) => ({ ...layer })) };
}

/** Puts the scene back the way the snapshot found it. */
export function restoreScene(scene: CutInScene | null, snapshot: CutInSceneSnapshot): void {
  if (!scene) return;

  if (scene.durationMs !== snapshot.durationMs) scene.durationMs = snapshot.durationMs;
  if (scene.sceneLoop !== snapshot.sceneLoop) scene.sceneLoop = snapshot.sceneLoop;
  if (scene.backgroundColor !== snapshot.backgroundColor) scene.backgroundColor = snapshot.backgroundColor;
  if (scene.sounds !== snapshot.sounds) scene.sounds = snapshot.sounds;

  const standing = new Map(scene.layers.map((layer) => [layer.identifier, layer]));
  const wanted = new Set(snapshot.layers.map((layer) => layer.identifier));

  for (const layer of scene.layers) {
    if (!wanted.has(layer.identifier)) layer.destroy();
  }

  for (const wantedLayer of snapshot.layers) {
    const layer = standing.get(wantedLayer.identifier) ?? new CutInLayer(wantedLayer.identifier);
    if (!standing.has(wantedLayer.identifier)) layer.initialize();

    applyLayer(layer, wantedLayer);
    // Appending in order is what puts the stack back the way round it was.
    scene.appendChild(layer);
  }
}

function snapshotLayer(layer: CutInLayer): CutInLayerSnapshot {
  const written = { identifier: layer.identifier } as CutInLayerSnapshot;
  for (const field of LAYER_FIELDS) {
    (written as Record<string, unknown>)[field] = layer[field];
  }
  return written;
}

function applyLayer(layer: CutInLayer, snapshot: CutInLayerSnapshot): void {
  for (const field of LAYER_FIELDS) {
    const wanted = snapshot[field];
    if (layer[field] === wanted) continue;
    (layer as unknown as Record<string, unknown>)[field] = wanted;
  }
}

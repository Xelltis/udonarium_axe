import { type CutInClip, isCutInClip } from '@axe/domain/media/cut-in-clip';
import { type CutInEffect, effectAt, isCutInEffect } from '@axe/domain/media/cut-in-effect';
import {
  type CutInFill,
  type CutInFillShape,
  DEFAULT_FILL_SCALE_PX,
  isCutInFillShape,
} from '@axe/domain/media/cut-in-fill';
import type { CutInTrackSet } from '@axe/domain/media/cut-in-keyframe';
import { parseCutInTracks, sampleTrack } from '@axe/domain/media/cut-in-keyframe';
import type { CutInLayerKind, CutInTextAlign } from '@axe/domain/media/cut-in-layer';
import { type CutInWipe, isCutInWipe } from '@axe/domain/media/cut-in-wipe';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

/**
 * The scenes of the cut-ins, read back out of a recording.
 *
 * A recording keeps every object there was, so the scene and its layers are already in
 * it — but as sync data rather than as the objects themselves, which the video export
 * cannot build. This reads that back into plain values the painter can draw from.
 */

const SCENE_ALIAS = 'cut-in-scene';
const LAYER_ALIAS = 'cut-in-layer';

export interface ReplayCutInLayer {
  kind: CutInLayerKind;
  hidden: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  skewXDeg: number;
  skewYDeg: number;
  clip: CutInClip;
  wipeShape: CutInWipe;
  wipe: number;
  crumbleShape: CutInWipe;
  crumble: number;
  opacity: number;
  blur: number;
  startMs: number;
  endMs: number;
  imageIdentifier: string;
  objectFit: string;
  objectPosX: number;
  objectPosY: number;
  text: string;
  fontSizePx: number;
  fontWeight: number;
  color: string;
  textAlign: CutInTextAlign;
  strokeColor: string;
  strokeWidthPx: number;
  letterSpacingPx: number;
  lineHeight: number;
  vertical: boolean;
  fillShape: CutInFillShape;
  fillFrom: string;
  fillMid: string;
  fillTo: string;
  fillAngleDeg: number;
  fillScalePx: number;
  effect: CutInEffect;
  effectStrength: number;
  effectColor: string;
  tracks: CutInTrackSet;
}

export interface ReplayCutInScene {
  durationMs: number;
  sceneLoop: boolean;
  backgroundColor: string;
  /** In the order they are drawn. */
  layers: ReplayCutInLayer[];
}

/** What every cut-in in the recording was built from, by the identifier of the cut-in. */
export function cutInScenesOf(snapshots: readonly ReplayObjectSnapshot[]): Map<string, ReplayCutInScene> {
  const scenes = new Map<string, { cutInIdentifier: string; scene: ReplayCutInScene }>();

  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== SCENE_ALIAS) continue;
    const attributes = attributesOf(snapshot);
    scenes.set(snapshot.identifier, {
      cutInIdentifier: text(attributes['cutInIdentifier']),
      scene: {
        durationMs: number(attributes['durationMs'], 3000),
        sceneLoop: flag(attributes['sceneLoop']),
        backgroundColor: text(attributes['backgroundColor']),
        layers: [],
      },
    });
  }
  if (scenes.size < 1) return new Map();

  const ordered: { parent: string; index: number; layer: ReplayCutInLayer }[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== LAYER_ALIAS) continue;

    const parent = text(snapshot.syncData['parentIdentifier']);
    if (!scenes.has(parent)) continue;

    ordered.push({
      parent,
      index: number(snapshot.syncData['majorIndex'], 0) + number(snapshot.syncData['minorIndex'], 0),
      layer: readLayer(attributesOf(snapshot)),
    });
  }

  ordered.sort((left, right) => left.index - right.index);
  for (const entry of ordered) scenes.get(entry.parent)?.scene.layers.push(entry.layer);

  const byCutIn = new Map<string, ReplayCutInScene>();
  for (const { cutInIdentifier, scene } of scenes.values()) {
    if (cutInIdentifier.length > 0 && scene.layers.length > 0) byCutIn.set(cutInIdentifier, scene);
  }
  return byCutIn;
}

/** What a band layer is painted with, in the shape the shared helper understands. */
export function layerFill(layer: ReplayCutInLayer): CutInFill {
  return {
    shape: layer.fillShape,
    from: layer.fillFrom,
    mid: layer.fillMid,
    to: layer.fillTo,
    angleDeg: layer.fillAngleDeg,
    scalePx: layer.fillScalePx,
  };
}

/** How long the scene runs, never shorter than the layer that finishes last. */
export function replaySceneDurationOf(scene: ReplayCutInScene): number {
  const lastMoment = scene.layers.reduce(
    (last, layer) => Math.max(last, layer.startMs, layer.endMs, lastTrackMoment(layer)),
    0
  );
  return Math.min(60_000, Math.max(100, scene.durationMs, lastMoment));
}

/** Everything about a layer at one moment, the way the editor would show it. */
export interface ReplayLayerSample {
  visible: boolean;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blur: number;
  wipe: number;
  crumble: number;
  glowPx: number;
  shadowPx: number;
  glowColor: string;
}

/**
 * A recorded layer's state at one moment of its scene: its tracks, or where it rests, with its
 * running touch laid on top.
 *
 * It is visible from its start until its end, unless hidden. A layer that runs to the end of
 * the scene, or past it, stays visible to the last moment.
 */
export function replaySampleAt(layer: ReplayCutInLayer, ms: number, durationMs: number): ReplayLayerSample {
  const endMs = layer.endMs > 0 ? Math.min(layer.endMs, durationMs) : durationMs;
  const touch = effectAt(layer.effect, ms, layer.effectStrength);

  return {
    visible: !layer.hidden && ms >= layer.startMs && (ms < endMs || endMs >= durationMs),
    x: sampleTrack(layer.tracks.x, ms, layer.x) + touch.dx,
    y: sampleTrack(layer.tracks.y, ms, layer.y) + touch.dy,
    scaleX: sampleTrack(layer.tracks.scaleX, ms, layer.scaleX) * touch.scaleMul,
    scaleY: sampleTrack(layer.tracks.scaleY, ms, layer.scaleY) * touch.scaleMul,
    rotation: sampleTrack(layer.tracks.rotation, ms, layer.rotation),
    opacity: sampleTrack(layer.tracks.opacity, ms, layer.opacity) * touch.opacityMul,
    blur: sampleTrack(layer.tracks.blur, ms, layer.blur),
    wipe: sampleTrack(layer.tracks.wipe, ms, layer.wipe),
    crumble: sampleTrack(layer.tracks.crumble, ms, layer.crumble),
    glowPx: touch.glowPx,
    shadowPx: touch.shadowPx,
    glowColor: layer.effectColor,
  };
}

/** Every picture a scene needs, so the export can load them before it starts drawing. */
export function sceneImageIdentifiers(scene: ReplayCutInScene): string[] {
  return scene.layers.map((layer) => layer.imageIdentifier).filter((identifier) => identifier.length > 0);
}

function lastTrackMoment(layer: ReplayCutInLayer): number {
  let last = 0;
  for (const keys of Object.values(layer.tracks)) {
    for (const key of keys ?? []) last = Math.max(last, key.t);
  }
  return last;
}

function readLayer(attributes: Record<string, unknown>): ReplayCutInLayer {
  return {
    kind: (text(attributes['kind']) || 'image') as CutInLayerKind,
    hidden: flag(attributes['hidden']),
    x: number(attributes['x'], 0),
    y: number(attributes['y'], 0),
    width: number(attributes['width'], 0),
    height: number(attributes['height'], 0),
    anchorX: number(attributes['anchorX'], 0.5),
    anchorY: number(attributes['anchorY'], 0.5),
    scaleX: number(attributes['scaleX'], 1),
    scaleY: number(attributes['scaleY'], 1),
    rotation: number(attributes['rotation'], 0),
    skewXDeg: number(attributes['skewXDeg'], 0),
    skewYDeg: number(attributes['skewYDeg'], 0),
    clip: isCutInClip(attributes['clip']) ? attributes['clip'] : 'none',
    wipeShape: isCutInWipe(attributes['wipeShape']) ? attributes['wipeShape'] : 'none',
    wipe: number(attributes['wipe'], 1),
    crumbleShape: isCutInWipe(attributes['crumbleShape']) ? attributes['crumbleShape'] : 'none',
    crumble: number(attributes['crumble'], 1),
    opacity: number(attributes['opacity'], 1),
    blur: number(attributes['blur'], 0),
    startMs: number(attributes['startMs'], 0),
    endMs: number(attributes['endMs'], 0),
    imageIdentifier: text(attributes['imageIdentifier']),
    objectFit: text(attributes['objectFit']) || 'contain',
    objectPosX: number(attributes['objectPosX'], 50),
    objectPosY: number(attributes['objectPosY'], 50),
    text: text(attributes['text']),
    fontSizePx: number(attributes['fontSizePx'], 32),
    fontWeight: number(attributes['fontWeight'], 700),
    color: text(attributes['color']) || '#ffffff',
    textAlign: (text(attributes['textAlign']) || 'center') as CutInTextAlign,
    strokeColor: text(attributes['strokeColor']),
    strokeWidthPx: number(attributes['strokeWidthPx'], 0),
    letterSpacingPx: number(attributes['letterSpacingPx'], 0),
    lineHeight: number(attributes['lineHeight'], 1.15),
    vertical: attributes['vertical'] === true,
    fillShape: isCutInFillShape(attributes['fillShape']) ? attributes['fillShape'] : 'linear',
    fillFrom: text(attributes['fillFrom']) || '#000000',
    fillMid: text(attributes['fillMid']),
    fillTo: text(attributes['fillTo']),
    fillAngleDeg: number(attributes['fillAngleDeg'], 90),
    fillScalePx: number(attributes['fillScalePx'], DEFAULT_FILL_SCALE_PX),
    effect: isCutInEffect(attributes['effect']) ? attributes['effect'] : 'none',
    effectStrength: number(attributes['effectStrength'], 1),
    effectColor: text(attributes['effectColor']) || '#ffffff',
    tracks: parseCutInTracks(text(attributes['tracks'])),
  };
}

function attributesOf(snapshot: ReplayObjectSnapshot): Record<string, unknown> {
  const attributes = snapshot.syncData['attributes'];
  return typeof attributes === 'object' && attributes !== null ? (attributes as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown, fallback: number): number {
  const read = Number(value);
  return Number.isFinite(read) ? read : fallback;
}

function flag(value: unknown): boolean {
  return value === true || value === 'true';
}

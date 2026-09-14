import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import type { CutInClip } from '@axe/domain/media/cut-in-clip';
import type { CutInEffect } from '@axe/domain/media/cut-in-effect';
import { type CutInFill, type CutInFillShape, DEFAULT_FILL_SCALE_PX } from '@axe/domain/media/cut-in-fill';
import { type CutInTrackSet, lastKeyTime, parseCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import type { CutInWipe } from '@axe/domain/media/cut-in-wipe';

/**
 * One thing laid into a cut-in: a picture, some words, or a band of colour.
 *
 * Everything sits in the cut-in's own coordinates, so a layer keeps the same place
 * whatever size the panel ends up. Where a layer rests is written here; where it travels
 * is written in `tracks`, and a track wins wherever it has anything to say.
 */

export const CUT_IN_LAYER_KINDS = ['image', 'text', 'fill'] as const;
export type CutInLayerKind = (typeof CUT_IN_LAYER_KINDS)[number];

export const CUT_IN_TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type CutInTextAlign = (typeof CUT_IN_TEXT_ALIGNS)[number];

/** Whether a value names one of the kinds of layer: a picture, some words or a band of colour. */
export function isCutInLayerKind(value: unknown): value is CutInLayerKind {
  return typeof value === 'string' && (CUT_IN_LAYER_KINDS as readonly string[]).includes(value);
}

/** Whether a value names one of the ways a text layer can align its words. */
export function isCutInTextAlign(value: unknown): value is CutInTextAlign {
  return typeof value === 'string' && (CUT_IN_TEXT_ALIGNS as readonly string[]).includes(value);
}

@SyncObject('cut-in-layer')
export class CutInLayer extends ObjectNode {
  @SyncVar() name: string = '';
  @SyncVar() kind: CutInLayerKind = 'image';
  /** Kept out of the editor's way. It plays all the same. */
  @SyncVar() hidden: boolean = false;
  @SyncVar() locked: boolean = false;

  // The box, in the cut-in's coordinates, from its top left.
  @SyncVar() x: number = 0;
  @SyncVar() y: number = 0;
  @SyncVar() width: number = 320;
  @SyncVar() height: number = 180;
  /** What the layer turns and grows around, as a fraction of its own box. */
  @SyncVar() anchorX: number = 0.5;
  @SyncVar() anchorY: number = 0.5;

  // Where the layer rests. A track covering the moment overrides it.
  @SyncVar() scaleX: number = 1;
  @SyncVar() scaleY: number = 1;
  @SyncVar() rotation: number = 0;
  /** How far the layer is leaned over, in degrees, which squares nothing off. */
  @SyncVar() skewXDeg: number = 0;
  @SyncVar() skewYDeg: number = 0;
  /** The outline the layer is cut down to. */
  @SyncVar() clip: CutInClip = 'none';
  /** Which way the layer is let in a part at a time, and how much of it is in so far. */
  @SyncVar() wipeShape: CutInWipe = 'none';
  @SyncVar() wipe: number = 1;
  /** A second way of letting it in, or of taking it away again. */
  @SyncVar() crumbleShape: CutInWipe = 'none';
  @SyncVar() crumble: number = 1;
  @SyncVar() opacity: number = 1;
  @SyncVar() blur: number = 0;
  @SyncVar() blendMode: string = '';

  /** When the layer is on screen. An endMs of 0 runs to the end of the scene. */
  @SyncVar() startMs: number = 0;
  @SyncVar() endMs: number = 0;

  // kind: image
  // The name matches what the save routine looks for, so a layer's picture rides along in the zip.
  @SyncVar() imageIdentifier: string = '';
  @SyncVar() objectFit: string = 'contain';
  /** Which part of the picture is kept when it is cropped, as a percentage across and down. */
  @SyncVar() objectPosX: number = 50;
  @SyncVar() objectPosY: number = 50;

  // kind: text
  @SyncVar() text: string = '';
  @SyncVar() fontSizePx: number = 32;
  @SyncVar() fontWeight: number = 700;
  @SyncVar() fontFamily: string = '';
  @SyncVar() color: string = '#ffffff';
  @SyncVar() textAlign: CutInTextAlign = 'center';
  @SyncVar() strokeColor: string = '';
  @SyncVar() strokeWidthPx: number = 0;
  /** How far apart the letters sit, in pixels. Negative pulls them together. */
  @SyncVar() letterSpacingPx: number = 0;
  /** How far apart the lines sit, as a multiple of the size of the letters. */
  @SyncVar() lineHeight: number = 1.15;
  /** Whether the words run down the layer rather than across it. */
  @SyncVar() vertical: boolean = false;

  // kind: fill
  @SyncVar() fillShape: CutInFillShape = 'linear';
  @SyncVar() fillFrom: string = '#000000';
  /** A colour passed through on the way. Empty for a straight run. */
  @SyncVar() fillMid: string = '';
  /** Empty for one flat colour. */
  @SyncVar() fillTo: string = '';
  @SyncVar() fillAngleDeg: number = 90;
  /** How far apart a repeating fill repeats, in the cut-in's own coordinates. */
  @SyncVar() fillScalePx: number = DEFAULT_FILL_SCALE_PX;

  /** The fill fields gathered into the one shape the painting code takes, built afresh on each read. */
  get fill(): CutInFill {
    return {
      shape: this.fillShape,
      from: this.fillFrom,
      mid: this.fillMid,
      to: this.fillTo,
      angleDeg: this.fillAngleDeg,
      scalePx: this.fillScalePx,
    };
  }

  // A small touch that runs the whole time the layer is on screen.
  @SyncVar() effect: CutInEffect = 'none';
  @SyncVar() effectStrength: number = 1;
  /** What the light of a glow is coloured. */
  @SyncVar() effectColor: string = '#ffffff';

  /** What the layer does over time, as JSON. Empty for one that stays put. */
  @SyncVar() tracks: string = '';

  private tracksRaw = '';
  private tracksParsed: CutInTrackSet = {};

  /** Read once per change rather than once per frame, as EffectPreset reads its stages. */
  get trackSet(): CutInTrackSet {
    const raw = this.tracks ?? '';
    if (raw !== this.tracksRaw) {
      this.tracksRaw = raw;
      this.tracksParsed = parseCutInTracks(raw);
    }
    return this.tracksParsed;
  }

  /** The last moment this layer has anything left to do. */
  get lastMomentMs(): number {
    return Math.max(this.endMs, this.startMs, lastKeyTime(this.trackSet));
  }
}

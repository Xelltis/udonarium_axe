import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { CUT_IN_EASING_NAMES, type CutInEasingName, isCutInEasing } from '@axe/domain/media/cubic-bezier';
import {
  applyEntrance,
  applyExit,
  CUT_IN_ENTRANCES,
  CUT_IN_EXITS,
  type CutInEntrance,
  type CutInExit,
  DEFAULT_PRESET_MS,
  isCutInEntrance,
  isCutInExit,
} from '@axe/domain/media/cut-in-animation-presets';
import { CUT_IN_CLIPS, type CutInClip, isCutInClip } from '@axe/domain/media/cut-in-clip';
import { CUT_IN_EFFECTS, type CutInEffect, isCutInEffect } from '@axe/domain/media/cut-in-effect';
import {
  CUT_IN_FILL_SHAPES,
  type CutInFillShape,
  DEFAULT_FILL_SCALE_PX,
  isCutInFillShape,
  MAX_FILL_SCALE_PX,
  MIN_FILL_SCALE_PX,
} from '@axe/domain/media/cut-in-fill';
import { CUT_IN_TRACKS, type CutInTrackName } from '@axe/domain/media/cut-in-keyframe';
import { CUT_IN_TEXT_ALIGNS, CutInLayer, type CutInTextAlign, isCutInTextAlign } from '@axe/domain/media/cut-in-layer';
import { applyLayerPreset, CUT_IN_LAYER_PRESETS } from '@axe/domain/media/cut-in-layer-presets';
import { CUT_IN_WIPES, type CutInWipe, isCutInWipe } from '@axe/domain/media/cut-in-wipe';
import {
  easingAtMoment,
  hasKeyAt,
  setEasingAtMoment,
  setValueAt,
  toggleKeyAt,
  valueAt,
} from '@axe/features/media/cut-in-editor/cut-in-keyframe-edit';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What the selected layer is told.
 *
 * Writing straight to the layer is what the rest of this tool does with a synchronised
 * object. Every write is followed by `commit`, which is what the editor's undo stack
 * listens for, so a change never lands without something to take it back with.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-layer-properties',
  templateUrl: './cut-in-layer-properties.component.html',
  host: { class: 'block' },
  imports: [FormsModule, SafePipe, TranslocoModule],
})
export class CutInLayerPropertiesComponent {
  private readonly modalService = inject(ModalService);
  private readonly imageService = inject(ImageService);
  private readonly objectChange = inject(ObjectChangeService);

  readonly layer = input<CutInLayer | null>(null);
  readonly isEditable = input(false);
  /** The cut-in's own size, which is where a layer slides in from and out to. */
  readonly sceneWidth = input(0);
  readonly sceneHeight = input(0);
  readonly sceneDurationMs = input(0);
  /** Where the scrubber stands. A value written lands on the key there, if one does. */
  readonly playheadMs = input(0);

  readonly commit = output<void>();

  readonly textAligns = CUT_IN_TEXT_ALIGNS;
  readonly easings = CUT_IN_EASING_NAMES;
  readonly fillShapes = CUT_IN_FILL_SHAPES;
  readonly clips = CUT_IN_CLIPS;
  readonly wipes = CUT_IN_WIPES;
  readonly entrances = CUT_IN_ENTRANCES;
  readonly exits = CUT_IN_EXITS;
  readonly effects = CUT_IN_EFFECTS;
  readonly looks = CUT_IN_LAYER_PRESETS;

  /** How long an arrival or a departure takes, in ms. */
  presetMs = DEFAULT_PRESET_MS;

  readonly imageUrl = computed(() => {
    const layer = this.layer();
    if (!layer) return '';
    this.objectChange.fileVersion();
    this.objectChange.versionOf(layer.identifier)();
    if (!layer.imageIdentifier) return '';
    return this.imageService.getEmptyOr(layer.imageIdentifier).url;
  });

  private get target(): CutInLayer | null {
    return this.isEditable() ? this.layer() : null;
  }

  private write(change: (layer: CutInLayer) => void): void {
    const layer = this.target;
    if (!layer) return;
    change(layer);
    this.commit.emit();
  }

  /** The layer's name as listed in the editor. */
  get name(): string {
    return this.layer()?.name ?? '';
  }
  set name(name: string) {
    this.write((layer) => (layer.name = name));
  }

  /** The layer's left edge at the scrubber, in the cut-in's pixels; a write lands on a key there if one stands. */
  get x(): number {
    return Math.round(this.tracked('x'));
  }
  set x(x: number) {
    this.writeTracked('x', Number(x) || 0);
  }

  /** The layer's top edge at the scrubber, in the cut-in's pixels; a write lands on a key there if one stands. */
  get y(): number {
    return Math.round(this.tracked('y'));
  }
  set y(y: number) {
    this.writeTracked('y', Number(y) || 0);
  }

  /** The layer's box width in the cut-in's pixels, never set below 1. */
  get width(): number {
    return Math.round(this.layer()?.width ?? 0);
  }
  set width(width: number) {
    this.write((layer) => (layer.width = Math.max(1, Number(width) || 1)));
  }

  /** The layer's box height in the cut-in's pixels, never set below 1. */
  get height(): number {
    return Math.round(this.layer()?.height ?? 0);
  }
  set height(height: number) {
    this.write((layer) => (layer.height = Math.max(1, Number(height) || 1)));
  }

  /** One figure for both directions. The two are kept apart only so a track may move them apart. */
  get scalePercent(): number {
    return Math.round(this.tracked('scaleX', 1) * 100);
  }
  set scalePercent(percent: number) {
    const scale = Math.max(0.01, (Number(percent) || 100) / 100);
    this.write((layer) => {
      setValueAt(layer, 'scaleX', this.playheadMs(), scale);
      setValueAt(layer, 'scaleY', this.playheadMs(), scale);
    });
  }

  /** How far the layer is turned at the scrubber, in degrees; a write lands on a key there if one stands. */
  get rotation(): number {
    return Math.round(this.tracked('rotation'));
  }
  set rotation(rotation: number) {
    this.writeTracked('rotation', Number(rotation) || 0);
  }

  /** The layer's opacity at the scrubber as 0 to 100; a write lands on a key there if one stands. */
  get opacityPercent(): number {
    return Math.round(this.tracked('opacity', 1) * 100);
  }
  set opacityPercent(percent: number) {
    this.writeTracked('opacity', Math.min(1, Math.max(0, (Number(percent) || 0) / 100)));
  }

  /** The layer's blur at the scrubber, in pixels, never negative; a write lands on a key there if one stands. */
  get blur(): number {
    return Math.round(this.tracked('blur'));
  }
  set blur(blur: number) {
    this.writeTracked('blur', Math.max(0, Number(blur) || 0));
  }

  /** Whether a key stands at the scrubber for a track, which the diamond shows. */
  keyed(track: CutInTrackName): boolean {
    const layer = this.layer();
    if (!layer) return false;
    this.objectChange.versionOf(layer.identifier)();
    return hasKeyAt(layer, track, this.playheadMs());
  }

  /**
   * Puts a key down on a track at the scrubber, or takes up the one there, from the field's diamond.
   *
   * Scale is one field for both directions, so toggling `scaleX` toggles `scaleY` with it.
   */
  toggleKey(track: CutInTrackName): void {
    this.write((layer) => {
      toggleKeyAt(layer, track, this.playheadMs());
      if (track === 'scaleX') toggleKeyAt(layer, 'scaleY', this.playheadMs());
    });
  }

  /** Whether any key stands at the scrubber, which is when a curve can be chosen. */
  get keyedHere(): boolean {
    const layer = this.layer();
    if (!layer) return false;
    this.objectChange.versionOf(layer.identifier)();
    return CUT_IN_TRACKS.some((track) => hasKeyAt(layer, track, this.playheadMs()));
  }

  /** The curve out of the keys standing at the scrubber, or nothing where they disagree. */
  get easingHere(): CutInEasingName | '' {
    const layer = this.layer();
    if (!layer) return '';
    this.objectChange.versionOf(layer.identifier)();
    return easingAtMoment(layer, this.playheadMs()) ?? '';
  }
  set easingHere(easing: CutInEasingName | '') {
    if (!isCutInEasing(easing)) return;
    this.write((layer) => setEasingAtMoment(layer, this.playheadMs(), easing));
  }

  private tracked(track: CutInTrackName, fallback = 0): number {
    const layer = this.layer();
    if (!layer) return fallback;
    this.objectChange.versionOf(layer.identifier)();
    return valueAt(layer, track, this.playheadMs());
  }

  private writeTracked(track: CutInTrackName, value: number): void {
    this.write((layer) => setValueAt(layer, track, this.playheadMs(), value));
  }

  /** When the layer comes on screen, in ms from the start of the scene. */
  get startMs(): number {
    return Math.round(this.layer()?.startMs ?? 0);
  }
  set startMs(startMs: number) {
    this.write((layer) => (layer.startMs = Math.max(0, Number(startMs) || 0)));
  }

  /** When the layer leaves the screen, in ms; 0 keeps it on until the scene ends. */
  get endMs(): number {
    return Math.round(this.layer()?.endMs ?? 0);
  }
  set endMs(endMs: number) {
    this.write((layer) => (layer.endMs = Math.max(0, Number(endMs) || 0)));
  }

  /** Whether the picture is cropped, and so has a part worth choosing. */
  get imageCrops(): boolean {
    return (this.layer()?.objectFit ?? 'contain') === 'cover';
  }
  set imageCrops(crops: boolean) {
    this.write((layer) => (layer.objectFit = crops ? 'cover' : 'contain'));
  }

  /** Which part of a cropped picture stays in view across, from 0 (left) to 100 (right). */
  get objectPosX(): number {
    return Math.round(this.layer()?.objectPosX ?? 50);
  }
  set objectPosX(objectPosX: number) {
    this.write((layer) => (layer.objectPosX = Math.min(100, Math.max(0, Number(objectPosX) || 0))));
  }

  /** Which part of a cropped picture stays in view down, from 0 (top) to 100 (bottom). */
  get objectPosY(): number {
    return Math.round(this.layer()?.objectPosY ?? 50);
  }
  set objectPosY(objectPosY: number) {
    this.write((layer) => (layer.objectPosY = Math.min(100, Math.max(0, Number(objectPosY) || 0))));
  }

  /** The words a text layer shows. */
  get text(): string {
    return this.layer()?.text ?? '';
  }
  set text(text: string) {
    this.write((layer) => (layer.text = text));
  }

  /** A text layer's font size in pixels, never set below 1. */
  get fontSizePx(): number {
    return Math.round(this.layer()?.fontSizePx ?? 32);
  }
  set fontSizePx(fontSizePx: number) {
    this.write((layer) => (layer.fontSizePx = Math.max(1, Number(fontSizePx) || 1)));
  }

  /** A text layer's font weight, held between 100 and 900. */
  get fontWeight(): number {
    return Math.round(this.layer()?.fontWeight ?? 700);
  }
  set fontWeight(fontWeight: number) {
    this.write((layer) => (layer.fontWeight = Math.min(900, Math.max(100, Number(fontWeight) || 400))));
  }

  /** A text layer's font family; empty uses the default. */
  get fontFamily(): string {
    return this.layer()?.fontFamily ?? '';
  }
  set fontFamily(fontFamily: string) {
    this.write((layer) => (layer.fontFamily = fontFamily));
  }

  /** A text layer's letter colour. */
  get color(): string {
    return this.layer()?.color ?? '#ffffff';
  }
  set color(color: string) {
    this.write((layer) => (layer.color = color));
  }

  /** How a text layer's lines are aligned; an unknown value is written as centre. */
  get textAlign(): CutInTextAlign {
    return this.layer()?.textAlign ?? 'center';
  }
  set textAlign(textAlign: CutInTextAlign) {
    this.write((layer) => (layer.textAlign = isCutInTextAlign(textAlign) ? textAlign : 'center'));
  }

  /** The colour of the outline round a text layer's letters, shown as black when unset. */
  get strokeColor(): string {
    return this.layer()?.strokeColor || '#000000';
  }
  set strokeColor(strokeColor: string) {
    this.write((layer) => (layer.strokeColor = strokeColor));
  }

  /** How thick the outline round a text layer's letters is, in pixels; 0 draws none. */
  get strokeWidthPx(): number {
    return Math.round(this.layer()?.strokeWidthPx ?? 0);
  }
  set strokeWidthPx(strokeWidthPx: number) {
    this.write((layer) => (layer.strokeWidthPx = Math.max(0, Number(strokeWidthPx) || 0)));
  }

  /** How far the layer leans sideways, in degrees held between -80 and 80. */
  get skewXDeg(): number {
    return Math.round(this.layer()?.skewXDeg ?? 0);
  }
  set skewXDeg(skewXDeg: number) {
    this.write((layer) => (layer.skewXDeg = Math.min(80, Math.max(-80, Number(skewXDeg) || 0))));
  }

  /** How far the layer leans up or down, in degrees held between -80 and 80. */
  get skewYDeg(): number {
    return Math.round(this.layer()?.skewYDeg ?? 0);
  }
  set skewYDeg(skewYDeg: number) {
    this.write((layer) => (layer.skewYDeg = Math.min(80, Math.max(-80, Number(skewYDeg) || 0))));
  }

  /** The shape the layer is cut to; an unknown value is written as none. */
  get clip(): CutInClip {
    return this.layer()?.clip ?? 'none';
  }
  set clip(clip: CutInClip) {
    this.write((layer) => (layer.clip = isCutInClip(clip) ? clip : 'none'));
  }

  /**
   * The shape the layer is wiped in through; an unknown value is written as none.
   *
   * Choosing a wipe on a layer with no wipe keys opens it fully, so it does not sit hidden.
   */
  get wipeShape(): CutInWipe {
    return this.layer()?.wipeShape ?? 'none';
  }
  set wipeShape(wipeShape: CutInWipe) {
    this.write((layer) => {
      layer.wipeShape = isCutInWipe(wipeShape) ? wipeShape : 'none';
      // A layer just given a wipe would otherwise sit closed until a key says otherwise.
      if (layer.wipeShape !== 'none' && (layer.trackSet.wipe ?? []).length < 1) layer.wipe = 1;
    });
  }

  /** How much of the layer is let in at the scrubber, as a percentage. */
  get wipePercent(): number {
    return Math.round(this.tracked('wipe', 1) * 100);
  }
  set wipePercent(percent: number) {
    this.writeTracked('wipe', Math.min(1, Math.max(0, (Number(percent) || 0) / 100)));
  }

  /**
   * The shape the layer crumbles away in; an unknown value is written as none.
   *
   * Choosing one on a layer with no crumble keys leaves it whole, so it does not sit hidden.
   */
  get crumbleShape(): CutInWipe {
    return this.layer()?.crumbleShape ?? 'none';
  }
  set crumbleShape(crumbleShape: CutInWipe) {
    this.write((layer) => {
      layer.crumbleShape = isCutInWipe(crumbleShape) ? crumbleShape : 'none';
      if (layer.crumbleShape !== 'none' && (layer.trackSet.crumble ?? []).length < 1) layer.crumble = 1;
    });
  }

  /** How much of the layer is still whole at the scrubber, as 0 to 100; a write lands on a key there if one stands. */
  get crumblePercent(): number {
    return Math.round(this.tracked('crumble', 1) * 100);
  }
  set crumblePercent(percent: number) {
    this.writeTracked('crumble', Math.min(1, Math.max(0, (Number(percent) || 0) / 100)));
  }

  /** Extra space between a text layer's letters, in pixels; negative draws them closer. */
  get letterSpacingPx(): number {
    return Math.round(this.layer()?.letterSpacingPx ?? 0);
  }
  set letterSpacingPx(letterSpacingPx: number) {
    this.write((layer) => (layer.letterSpacingPx = Number(letterSpacingPx) || 0));
  }

  /** A text layer's line height as a percentage of the font size, held between 40 and 400. */
  get lineHeight(): number {
    return Math.round((this.layer()?.lineHeight ?? 1.15) * 100);
  }
  set lineHeight(percent: number) {
    const lineHeight = Math.min(4, Math.max(0.4, (Number(percent) || 115) / 100));
    this.write((layer) => (layer.lineHeight = lineHeight));
  }

  /** Whether a text layer is written top to bottom. */
  get vertical(): boolean {
    return this.layer()?.vertical ?? false;
  }
  set vertical(vertical: boolean) {
    this.write((layer) => (layer.vertical = vertical));
  }

  /** Whether the fill chosen repeats, and so has a size worth setting. */
  get fillRepeats(): boolean {
    const shape = this.fillShape;
    return shape === 'stripes' || shape === 'speedlines' || shape === 'halftone';
  }

  /** The size of one repeat of a patterned fill, in pixels, held within the fill's allowed range. */
  get fillScalePx(): number {
    return Math.round(this.layer()?.fillScalePx ?? DEFAULT_FILL_SCALE_PX);
  }
  set fillScalePx(fillScalePx: number) {
    const scale = Math.min(
      MAX_FILL_SCALE_PX,
      Math.max(MIN_FILL_SCALE_PX, Number(fillScalePx) || DEFAULT_FILL_SCALE_PX)
    );
    this.write((layer) => (layer.fillScalePx = scale));
  }

  /** The pattern a fill layer is painted with; an unknown value is written as linear. */
  get fillShape(): CutInFillShape {
    return this.layer()?.fillShape ?? 'linear';
  }
  set fillShape(fillShape: CutInFillShape) {
    this.write((layer) => (layer.fillShape = isCutInFillShape(fillShape) ? fillShape : 'linear'));
  }

  /** The fill's middle colour, shown as grey while the fill has none. */
  get fillMid(): string {
    return this.layer()?.fillMid || '#808080';
  }
  set fillMid(fillMid: string) {
    this.write((layer) => (layer.fillMid = fillMid));
  }

  /** Whether the band passes through a third colour on its way. */
  get fillHasMid(): boolean {
    return (this.layer()?.fillMid.length ?? 0) > 0;
  }
  set fillHasMid(hasMid: boolean) {
    this.write((layer) => (layer.fillMid = hasMid ? layer.fillMid || '#808080' : ''));
  }

  /** The colour a fill starts from, which is the whole colour of a flat fill. */
  get fillFrom(): string {
    return this.layer()?.fillFrom ?? '#000000';
  }
  set fillFrom(fillFrom: string) {
    this.write((layer) => (layer.fillFrom = fillFrom));
  }

  /** The colour a gradient fill ends in, shown as black while the fill is flat. */
  get fillTo(): string {
    return this.layer()?.fillTo || '#000000';
  }
  set fillTo(fillTo: string) {
    this.write((layer) => (layer.fillTo = fillTo));
  }

  /** Whether the band shades from one colour into another, rather than being one flat colour. */
  get fillGradient(): boolean {
    return (this.layer()?.fillTo.length ?? 0) > 0;
  }
  set fillGradient(gradient: boolean) {
    this.write((layer) => (layer.fillTo = gradient ? layer.fillTo || layer.fillFrom : ''));
  }

  /** Which way a fill runs, in degrees. */
  get fillAngleDeg(): number {
    return Math.round(this.layer()?.fillAngleDeg ?? 90);
  }
  set fillAngleDeg(fillAngleDeg: number) {
    this.write((layer) => (layer.fillAngleDeg = Number(fillAngleDeg) || 0));
  }

  /**
   * The preset lists sit at nothing and go back to it.
   *
   * A preset is a way of laying keys down, not something the layer goes on being, so
   * remembering which one was chosen would say more than is true — the keys can be
   * dragged about afterwards like any others.
   */
  get entrance(): string {
    return '';
  }
  set entrance(name: string) {
    if (!isCutInEntrance(name)) return;
    this.write((layer) => applyEntrance(layer, name as CutInEntrance, this.stage, this.presetMs));
  }

  /**
   * The departure preset list, which always reads as nothing chosen.
   *
   * Choosing one lays its keys down so the layer leaves by the end of the scene, over the preset
   * duration. A name that is not a departure does nothing.
   */
  get exit(): string {
    return '';
  }
  set exit(name: string) {
    if (!isCutInExit(name)) return;
    this.write((layer) => applyExit(layer, name as CutInExit, this.stage, this.sceneDurationMs(), this.presetMs));
  }

  /** The touch drawn over the layer, such as a glow; an unknown value is written as none. */
  get effect(): CutInEffect {
    return this.layer()?.effect ?? 'none';
  }
  set effect(effect: CutInEffect) {
    this.write((layer) => (layer.effect = isCutInEffect(effect) ? effect : 'none'));
  }

  /** How strong the touch is, as a percentage held between 0 and 300. */
  get effectStrength(): number {
    return Math.round((this.layer()?.effectStrength ?? 1) * 100);
  }
  set effectStrength(percent: number) {
    const strength = Math.min(3, Math.max(0, (Number(percent) || 0) / 100));
    this.write((layer) => (layer.effectStrength = strength));
  }

  /** The colour of a touch that has one, shown as white when unset. */
  get effectColor(): string {
    return this.layer()?.effectColor || '#ffffff';
  }
  set effectColor(effectColor: string) {
    this.write((layer) => (layer.effectColor = effectColor));
  }

  /** Whether the touch chosen has a colour to it. */
  get effectHasColor(): boolean {
    return this.effect === 'glow';
  }

  /** A whole look: how it arrives, how it leaves, and what it does meanwhile. */
  get look(): string {
    return '';
  }
  set look(id: string) {
    this.write((layer) => applyLayerPreset(layer, id, this.stage, this.sceneDurationMs()));
  }

  private get stage(): { width: number; height: number } {
    return { width: this.sceneWidth(), height: this.sceneHeight() };
  }

  /**
   * Opens the image picker and puts the chosen picture on the layer, from the image button.
   *
   * Picking the empty choice clears the picture; closing the picker changes nothing. Does nothing
   * while the layer is not editable.
   */
  chooseImage(): void {
    const layer = this.target;
    if (!layer) return;

    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then((identifier) => {
      if (identifier === undefined || identifier === null) return;
      layer.imageIdentifier = identifier;
      this.commit.emit();
    });
  }
}

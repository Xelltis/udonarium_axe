import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import {
  AMBIENCE_BRIGHTNESS,
  AmbienceBrightness,
  DEFAULT_AMBIENCE_BRIGHTNESS,
} from '@axe/domain/effect/ambience/ambience-brightness';
import { type AmbienceKind, ambiencePalette, GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { SHOWN_TO, ShownTo } from '@axe/domain/tabletop/shown-to';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { FLOW_DIRECTIONS } from '@axe/domain/tabletop/water/water-flow';
import {
  WATER_PRESET_IDS,
  type WaterPresetId,
  waterPresetNamed,
  waterPresetOf,
} from '@axe/domain/tabletop/water/water-presets';
import { MAX_SURFACE_CELLS } from '@axe/domain/tabletop/water/water-surface';
import { TranslocoModule } from '@jsverse/transloco';

/** As wide as a table can be, so a marsh can cover the whole map. */
const MAX_CELLS = 100;

@Component({
  selector: 'table-ambience-settings',
  templateUrl: './table-ambience-settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class TableAmbienceSettingsComponent {
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    closeWhenOffTheTable();
  }

  target: TableAmbience | null = null;

  readonly kinds = GROUND_AMBIENCE_KINDS;

  /** The translated name of a kind of ground ambience, for the kind dropdown. */
  kindLabel(kind: AmbienceKind): string {
    return this.t(`feature.ambience.kind.${kind}`);
  }

  /** The ambience's name as shown on the table. */
  get name(): string {
    return this.target?.name ?? '';
  }
  set name(value: string) {
    if (this.target) this.target.name = value;
  }

  /** Which kind of ground ambience is drawn, such as a swamp; a change is sent to the room. */
  get kind(): string {
    return this.target?.kind ?? 'swamp';
  }
  set kind(value: string) {
    if (!this.target) return;
    this.target.ambienceKind = value;
    this.target.update();
  }

  /** How dense the ambience is, as a percentage; a change is sent to the room. */
  get densityPercent(): number {
    return Math.round((this.target?.density ?? 0) * 100);
  }
  set densityPercent(value: number) {
    if (!this.target) return;
    this.target.ambienceDensity = Number(value) / 100;
    this.target.update();
  }

  protected readonly maxSurfaceCells = MAX_SURFACE_CELLS;

  /**
   * How many cells the water stands over its floor; a change is sent to the room. Only water shows
   * it. A field left empty, as while a new depth is typed, changes nothing.
   */
  get surfaceCells(): number {
    return this.target?.surface ?? 0;
  }
  set surfaceCells(value: number | null) {
    if (!this.target || value === null || `${value}`.trim() === '') return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.target.surfaceHeight = Math.min(Math.max(Math.round(numeric * 10) / 10, 0), MAX_SURFACE_CELLS);
    this.target.update();
  }

  /** How murky the water is, as a percentage; a change is sent to the room. Only water shows it. */
  get turbidityPercent(): number {
    return Math.round((this.target?.murk ?? 0) * 100);
  }
  set turbidityPercent(value: number) {
    if (!this.target) return;
    this.target.turbidity = Math.min(Math.max(Math.round(Number(value)), 0), 100) / 100;
    this.target.update();
  }

  /** How dirty the water is, as a percentage; a change is sent to the room. Only water shows it. */
  get dirtPercent(): number {
    return Math.round((this.target?.dirt ?? 0) * 100);
  }
  set dirtPercent(value: number) {
    if (!this.target) return;
    this.target.dirtiness = Math.min(Math.max(Math.round(Number(value)), 0), 100) / 100;
    this.target.update();
  }

  protected readonly waterPresets = WATER_PRESET_IDS;

  /** Which of the looks water can be given it has, or null where its settings match none of them. */
  get waterPreset(): WaterPresetId | null {
    const target = this.target;
    return target ? waterPresetOf(target.ambienceColor, target.murk, target.dirt, target.leaves) : null;
  }
  set waterPreset(id: WaterPresetId | null) {
    const preset = waterPresetNamed(id);
    if (!preset || !this.target) return;
    this.target.ambienceColor = preset.color;
    this.target.turbidity = preset.turbidity;
    this.target.dirtiness = preset.dirt;
    this.target.floatingLeaves = preset.leaves;
    this.target.update();
  }

  /** How much of the water floating leaves cover, as a percentage; a change is sent to the room. Only water shows it. */
  get leavesPercent(): number {
    return Math.round((this.target?.leaves ?? 0) * 100);
  }
  set leavesPercent(value: number) {
    if (!this.target) return;
    this.target.floatingLeaves = Math.min(Math.max(Math.round(Number(value)), 0), 100) / 100;
    this.target.update();
  }

  /** The ways water can be set to flow. */
  readonly flowDirections = FLOW_DIRECTIONS;

  /** How fast the water flows, as a percentage; a change is sent to the room. Only water shows it. */
  get flowSpeedPercent(): number {
    return Math.round((this.target?.flow ?? 0) * 100);
  }
  set flowSpeedPercent(value: number) {
    if (!this.target) return;
    this.target.flowSpeed = Math.min(Math.max(Math.round(Number(value)), 0), 100) / 100;
    this.target.update();
  }

  /** Which way the water flows, in degrees clockwise from the top of the table; a change is sent to the room. */
  get flowDirection(): number {
    return this.target?.flowHeading ?? 0;
  }
  set flowDirection(value: number) {
    if (!this.target) return;
    this.target.flowDirection = Number(value);
    this.target.update();
  }

  /** What one way of flowing is called in the reader's language. */
  flowDirectionLabel(direction: number): string {
    return this.t(`feature.ambience.flowDirection_${direction}`);
  }

  /** What one look of water is called in the reader's language. */
  waterPresetLabel(id: WaterPresetId): string {
    return this.t(`feature.ambience.waterPreset_${id}`);
  }

  /** The default colour is shown as the field's initial value, so it can be left unset. */
  get color(): string {
    return this.target?.color ?? ambiencePalette('swamp').primary;
  }
  set color(value: string) {
    if (!this.target) return;
    this.target.ambienceColor = value;
    this.target.update();
  }

  /** Whether no colour of its own is set, which disables the reset button. */
  get isDefaultColor(): boolean {
    return (this.target?.ambienceColor ?? '').trim().length < 1;
  }

  /** Clears the ambience's own colour so it goes back to its kind's default, from the reset button. */
  resetColor(): void {
    if (!this.target) return;
    this.target.ambienceColor = '';
    this.target.update();
  }

  /** How many cells wide the ambience is, held between 1 and 100. */
  get width(): number {
    return this.target?.width ?? 1;
  }
  set width(value: number) {
    if (this.target) this.target.width = clampCells(value);
  }

  /** How many cells tall the ambience is, held between 1 and 100. */
  get height(): number {
    return this.target?.height ?? 1;
  }
  set height(value: number) {
    if (this.target) this.target.height = clampCells(value);
  }

  protected readonly brightnessChoices = AMBIENCE_BRIGHTNESS;
  protected readonly shownToChoices = SHOWN_TO;

  /** Who the look is drawn for: the master alone, whoever can see it, or the whole room. */
  get shownTo(): ShownTo {
    return this.target?.shows ?? 'room';
  }
  set shownTo(value: ShownTo) {
    if (this.target) this.target.shownTo = value;
  }

  /** What one answer is called in the reader's language. */
  shownToLabel(shown: ShownTo): string {
    return this.t(`feature.tabletop.shownTo_${shown}`);
  }

  /** How bright the ground under it is held, whatever the rest of the table is lit by. */
  get brightness(): AmbienceBrightness {
    return this.target?.shade ?? DEFAULT_AMBIENCE_BRIGHTNESS;
  }
  set brightness(value: AmbienceBrightness) {
    if (this.target) this.target.brightness = value;
  }

  /** What one brightness is called in the reader's language. */
  brightnessLabel(brightness: AmbienceBrightness): string {
    return this.t(`feature.ambience.brightness_${brightness}`);
  }

  /** Whether nobody sees through it, which is what tells a bank of fog from a picture of one. */
  get blocksSight(): boolean {
    return this.target?.blocksSight ?? false;
  }
  set blocksSight(value: boolean) {
    if (this.target) this.target.blocksSight = value;
  }

  /** Whether the ambience is locked in place on the table. */
  get isLock(): boolean {
    return this.target?.isLock ?? false;
  }
  set isLock(value: boolean) {
    if (this.target) this.target.isLock = value;
  }
}

function clampCells(value: number): number {
  const numeric = Math.round(Number(value));
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(Math.max(numeric, 1), MAX_CELLS);
}

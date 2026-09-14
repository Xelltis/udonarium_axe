import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { type AmbienceKind, ambiencePalette, GROUND_AMBIENCE_KINDS } from '@axe/domain/effect/ambience/ambience-kind';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
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

import { computed, inject, Injectable, signal } from '@angular/core';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import {
  TABLE_3D_QUALITY,
  TABLE_3D_QUALITY_SETTINGS,
  type Table3dQuality,
  table3dQualityOf,
  type Table3dQualityPlan,
  type Table3dQualitySetting,
} from '@axe/infrastructure/table-3d/table-3d-quality';

/**
 * The quality this seat draws a table on a canvas at: its own choice, kept in the browser, or left to
 * the screen, which draws lightly where the seat asked for the table to be drawn lightly, and at its
 * best where a graphics card draws it.
 */
@Injectable({ providedIn: 'root' })
export class Table3dQualityService {
  private readonly renderLite = inject(RenderLiteService);

  /** The seat's own choice, auto until it makes one. */
  readonly setting = signal<Table3dQualitySetting>(storedSetting());

  /** Whether a graphics card draws the table on this screen, once that is known. */
  private readonly graphicsCard = signal(false);

  /** The quality the table is drawn at now. */
  readonly quality = computed<Table3dQuality>(() =>
    table3dQualityOf(this.setting(), this.renderLite.active(), this.graphicsCard())
  );

  /** Takes in whether a graphics card draws the table on this screen, as asking the browser found. */
  knowGraphicsCard(drawn: boolean): void {
    this.graphicsCard.set(drawn);
  }

  /** What the table draws at that quality. */
  readonly plan = computed<Table3dQualityPlan>(() => TABLE_3D_QUALITY[this.quality()]);

  /** Moves the choice on to the next of auto, high, standard and light, which is what the one button for it does. */
  cycle(): void {
    const index = TABLE_3D_QUALITY_SETTINGS.indexOf(this.setting());
    this.set(TABLE_3D_QUALITY_SETTINGS[(index + 1) % TABLE_3D_QUALITY_SETTINGS.length]);
  }

  /** Only a choice is written down; what auto settles on is worked out afresh each visit. */
  set(setting: Table3dQualitySetting): void {
    this.setting.set(setting);
    writeLocal(STORAGE_KEYS.tableQuality, setting);
  }
}

function storedSetting(): Table3dQualitySetting {
  const stored = readLocal(STORAGE_KEYS.tableQuality);
  return TABLE_3D_QUALITY_SETTINGS.includes(stored as Table3dQualitySetting)
    ? (stored as Table3dQualitySetting)
    : 'auto';
}

import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import {
  ambienceColorOf,
  ambienceDensityOf,
  type AmbienceKind,
  isAmbienceKind,
} from '@axe/domain/effect/ambience/ambience-kind';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';

/** The weather over the whole map. */
export interface WeatherAmbience {
  kind: AmbienceKind;
  color: string;
  density: number;
}

const PERSISTENT_SOURCE = 'ambience';
const FRAME_STEP_STORAGE_KEY = 'ui-ambience-frame-step';
/**
 * The step the ambience moves by while the table is drawn the lighter way: about every other
 * frame of a 60Hz screen, which halves the drawing of weather and ground effects.
 */
const LIGHT_RENDERING_FRAME_STEP_MS = 32;

/**
 * The step ambient effects are held to, read from `ui-ambience-frame-step` in local storage, or 0
 * when that is missing or not a positive number.
 *
 * Nothing in the app writes the key, so a step only takes effect when it is put there by hand. With
 * 0 the effects move every frame unless the table is being drawn the lighter way.
 */
export function storedAmbienceFrameStepMs(): number {
  try {
    const stored = Number(localStorage.getItem(FRAME_STEP_STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  } catch {
    return 0;
  }
}

/**
 * Ambient effects on the board: weather over the whole map, and ground effects within a marked area.
 *
 * Both belong to the table, so switching maps switches them too.
 */
@Injectable({ providedIn: 'root' })
export class AmbienceService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly playbackService = inject(EffectPlaybackService);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);

  readonly areas = computed<TableAmbience[]>(() => {
    this.objectChange.collectionOf(TableAmbience.aliasName)();
    const areas = this.tabletopService.ambiences;
    for (const area of areas) this.objectChange.versionOf(area.identifier)();
    return areas;
  });

  readonly weather = computed<WeatherAmbience | null>(() => {
    const table = this.tabletopService.currentTableVersion();
    if (!isAmbienceKind(table.weatherKind)) return null;
    return {
      kind: table.weatherKind,
      color: ambienceColorOf(table.weatherKind, table.weatherColor),
      density: ambienceDensityOf(table.weatherDensity),
    };
  });

  /**
   * Whether the particles may move.
   * Motion turned off stops them, but the swamp and lava washes stay.
   */
  readonly motionEnabled = this.motion.enabled;

  readonly frameStepMs = signal(storedAmbienceFrameStepMs());

  readonly now = computed<number>(() => {
    const step = this.frameStepMs() || (this.renderLite.active() ? LIGHT_RENDERING_FRAME_STEP_MS : 0);
    const now = this.playbackService.now();
    return step > 0 ? Math.floor(now / step) * step : now;
  });

  constructor() {
    // The draw loop runs for as long as an ambience exists; unlike a cast, it never ends.
    effect(() => {
      const active = this.areas().length > 0 || this.weather() != null;
      this.playbackService.setPersistent(PERSISTENT_SOURCE, active && this.motionEnabled());
    });
  }
}

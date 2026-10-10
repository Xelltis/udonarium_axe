import { computed, effect, inject, Injectable } from '@angular/core';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectCast } from '@axe/domain/effect/effect-cast';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';

/** One frame of an effect left standing on the board. */
export interface EffectFieldRenderable {
  key: string;
  preset: EffectPreset;
  cast: EffectCast;
  elapsed: number;
}

/**
 * An effect left standing, such as a poison swamp or a wall of fire.
 *
 * It replays the same preset a cast would use, looping over its length.
 * It is an object on the board, so everyone in the room sees it and the room data keeps it.
 */
@Injectable({ providedIn: 'root' })
export class EffectFieldService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly playbackService = inject(EffectPlaybackService);
  private readonly motion = inject(MotionService);

  readonly fields = computed<EffectField[]>(() => {
    this.objectChange.collectionOf('effect-field')();
    const fields = this.objectStore.getObjects<EffectField>(EffectField);
    for (const field of fields) this.objectChange.versionOf(field.identifier)();
    return fields;
  });

  constructor() {
    // The draw loop runs for as long as a field exists; unlike a cast, it never ends.
    effect(() => this.playbackService.setPersistent('effect-field', this.fields().length > 0 && this.motion.enabled()));
  }

  /**
   * Leaves an effect standing on the table at a point. It is a room object, so every peer sees it
   * and saves keep it.
   */
  place(preset: EffectPreset, x: number, y: number, z: number): EffectField {
    const field = new EffectField();
    field.presetIdentifier = preset.identifier;
    field.location.name = 'table';
    field.location.x = x;
    field.location.y = y;
    field.posZ = z;
    field.initialize();
    return field;
  }

  /** Takes a standing effect off the table for everyone. */
  remove(field: EffectField): void {
    field.destroy();
  }

  /** Takes every standing effect off the table for everyone. */
  removeAll(): void {
    for (const field of this.fields()) field.destroy();
  }

  /** The preset a standing effect replays, or null once that preset is gone from the room. */
  presetOf(field: EffectField): EffectPreset | null {
    const preset = this.objectStore.get<EffectPreset>(field.presetIdentifier);
    return preset instanceof EffectPreset ? preset : null;
  }

  /** One frame to draw, looping over the effect's length. */
  renderables(now: number): EffectFieldRenderable[] {
    // Motion turned off stops it as it stops a cast, which matters more here because a field never ends.
    if (!this.motion.enabled()) return [];

    const gridSize = this.tabletopService.gridSize();
    const renderables: EffectFieldRenderable[] = [];

    for (const field of this.fields()) {
      const preset = this.presetOf(field);
      if (!preset || !field.isVisibleOnTable) continue;

      const half = (gridSize * (field.size > 0 ? field.size : 1)) / 2;
      renderables.push({
        key: `field-${field.identifier}`,
        preset,
        cast: {
          presetIdentifier: preset.identifier,
          casterIdentifier: '',
          origin: null,
          targets: [
            { identifier: field.identifier, x: field.location.x + half, y: field.location.y + half, z: field.posZ },
          ],
          seed: field.phaseOffset,
        },
        elapsed: (now + field.phaseOffset) % preset.duration,
      });
    }
    return renderables;
  }
}

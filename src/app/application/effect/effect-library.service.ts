import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  applyEffectPresetSeed,
  createEffectPreset,
  DEFAULT_EFFECT_PRESET_SEEDS,
} from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { duplicatedEffectName } from '@axe/domain/effect/effect-preset-form';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

@Injectable({ providedIn: 'root' })
export class EffectLibraryService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  readonly presets = computed<EffectPreset[]>(() => {
    this.objectChange.collectionOf('effect-preset')();
    const presets = this.objectStore.getObjects<EffectPreset>(EffectPreset);
    for (const preset of presets) this.objectChange.versionOf(preset.identifier)();
    return presets;
  });

  /**
   * The effect preset with this identifier, or null when there is none. Unlike `findByName`, it
   * does not hide game-master-only presets.
   */
  get(identifier: string): EffectPreset | null {
    const preset = this.objectStore.get<EffectPreset>(identifier);
    return preset instanceof EffectPreset ? preset : null;
  }

  /**
   * Looks one up by name, which is how chat and the character sheets refer to effects.
   * A game-master-only effect is not merely hidden; a player cannot reach it by name either.
   */
  findByName(name: string): EffectPreset | null {
    const needle = name.trim();
    if (needle.length < 1) return null;
    const found = this.presets().find((preset) => preset.name.trim() === needle);
    if (!found) return null;
    return found.gmOnly && !PeerCursor.isMyselfGameMaster ? null : found;
  }

  /** Builds one from nothing. */
  create(name: string): EffectPreset {
    const preset = new EffectPreset();
    preset.name = name;
    preset.initialize();
    return preset;
  }

  /**
   * Copies one whole, which is how to alter a default without breaking it.
   *
   * The values are moved across rather than the effect written out and read back: an
   * effect carries its identifier through the writing, so what came back would be it.
   */
  duplicate(source: EffectPreset): EffectPreset {
    const preset = new EffectPreset();
    const context = source.toContext();
    preset.apply({ ...context, identifier: preset.identifier });
    preset.name = duplicatedEffectName(
      source.name,
      this.presets().map((existing) => existing.name)
    );
    preset.initialize();
    return preset;
  }

  /** Deletes a preset from the room for everyone. */
  remove(preset: EffectPreset): void {
    preset.destroy();
  }

  /**
   * Brings the defaults up to date.
   * It builds what is missing and refreshes what is already there.
   * A preset with a fixed identifier cannot be rebuilt on joining, so without this an
   * existing room keeps the old timings and colours.
   */
  restoreDefaults(): { added: number; updated: number } {
    let added = 0;
    let updated = 0;

    for (const seed of DEFAULT_EFFECT_PRESET_SEEDS) {
      const existing = this.get(seed.identifier);
      if (existing) {
        applyEffectPresetSeed(existing, seed);
        existing.update();
        updated++;
        continue;
      }

      // A deleted identifier cannot be reused, so that case alone gets a new one.
      createEffectPreset(seed, seed.identifier);
      if (!this.get(seed.identifier)) createEffectPreset(seed);
      added++;
    }
    return { added, updated };
  }
}

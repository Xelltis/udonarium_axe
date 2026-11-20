import { computed, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  applyEffectPresetSeed,
  createEffectPreset,
  DEFAULT_EFFECT_PRESET_SEEDS,
} from '@axe/domain/effect/builtin-effect-presets';
import { EffectPreset, isPresetShownTo, presetsShownTo } from '@axe/domain/effect/effect-preset';
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
   * The presets this seat is shown and may fire: every one for the game master, none kept for the
   * master for anyone else (see `presetsShownTo`).
   */
  shownPresets(): EffectPreset[] {
    return presetsShownTo(this.presets(), PeerCursor.isMyselfGameMaster);
  }

  /** Whether this seat is shown one preset and may name and fire it (see `presetsShownTo`). */
  isShown(preset: EffectPreset): boolean {
    return isPresetShownTo(preset, PeerCursor.isMyselfGameMaster);
  }

  /**
   * The preset with this identifier where this seat is shown it, or null: for naming what an effect
   * already in the room plays, as an effect left standing on the table, to a seat a preset kept for the
   * game master is not named to.
   */
  shownPreset(identifier: string): EffectPreset | null {
    this.objectChange.collectionOf('effect-preset')();
    this.objectChange.versionOf(identifier)();
    const preset = this.get(identifier);
    return preset && this.isShown(preset) ? preset : null;
  }

  /**
   * Looks one up by name, which is how chat and the character sheets refer to effects, among those
   * this seat is shown: a game-master-only effect is not merely hidden; a player cannot reach it by
   * name either.
   */
  findByName(name: string): EffectPreset | null {
    const needle = name.trim();
    if (needle.length < 1) return null;
    return this.shownPresets().find((preset) => preset.name.trim() === needle) ?? null;
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
   * existing room keeps the old timings and colours. What is missing is said to be coming back
   * first, as a room server, or a seat that saw it deleted, would delete it again.
   */
  restoreDefaults(): { added: number; updated: number } {
    let added = 0;
    let updated = 0;
    this.objectStore.announceComingBack(
      DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.identifier).filter((identifier) => !this.get(identifier))
    );

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

  /**
   * Builds the defaults this room does not have and leaves every preset that exists as it is,
   * the defaults the table has adjusted among them. It answers how many it built.
   *
   * A room saved before a default was bundled does not get it on loading, and bringing the
   * defaults up to date would write over the table's own adjustments. A default the table
   * deleted counts as missing and comes back: it is said to be coming back first, as in
   * `restoreDefaults`, and is made under its own identifier, or under a new one where that
   * identifier still cannot be taken.
   */
  addMissingDefaults(): number {
    const missing = DEFAULT_EFFECT_PRESET_SEEDS.filter((seed) => !this.objectStore.get(seed.identifier));
    this.objectStore.announceComingBack(missing.map((seed) => seed.identifier));

    for (const seed of missing) {
      createEffectPreset(seed, seed.identifier);
      if (!this.get(seed.identifier)) createEffectPreset(seed);
    }
    return missing.length;
  }
}

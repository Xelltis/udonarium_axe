import { inject, Injectable, signal } from '@angular/core';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { loudestChangeRatio, ResourceChange, resourceChangeSeverity } from '@axe/domain/character/resource-change';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { autoEffectIdentifier } from '@axe/domain/effect/resource-effect-map';

const STORAGE_KEY = 'axe.effect.autoPlay';

/**
 * Plays an effect for a change in hit points or the like.
 *
 * The change has already reached everyone, so each screen plays its own
 * (broadcasting would stack one per person).
 * Tables differ on this, so it starts off and each person turns it on.
 */
@Injectable({ providedIn: 'root' })
export class EffectAutoPlayService {
  private readonly objectStore = inject(ObjectStore);
  private readonly playbackService = inject(EffectPlaybackService);
  private readonly tabletopService = inject(TabletopService);
  private readonly storage = typeof localStorage === 'undefined' ? null : localStorage;

  private readonly _enabled = signal(this.storage?.getItem(STORAGE_KEY) === 'on');
  readonly enabled = this._enabled.asReadonly();

  /** Turns automatic effects for resource changes on or off on this screen, and remembers it in this browser. */
  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    this.storage?.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  }

  /** Flips automatic effects for resource changes on this screen, and remembers it. */
  toggle(): void {
    this.setEnabled(!this._enabled());
  }

  /** Picks one change out of the list; one per line would stack up with the numbers. */
  play(character: GameCharacter, changes: readonly ResourceChange[]): boolean {
    if (!this._enabled() || changes.length < 1) return false;

    const kind = changes.some((change) => change.kind === 'damage') ? 'damage' : 'heal';
    const severity = resourceChangeSeverity(loudestChangeRatio(changes));
    const preset = this.objectStore.get<EffectPreset>(autoEffectIdentifier(kind, severity));
    if (!(preset instanceof EffectPreset)) return false;

    const half = (this.tabletopService.gridSize() * (character.size > 0 ? character.size : 1)) / 2;
    return (
      this.playbackService.play({
        presetIdentifier: preset.identifier,
        casterIdentifier: '',
        origin: null,
        targets: [
          {
            identifier: character.identifier,
            x: character.location.x + half,
            y: character.location.y + half,
            z: character.posZ,
          },
        ],
        seed: Math.floor(Math.random() * 0xffffffff),
      }) != null
    );
  }
}

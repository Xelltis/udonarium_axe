import { inject, Injectable } from '@angular/core';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { CutIn } from '@axe/domain/media/cut-in';
import { SoundEffect } from '@axe/domain/media/sound-effect';

/**
 * Plays the effects, sounds and cut-ins the table was told to play by name.
 *
 * The things the master sets up on the table name what they play rather than pointing at it: a
 * map carried into another room holds identifiers that mean nothing there, and a name that
 * matches one thing and no other still finds it. Each answers whether it found anything to play.
 */
@Injectable({ providedIn: 'root' })
export class NamedCueService {
  private readonly effectLibrary = inject(EffectLibraryService);
  private readonly effectCast = inject(EffectCastService);
  private readonly cutIns = inject(CutInService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly objectStore = inject(ObjectStore);

  /**
   * Plays the effect of that name on the pieces given.
   *
   * Looked up past the master-only gate: whatever named it was set up by the master, so playing it
   * is the table's doing rather than the reader's reaching.
   */
  playEffect(name: string, on: readonly GameCharacter[]): boolean {
    const named = name.trim();
    if (named.length < 1 || on.length < 1) return false;
    const preset = this.effectLibrary.presets().find((held) => held.name.trim() === named);
    if (!preset) return false;
    return this.effectCast.fire(preset, on, null) !== null;
  }

  /** Plays the room's sound of that name, where exactly one goes by it. */
  playSound(name: string): boolean {
    const heard = name.trim();
    if (heard.length < 1) return false;
    const audio = this.audioStorage.audios.filter((held) => held.name.trim() === heard);
    if (audio.length !== 1) return false;
    SoundEffect.play(audio[0]);
    return true;
  }

  /** Plays the room's cut-in of that name. */
  launchCutIn(name: string): boolean {
    const shown = name.trim();
    if (shown.length < 1) return false;
    const found = findByReference(this.objectStore.getObjects<CutIn>(CutIn), '', shown);
    if (!found) return false;
    this.cutIns.launch(found.thing);
    return true;
  }
}

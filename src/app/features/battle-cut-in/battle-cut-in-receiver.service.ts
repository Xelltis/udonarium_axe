import { DestroyRef, inject, Injectable } from '@angular/core';
import { BattleCutInPreferenceService } from '@axe/application/battle/battle-cut-in-preference.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BattleScene, normalizeBattleScene } from '@axe/domain/battle/battle-scene';
import { BATTLE_DRAIN_MS } from '@axe/domain/battle/battle-timeline';
import { GameCharacter } from '@axe/domain/character/game-character';
import { effectLandingTimes } from '@axe/domain/effect/effect-timeline';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';

/**
 * Plays an exchange the room sent to the battle stage.
 *
 * A screen whose reader turned the stage off sees the blow on the table instead, from the one
 * striking at those struck, and a fighter brought down goes down there once it has landed, so
 * nothing of the exchange is lost to them but the stage itself.
 */
@Injectable({ providedIn: 'root' })
export class BattleCutInReceiverService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly preference = inject(BattleCutInPreferenceService);
  private readonly state = inject(BattleCutInStateService);
  private readonly library = inject(EffectLibraryService);
  private readonly cast = inject(EffectCastService);
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();

  constructor() {
    this.destroyRef.onDestroy(() => {
      for (const timer of this.timers) clearTimeout(timer);
      this.timers.clear();
    });
  }

  /** Plays a scene as it came over the network; one that cannot be read is passed over. */
  receive(raw: unknown): void {
    const scene = normalizeBattleScene(raw);
    if (!scene) return;
    if (this.preference.shown()) this.state.show(scene);
    else this.playOnTable(scene);
  }

  private playOnTable(scene: BattleScene): void {
    const attacker = this.pieceOf(scene.attacker.identifier);
    const struck = scene.defenders.map((defender) => this.pieceOf(defender.identifier)).filter(isPiece);
    const blow = this.library.get(scene.effect);
    if (blow) this.cast.playHere(blow, struck, attacker);

    const fallen = scene.defenders
      .filter((defender) => defender.defeated)
      .map((defender) => this.pieceOf(defender.identifier))
      .filter(isPiece);
    const defeat = this.library.get(scene.defeatEffect);
    if (!defeat || fallen.length < 1) return;

    const landing = blow ? (effectLandingTimes(blow)[0] ?? 0) : 0;
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.cast.playHere(defeat, fallen, null);
    }, landing + BATTLE_DRAIN_MS);
    this.timers.add(timer);
  }

  /** A piece out on the table, where an effect can be played on it. */
  private pieceOf(identifier: string): GameCharacter | null {
    const piece = this.objectStore.get<GameCharacter>(identifier);
    return piece instanceof GameCharacter && piece.isVisibleOnTable ? piece : null;
  }
}

function isPiece(piece: GameCharacter | null): piece is GameCharacter {
  return piece !== null;
}

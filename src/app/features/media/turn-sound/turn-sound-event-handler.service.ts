import { DestroyRef, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { TURN_SE_SIGNAL, TURN_SE_TICK } from '@axe/core/audio/turn-chime';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { readTurnStart, TurnState } from '@axe/domain/tabletop/turn-state';
import { TurnChimePlayer } from '@axe/features/media/turn-sound/turn-chime-player';

/**
 * How lately a turn has to have begun to be worth a sound.
 *
 * A screen joining the room, or coming back after the connection dropped, is told the turn as
 * it stands on the same event a turn being handed over arrives on. Without this it would chime
 * for a turn that began before it was there. The same span the chat's notes allow.
 */
const JUST_BEGUN_MS = 30_000;

/**
 * Chimes when a turn begins: a signal on the screen of whoever owns the piece, and a tick on
 * everyone else's, each as the room has them on.
 *
 * A piece of the master's side, or one nobody owns, is everyone's tick, the master's included.
 * Nothing is played while a recording is played back on this screen or the screen is an overlay
 * for streaming, and a turn is chimed once however often it is told.
 */
@Injectable({ providedIn: 'root' })
export class TurnSoundEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly overlay = inject(OverlayModeService);
  private readonly chime = inject(TurnChimePlayer);
  private lastChimed = '';

  constructor() {
    this.objectChange.onObjectChangedForIdentifier('TurnState', () => this.turnChanged(), this.destroyRef);
  }

  private turnChanged(): void {
    const mark = this.objectStore.get<TurnState>('TurnState')?.turnStart ?? '';
    if (mark === this.lastChimed) return;
    const started = readTurnStart(mark);
    if (!started || Date.now() - started.at > JUST_BEGUN_MS) return;
    this.lastChimed = mark;
    if (isNetworkIsolated() || this.overlay.active()) return;

    const piece = this.objectStore.get<GameCharacter>(started.identifier);
    if (!(piece instanceof GameCharacter)) return;
    const config = this.objectStore.get<Config>('Config');
    if (!config) return;
    const mine = !piece.isNpc && piece.owner.length > 0 && piece.owner === PeerCursor.myUserId;
    if (mine) {
      if (config.turnSignalEnabled) this.chime.play(TURN_SE_SIGNAL);
    } else if (config.turnTickEnabled) {
      this.chime.play(TURN_SE_TICK);
    }
  }
}

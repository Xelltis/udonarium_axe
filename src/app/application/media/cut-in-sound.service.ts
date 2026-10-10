import { DestroyRef, inject, Injectable } from '@angular/core';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import type { CutInScene } from '@axe/domain/media/cut-in-scene';
import type { CutInSound } from '@axe/domain/media/cut-in-sound';

/** One scene's sounds, going until whoever set them going says otherwise. */
export interface CutInSoundHandle {
  stop(): void;
}

interface Session {
  timers: ReturnType<typeof setTimeout>[];
  players: Map<string, AudioPlayer>;
}

/**
 * The sounds a scene drops, played where they fall.
 *
 * Each one is set going by its own timer rather than by watching the clock, so nothing
 * has to run between them. A scene that repeats has its sounds laid out again each time
 * round, which is also what keeps a long scene from booking hundreds of timers at once.
 *
 * Every scene set going gets a run of its own to be stopped by. Two cut-ins can be up at
 * once — one being played in the room while another is being worked on, or the same one
 * fired again before it has finished — and one of them closing must take its own sounds
 * with it and nothing else's.
 */
@Injectable({ providedIn: 'root' })
export class CutInSoundService {
  private readonly audioStorage = inject(AudioStorage);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sessions = new Set<Session>();

  constructor() {
    this.destroyRef.onDestroy(() => this.stopAll());
  }

  /** Sets the sounds of a scene going, from wherever the clock stands. */
  play(scene: CutInScene | null, fromMs = 0, loop = false): CutInSoundHandle {
    const session: Session = { timers: [], players: new Map() };
    if (scene) {
      this.sessions.add(session);
      const runningMs = scene.runningMs;
      this.schedule(session, scene.soundList, fromMs, runningMs, loop ? runningMs : 0);
    }
    return { stop: () => this.end(session) };
  }

  /** Silences every scene at once, for a room going quiet rather than a cut-in closing. */
  stopAll(): void {
    for (const session of [...this.sessions]) this.end(session);
  }

  private end(session: Session): void {
    this.sessions.delete(session);
    for (const timer of session.timers) clearTimeout(timer);
    session.timers = [];
    for (const player of session.players.values()) player.stop();
    session.players.clear();
  }

  private schedule(
    session: Session,
    sounds: readonly CutInSound[],
    fromMs: number,
    runningMs: number,
    loopMs: number
  ): void {
    for (const sound of sounds) {
      if (sound.t < fromMs) continue;
      session.timers.push(setTimeout(() => this.ring(session, sound), sound.t - fromMs));
    }

    if (loopMs <= 0) return;
    // Laid out again from the top rather than booked to the end of time.
    session.timers.push(
      setTimeout(() => this.schedule(session, sounds, 0, runningMs, loopMs), Math.max(1, loopMs - fromMs))
    );
  }

  private ring(session: Session, sound: CutInSound): void {
    const audio = this.audioStorage.get(sound.a);
    if (!audio) return;

    const player = this.playerFor(session, sound.a);
    player.volumeType = VolumeType.CUT_IN;
    player.loop = false;
    player.volume = Math.min(1, Math.max(0, sound.v / 100));
    player.play(audio);
  }

  private playerFor(session: Session, identifier: string): AudioPlayer {
    const known = session.players.get(identifier);
    if (known) return known;

    const player = new AudioPlayer();
    session.players.set(identifier, player);
    return player;
  }
}

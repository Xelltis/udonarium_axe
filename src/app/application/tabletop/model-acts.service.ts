import { computed, inject, Injectable, signal } from '@angular/core';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectSceneLooksService } from '@axe/application/effect/effect-scene-looks.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { callModelMotion } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { askedRoleOf } from '@axe/domain/tabletop/model-asked-roles';
import { type ModelAct } from '@axe/domain/tabletop/model-motions';

const NO_ACTS: ReadonlyMap<string, ModelAct> = new Map();

/** How long an act asked for outright is kept, in milliseconds: longer than any plays, after which it is forgotten. */
const ASKED_ACT_KEPT_MS = 30_000;
/** How soon after a blow taken another is not taken again, in milliseconds: one blow that both an effect and a falling number tell of. */
const BLOW_APART_MS = 900;

/**
 * What the model of each piece is asked to act now, by the piece's identifier: a blow, a spell, a
 * blow taken or its going down, as the effects this seat plays have it (see `modelActsOf`), and what
 * a piece is asked for outright: a blow taken when a number of it falls with no effect played on
 * it, and a motion somebody has its model play as a gesture, which another seat asks of this one
 * as `ModelMotionEventHandlerService` lets it. Every seat works the first out from
 * what it plays, so nothing more is sent for them, by the looks of the effects, which are loaded
 * apart from the page: until they are, no effect has a model act, as nothing of an effect is drawn
 * in the scene. A gesture is sent to every seat, to be played there once and kept nowhere. A part is drawn as its body, so what a part is asked to act its
 * body's model acts.
 */
@Injectable({ providedIn: 'root' })
export class ModelActsService {
  private readonly playback = inject(EffectPlaybackService);
  private readonly objectStore = inject(ObjectStore);
  private readonly links = inject(PieceLinksService);
  private readonly sceneLooks = inject(EffectSceneLooksService);
  private readonly asked = signal<ReadonlyMap<string, ModelAct>>(NO_ACTS);
  private serial = 0;

  readonly acts = computed<ReadonlyMap<string, ModelAct>>(
    () => {
      const casts = this.playback.activeCasts();
      const asked = this.asked();
      if (casts.length < 1) return asked;
      const looks = this.sceneLooks.looks();
      if (!looks) return asked;
      const played = looks.modelActsOf(
        casts.map(({ key, cast, preset, startedAt, blows }) => ({
          key,
          cast,
          kind: preset.effectKind,
          startedAt,
          blows,
        })),
        (identifier) => this.standsAt(identifier),
        (identifier) => this.drawnAs(identifier)
      );
      for (const [identifier, act] of asked) if (!played.has(identifier)) played.set(identifier, act);
      return played.size < 1 ? NO_ACTS : played;
    },
    { equal: (a, b) => a === b || (a.size === 0 && b.size === 0) }
  );

  /**
   * Has a piece's model take a blow now, unless it is taking, or about to take, one that an effect
   * lands on it, or took one only just now.
   */
  strike(identifier: string): void {
    const owner = this.drawnAs(identifier);
    const now = clock();
    const taking = this.acts().get(owner);
    if (taking && (taking.role === 'defeat' || (taking.role === 'hit' && now - taking.atMs < BLOW_APART_MS))) return;
    this.ask(owner, { key: `asked:${++this.serial}`, role: 'hit', atMs: now });
  }

  /**
   * Has a piece's model play a motion now, on this screen: the role a word for one asks for, a blow,
   * a spell or a blow taken, or else the model's own motion of that name. Asked by name, it is the
   * model's own motion of that name, though the name be a word for a role as well.
   */
  play(identifier: string, motion: string, { named = false }: { readonly named?: boolean } = {}): void {
    const role = named ? null : askedRoleOf(motion);
    const key = `asked:${++this.serial}`;
    this.ask(
      this.drawnAs(identifier),
      role ? { key, role, atMs: clock() } : { key, role: 'named', name: motion.trim(), atMs: clock() }
    );
  }

  /** Has a piece's model play a motion once on every screen, this one included, as {@link play} has it. */
  playForAll(identifier: string, motion: string, { named = false }: { readonly named?: boolean } = {}): void {
    callModelMotion(named ? { identifier, motion, named } : { identifier, motion });
  }

  private ask(owner: string, act: ModelAct): void {
    const kept = new Map<string, ModelAct>();
    for (const [identifier, before] of this.asked()) {
      if (act.atMs - before.atMs < ASKED_ACT_KEPT_MS) kept.set(identifier, before);
    }
    kept.set(owner, act);
    this.asked.set(kept);
  }

  /** The piece a piece is drawn as: its body, for a part; itself otherwise. */
  private drawnAs(identifier: string): string {
    const piece = this.objectStore.get(identifier);
    return piece instanceof GameCharacter ? (this.links.bodyOf(piece)?.identifier ?? identifier) : identifier;
  }

  /** Where a piece stands on the table, or null for one that is not there. */
  private standsAt(identifier: string): { x: number; y: number } | null {
    const piece = this.objectStore.get(identifier);
    return piece instanceof GameCharacter ? { x: piece.location.x, y: piece.location.y } : null;
  }
}

function clock(): number {
  return typeof performance === 'object' ? performance.now() : Date.now();
}

import { type EffectBlow, wallClockOf } from '@axe/domain/effect/effect-blows';
import type { EffectCast } from '@axe/domain/effect/effect-cast';
import { defeatReactionOf } from '@axe/domain/effect/effect-defeat';
import type { EffectKind } from '@axe/domain/effect/effect-kind';
import type { ModelAct } from '@axe/domain/tabletop/model-motions';

/** An effect being played, as far as what the models of the pieces in it act is worked out from. */
export interface ActedCast {
  /** Tells one playing of an effect from another. */
  readonly key: number;
  readonly cast: EffectCast;
  readonly kind: EffectKind;
  /** When it began to play, in the milliseconds frames are timed in. */
  readonly startedAt: number;
  /** The blows it lands, the first of which is the moment those it strikes are struck. */
  readonly blows: readonly EffectBlow[];
}

/** The looks whose blow is struck with the body, a blade or a fist, rather than worked or loosed from afar. */
const STRUCK_BY_HAND: ReadonlySet<EffectKind> = new Set<EffectKind>(['slash', 'bash', 'bisect', 'gore']);

/**
 * What the model of the one who casts an effect of a look acts as it begins: a blow, for a look
 * struck by hand, or a spell.
 */
export function castRoleOf(kind: EffectKind): 'attack' | 'cast' {
  return STRUCK_BY_HAND.has(kind) ? 'attack' : 'cast';
}

/**
 * What the models of the pieces in the effects being played act, by piece: the one who cast an effect
 * strikes a blow or works a spell as it begins, by whether its look is struck by hand; each piece an
 * effect lands a blow on takes it as the first blow lands; and each piece an effect brings down goes
 * down as it begins. A piece in more than one of these acts the gravest: going down before taking a
 * blow, and that before striking one; of two alike, the later.
 *
 * Each act is made towards the other in it: the first one struck for the one striking, and where the
 * effect is cast from for those struck or brought down. `standsAt` says where a piece stands on the
 * table, for a caster the cast names no point for; where neither is known the act is made the way
 * the piece faces. `drawnAs` names the piece a piece in a cast is drawn as, its body for a part.
 */
export function modelActsOf(
  casts: readonly ActedCast[],
  standsAt: (identifier: string) => { x: number; y: number } | null,
  drawnAs: (identifier: string) => string = (identifier) => identifier
): Map<string, ModelAct> {
  const acts = new Map<string, ModelAct>();
  const lay = (identifier: string, act: ModelAct) => {
    const owner = drawnAs(identifier);
    const before = acts.get(owner);
    if (!before || GRAVITY[act.role] >= GRAVITY[before.role]) acts.set(owner, act);
  };
  for (const { key, cast, kind, startedAt, blows } of casts) {
    const caster = cast.casterIdentifier;
    const from = cast.origin ?? (caster ? standsAt(caster) : null);
    const first = cast.targets[0];
    if (caster) {
      lay(caster, {
        key: `${key}:blow`,
        role: castRoleOf(kind),
        atMs: startedAt,
        ...towards(from, first && drawnAs(first.identifier) !== drawnAs(caster) ? first : null),
      });
    }
    const falls = defeatReactionOf(kind) !== '';
    const landsAt = blows.length > 0 ? startedAt + wallClockOf(blows, blows[0].atMs) : null;
    for (const target of cast.targets) {
      if (caster && drawnAs(target.identifier) === drawnAs(caster)) continue;
      if (falls)
        lay(target.identifier, { key: `${key}:down`, role: 'defeat', atMs: startedAt, ...towards(target, from) });
      else if (landsAt !== null) {
        lay(target.identifier, { key: `${key}:hit`, role: 'hit', atMs: landsAt, ...towards(target, from) });
      }
    }
  }
  return acts;
}

/** How grave each act is beside the others, which decides the one a piece in several acts. */
const GRAVITY: Readonly<Record<ModelAct['role'], number>> = { named: 0, cast: 1, attack: 1, hit: 2, defeat: 3 };

/** The way from one point of the table to another, of unit length, or nothing where either is unknown or they are one. */
function towards(from: { x: number; y: number } | null, to: { x: number; y: number } | null): Pick<ModelAct, 'toward'> {
  if (!from || !to) return {};
  const [x, y] = [to.x - from.x, to.y - from.y];
  const length = Math.hypot(x, y);
  return length > 1e-6 ? { toward: { x: x / length, y: y / length } } : {};
}

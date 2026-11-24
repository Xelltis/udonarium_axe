import type { ActRole, ModelAct, MotionRole } from '@axe/domain/tabletop/model-motions';

/**
 * The words a motion made for each role is likely to be named with: in letters, the beginnings of the
 * words of its name, so that "Walking" is a walk but "Soldier" is no death; in kana and kanji, which
 * run on without a break between words, anywhere in its name.
 */
const NAMED: Readonly<Record<MotionRole, { readonly word: RegExp; readonly written: RegExp }>> = {
  idle: { word: /^(?:idle|stand|wait)/, written: /待機|立ち/ },
  walk: { word: /^(?:walk|run|move)/, written: /歩|走/ },
  attack: {
    word: /^(?:attack|slash|strike|punch|kick|swing|stab|melee|bite)/,
    written: /攻撃|斬|殴/,
  },
  cast: { word: /^(?:cast|spell|magic|shoot|throw|ranged|bows?$)/, written: /魔法|詠唱|射撃|投/ },
  hit: { word: /^(?:hit|hurt|damage|flinch|react|pain|stagger)/, written: /被弾|ダメージ|やられ|のけぞ/ },
  defeat: { word: /^(?:death|die[sd]?$|dead|defeat|down|fall|knock|ko$)/, written: /死亡|撃破|倒れ|ダウン/ },
};

/**
 * Whether a motion is named for a role: whether a word of its name, as the name is broken at
 * anything but a letter and where a capital follows a small letter, begins as the role's words do,
 * or whether it holds the role's kana or kanji.
 */
function namedFor(role: MotionRole, name: string): boolean {
  const named = NAMED[role];
  return named.written.test(name) || wordsOf(name).some((word) => named.word.test(word));
}

function wordsOf(name: string): string[] {
  return name
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}]+/u)
    .map((word) => word.toLowerCase())
    .filter((word) => word !== '');
}

/**
 * The motion a model plays for a role, of those it has: the one its piece asks for by name, or where
 * it names none or one the model lacks, the model's own, told by its name. A model with nothing for
 * working a spell strikes a blow instead, and a motion named for a blow is not taken for the taking
 * of one. Standing, it plays over and over a motion named for standing, or else its first motion,
 * but never one named for another role as well, as a blow or a walk, which it would play over and
 * over where it stands. Null where it has none.
 */
export function motionNameFor(role: MotionRole, names: readonly string[], asked: string): string | null {
  if (asked) {
    const exact = names.find((name) => name === asked) ?? names.find((name) => sameName(name, asked));
    if (exact !== undefined) return exact;
  }
  const own = (wanted: MotionRole) =>
    names.find((name) => namedFor(wanted, name) && !(wanted === 'hit' && isBlow(name))) ?? null;
  if (role === 'idle') {
    const standing = names.filter((name) => !namedForAnother(name));
    return standing.find((name) => namedFor('idle', name)) ?? standing[0] ?? null;
  }
  if (role === 'cast') return own('cast') ?? own('attack');
  return own(role);
}

/** Whether a motion is named for a role other than standing. */
function namedForAnother(name: string): boolean {
  return ACT_OR_WALK.some((role) => namedFor(role, name));
}

/** The roles a motion may be named for besides standing. */
const ACT_OR_WALK: readonly MotionRole[] = ['walk', 'attack', 'cast', 'hit', 'defeat'];

function isBlow(name: string): boolean {
  return namedFor('attack', name) || namedFor('cast', name);
}

function sameName(one: string, other: string): boolean {
  return one.trim().toLowerCase() === other.trim().toLowerCase();
}

/**
 * Where a model moved by hand is at one moment of a motion, from how it stands: lifted off the floor
 * and carried the way it acts, both in widths of its piece, tipped that way (or back from it, below
 * nought) in degrees about its foot, and stretched upright, 1 as it was made.
 */
export interface MadePose {
  readonly lift: number;
  readonly forward: number;
  readonly pitchDeg: number;
  readonly stretch: number;
}

/** A model as it stands. */
export const MADE_REST: MadePose = Object.freeze({ lift: 0, forward: 0, pitchDeg: 0, stretch: 1 });

/** How long each motion made by hand plays, in milliseconds: a walk for each hop, the rest once through. */
export const MADE_MOTION_MS: Readonly<Record<Exclude<MotionRole, 'idle'>, number>> = {
  walk: 340,
  attack: 620,
  cast: 760,
  hit: 420,
  defeat: 900,
};

interface MadeKey extends Partial<MadePose> {
  readonly at: number;
}

const MADE_KEYS: Readonly<Record<ActRole, readonly MadeKey[]>> = {
  attack: [
    { at: 0 },
    { at: 0.22, forward: -0.14, pitchDeg: -9, stretch: 0.96 },
    { at: 0.46, forward: 0.46, pitchDeg: 20, stretch: 1.04, lift: 0.05 },
    { at: 0.62, forward: 0.4, pitchDeg: 14 },
    { at: 1 },
  ],
  cast: [
    { at: 0 },
    { at: 0.3, lift: 0.1, pitchDeg: -10, stretch: 1.05 },
    { at: 0.52, lift: 0.14, pitchDeg: 12, stretch: 1.02, forward: 0.08 },
    { at: 0.7, lift: 0.06, pitchDeg: 6 },
    { at: 1 },
  ],
  hit: [
    { at: 0 },
    { at: 0.2, forward: -0.22, pitchDeg: -18, stretch: 0.94 },
    { at: 0.5, forward: -0.1, pitchDeg: 6 },
    { at: 0.75, forward: -0.03, pitchDeg: -3 },
    { at: 1 },
  ],
  defeat: [
    { at: 0 },
    { at: 0.18, forward: -0.08, pitchDeg: 8, stretch: 0.97 },
    { at: 0.72, forward: -0.2, pitchDeg: -92, lift: 0.1 },
    { at: 0.86, forward: -0.2, pitchDeg: -84, lift: 0.14 },
    { at: 1, forward: -0.2, pitchDeg: -88, lift: 0.1 },
  ],
};

/**
 * Where a model moved by hand is so long into a motion, in milliseconds: hopping along for a walk,
 * for as long as it walks; drawn back and thrust out for a blow; risen and swept for a spell; thrown
 * back by a blow taken; and tipped over on its back to go down, where it stays. As it stands for
 * standing, and once a motion played once through is over.
 */
export function madePoseAt(role: MotionRole, elapsedMs: number): MadePose {
  if (role === 'idle' || !(elapsedMs >= 0)) return MADE_REST;
  if (role === 'walk') {
    const hop = Math.abs(Math.sin((elapsedMs / MADE_MOTION_MS.walk) * Math.PI));
    return { lift: 0.12 * hop, forward: 0, pitchDeg: 5, stretch: 0.96 + 0.07 * hop };
  }
  const share = Math.min(1, elapsedMs / MADE_MOTION_MS[role]);
  const keys = MADE_KEYS[role];
  let next = keys.findIndex((key) => key.at >= share);
  if (next < 1) next = share <= 0 ? 1 : keys.length - 1;
  const from = keys[next - 1];
  const to = keys[next];
  const eased = easeInOut((share - from.at) / Math.max(1e-6, to.at - from.at));
  const between = (field: keyof MadePose) => {
    const start = from[field] ?? MADE_REST[field];
    return start + ((to[field] ?? MADE_REST[field]) - start) * eased;
  };
  return {
    lift: between('lift'),
    forward: between('forward'),
    pitchDeg: between('pitchDeg'),
    stretch: between('stretch'),
  };
}

function easeInOut(share: number): number {
  const held = Math.min(1, Math.max(0, share));
  return held * held * (3 - 2 * held);
}

/** Whether a model stays as an act leaves it, rather than stands again: one brought down stays down. */
export function actHolds(act: Pick<ModelAct, 'role'>): boolean {
  return act.role === 'defeat';
}

/** How long a motion made by hand plays for an act, in milliseconds; nothing for a motion asked for by name, which no hand makes. */
export function madeActMs(act: Pick<ModelAct, 'role'>): number {
  return act.role === 'named' ? 0 : MADE_MOTION_MS[act.role];
}

import type { ActRole } from '@axe/domain/tabletop/model-motions';

/** The roles a piece's model may be asked to play outright, as a gesture: one going down would stay down. */
export type AskedRole = Exclude<ActRole, 'defeat'>;

export const ASKED_ROLES: readonly AskedRole[] = ['attack', 'cast', 'hit'];

/** The words each role is asked for by, in whichever of the tongues the room is played in. */
const ROLE_WORDS: Readonly<Record<AskedRole, readonly string[]>> = {
  attack: ['attack', '攻撃', '공격'],
  cast: ['cast', 'spell', '魔法', '射撃', '마법', '사격'],
  hit: ['hit', '被弾', '피격'],
};

/** The role a word asks a model to play, or null for a word that names no role, as the name of one of the model's own motions. */
export function askedRoleOf(word: string): AskedRole | null {
  const asked = word.normalize('NFKC').trim().toLowerCase();
  return ASKED_ROLES.find((role) => ROLE_WORDS[role].includes(asked)) ?? null;
}

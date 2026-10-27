import { BattleSide } from '@axe/domain/battle/battle-lineup';
import { FighterReading, readFighter } from '@axe/domain/battle/battle-reading';
import { GameCharacter } from '@axe/domain/character/game-character';

/** Who strikes whom, and with what. */
export interface BattleRequest {
  attacker: GameCharacter;
  defenders: readonly GameCharacter[];
  /** The effect named for the blow. Empty takes the one striking's own, then the stage's own. */
  effectName?: string;
  /** The side the one striking stands on. Left out, it is worked out from the sides the pieces were put on. */
  attackerSide?: BattleSide;
  /** Whether the numbers are kept back, as they are for a line said in secret. */
  secret?: boolean;
}

/** A bout with its pieces read as they stood before anything moved. */
export interface BattleTake {
  request: BattleRequest;
  before: ReadonlyMap<string, FighterReading>;
}

/**
 * Reads the pieces of a bout as they stand, before a change is made to them.
 *
 * It has to be done at once, before whatever changes the numbers gets to them, so it is kept apart
 * from the rest of playing a bout, which is fetched the first time a bout is played.
 */
export function takeBattle(request: BattleRequest): BattleTake {
  const before = new Map<string, FighterReading>();
  for (const character of [request.attacker, ...request.defenders]) {
    before.set(character.identifier, readFighter(character));
  }
  return { request, before };
}

import { ObjectStore } from '@axe/core/sync/object-store';
import {
  asBattleSide,
  BATTLE_SIDE_OUT,
  BattleSide,
  battleSideOf,
  SidedFighter,
} from '@axe/domain/battle/battle-lineup';
import { Party } from '@axe/domain/party/party';

/** The side a party of the room stands on, by its identifier. None for a party the room has not got. */
function partySideOf(identifier: string): BattleSide | null {
  const party = ObjectStore.instance.get(identifier);
  return party instanceof Party ? asBattleSide(party.battleSide) : null;
}

/** Which side a piece stands on in this room, its own or else its party's; see {@link battleSideOf}. */
export function standingBattleSide(piece: SidedFighter): BattleSide | null {
  return battleSideOf(piece, partySideOf);
}

/**
 * Puts a piece on a side, or takes it out of the lineup. Taken out, it stays out though its party
 * stands on a side; where its party stands on none, out is simply no side of its own.
 */
export function putOnBattleSide(piece: SidedFighter, side: BattleSide | null): void {
  piece.battleSide = side ?? (partySideOf(piece.partyIdentifier) ? BATTLE_SIDE_OUT : '');
}

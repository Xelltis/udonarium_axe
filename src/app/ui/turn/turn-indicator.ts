import { TurnPhase } from '@axe/domain/tabletop/turn-state';

export interface TurnIndicator {
  readonly round: number;
  readonly statusKey: string | null;
  readonly name: string;
  /** The side whose phase it is, or nothing where the round is not taken side by side. */
  readonly sideName: string;
}

/**
 * What the turn display shows for the current phase of the turn order.
 *
 * Null while turns are not being kept. Before and after a round it shows a status instead of a
 * name; during one it names whoever is up, or the side whose phase it is, or says no one is up.
 */
export function buildTurnIndicator(
  phase: TurnPhase,
  round: number,
  currentName: string,
  sideName = ''
): TurnIndicator | null {
  if (phase === 'idle') return null;

  switch (phase) {
    case 'roundStart':
      return { round, statusKey: 'feature.turnOrder.beforeRound', name: '', sideName };
    case 'roundEnd':
      return { round, statusKey: 'feature.turnOrder.afterRound', name: '', sideName };
    default:
      if (currentName.length > 0) return { round, statusKey: null, name: currentName, sideName };
      // A side with its phase open and nobody up yet is that side's turn, not nobody's.
      if (sideName.length > 0) return { round, statusKey: null, name: '', sideName };
      return { round, statusKey: 'feature.turnOrder.noTurn', name: '', sideName };
  }
}

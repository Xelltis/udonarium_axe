import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';

export type TurnPhase = 'idle' | 'roundStart' | 'acting' | 'roundEnd';

@SyncObject('TurnState')
export class TurnState extends GameObject {
  private static _instance: TurnState;
  /**
   * The room's one turn state: the synced one once it has arrived, otherwise a local one made on
   * first use.
   */
  static get instance(): TurnState {
    const stored = ObjectStore.instance.get<TurnState>('TurnState');
    if (stored) return (TurnState._instance = stored);
    if (!TurnState._instance) TurnState._instance = new TurnState('TurnState');
    TurnState._instance.initialize();
    return TurnState._instance;
  }

  @SyncVar() currentIdentifier: string = '';
  /** The side whose phase it is, where the round is taken side by side. */
  @SyncVar() currentSide: string = '';
  @SyncVar() round: number = 0;
  @SyncVar() phase: TurnPhase = 'idle';
  @SyncVar() buffDecay: boolean = true;
  /** Who has had their turn this round. Emptied when a round opens. */
  @SyncVar() actedIdentifiers: string[] = [];
  /** What the round did, step by step, so that going back puts it all as it was. */
  @SyncVar() history: string = '[]';
  /**
   * Whose turn last began and when, as {@link turnStartMark} writes it: written when a turn is
   * handed over, and not when the round is put back, so that a screen can tell a turn that has
   * just begun from one it is only being told of on joining.
   */
  @SyncVar() turnStart: string = '';
}

/** The mark of a piece's turn beginning at a time, in ms since the epoch. */
export function turnStartMark(identifier: string, at: number): string {
  return `${identifier}@${Math.round(at)}`;
}

/** Whose turn a mark says began, and when; nothing for an empty or unreadable mark. */
export function readTurnStart(mark: string): { identifier: string; at: number } | null {
  const text = String(mark ?? '');
  const split = text.lastIndexOf('@');
  if (split < 1) return null;
  const at = Number(text.slice(split + 1));
  return Number.isFinite(at) && at > 0 ? { identifier: text.slice(0, split), at } : null;
}

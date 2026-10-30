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

  /**
   * Lets go of the one held here as it leaves the store, so that the next reader is given one made
   * anew, as for a room just started, rather than this one put back as it was.
   */
  override onStoreRemoved() {
    super.onStoreRemoved();
    if (TurnState._instance === this) TurnState._instance = undefined as unknown as TurnState;
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
  /** The pieces waiting to step in this round and the turns stepped into, as {@link writeTurnHolding} writes them. */
  @SyncVar() holding: string = '';
  /**
   * What the opening of the latest turn counted down, as `writeTurnOpening` writes it, for the piece
   * to have it given back should it wait. Not kept in a save, like the rest of the round's record.
   */
  @SyncVar() turnOpening: string = '';
}

/** The pieces waiting to step in this round, and the turns stepped into to be taken up again. */
export interface TurnHolding {
  /** The pieces waiting to step in, in the order they began to wait. */
  readonly held: readonly string[];
  /** Of those, the ones whose turn had begun before they waited, which does not begin a second time. */
  readonly begun: readonly string[];
  /** The turns stepped into, the latest last, each taken up again once the one that stepped in is done. */
  readonly interrupted: readonly string[];
  /**
   * Of those whose turn had begun, the ones that had what its opening counted down given back as they
   * began to wait, which is counted down again when their turn comes back.
   */
  readonly givenBack: readonly string[];
}

export const NO_HOLDING: TurnHolding = { held: [], begun: [], interrupted: [], givenBack: [] };

/**
 * Reads what the round holds back, as it was sent or saved.
 *
 * Text that cannot be read, or none at all, as from a version that knew nothing of waiting, holds
 * nobody back; a list that is not one of names reads as empty.
 */
export function readTurnHolding(raw: unknown): TurnHolding {
  if (typeof raw !== 'string' || raw === '') return NO_HOLDING;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof TurnHolding, unknown>> | null;
    if (!parsed || typeof parsed !== 'object') return NO_HOLDING;
    const names = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string' && name !== '') : [];
    return {
      held: names(parsed.held),
      begun: names(parsed.begun),
      interrupted: names(parsed.interrupted),
      givenBack: names(parsed.givenBack),
    };
  } catch {
    return NO_HOLDING;
  }
}

/**
 * Writes what the round holds back as the text `readTurnHolding` reads. Empty while it holds nothing,
 * and without the turns given back while there are none, as a version before them wrote it.
 */
export function writeTurnHolding(holding: TurnHolding): string {
  const givenBack = holding.givenBack ?? [];
  if (holding.held.length + holding.begun.length + holding.interrupted.length + givenBack.length < 1) return '';
  return JSON.stringify({
    held: holding.held,
    begun: holding.begun,
    interrupted: holding.interrupted,
    ...(givenBack.length > 0 ? { givenBack } : {}),
  });
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

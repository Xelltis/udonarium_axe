import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';

export type TurnPhase = 'idle' | 'roundStart' | 'acting' | 'roundEnd';

@SyncObject('TurnState')
export class TurnState extends GameObject {
  private static _instance: TurnState;
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
}

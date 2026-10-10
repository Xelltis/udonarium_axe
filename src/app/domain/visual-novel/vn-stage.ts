import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';

export type VnStageTransition = 'none' | 'fade' | 'wipe';

export const VN_STAGE_TRANSITIONS: readonly VnStageTransition[] = ['none', 'fade', 'wipe'];

@SyncObject('vn-stage')
export class VnStage extends GameObject {
  @SyncVar() backgroundImageIdentifier = '';
  @SyncVar() transition: VnStageTransition = 'fade';
  @SyncVar() transitionTrigger = 0;
  @SyncVar() isDirected = false;
  @SyncVar() directorPeerId = '';
  @SyncVar() playheadTabIdentifier = '';
  @SyncVar() playheadIdentifier = '';

  /** Hands control of the visual-novel stage to one peer, so every screen follows what that peer shows. */
  startDirecting(peerId: string): void {
    this.directorPeerId = peerId;
    this.isDirected = true;
  }

  /** Ends directing, releasing the stage and forgetting which line was being shown. */
  stopDirecting(): void {
    this.isDirected = false;
    this.directorPeerId = '';
    this.playheadTabIdentifier = '';
    this.playheadIdentifier = '';
  }

  /** Marks the chat line, and the tab it is in, that the directed stage is showing. */
  setPlayhead(tabIdentifier: string, messageIdentifier: string): void {
    this.playheadTabIdentifier = tabIdentifier;
    this.playheadIdentifier = messageIdentifier;
  }

  /** Changes the stage background for everyone, playing the given transition, or the current one, as it changes. */
  setBackground(imageIdentifier: string, transition: VnStageTransition = this.transition): void {
    this.transition = transition;
    this.backgroundImageIdentifier = imageIdentifier;
    this.transitionTrigger = this.transitionTrigger + 1;
  }

  /** Removes the stage background for everyone, with the current transition. */
  clearBackground(): void {
    this.setBackground('');
  }

  /**
   * Plays a transition on every screen without changing the background.
   *
   * Each call bumps a synced counter, so the same transition can be played again.
   */
  playTransition(transition: VnStageTransition = this.transition): void {
    this.transition = transition;
    this.transitionTrigger = this.transitionTrigger + 1;
  }
}

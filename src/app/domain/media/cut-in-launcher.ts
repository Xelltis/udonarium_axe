import { emitSoundOnlyCutIn, emitStartCutIn, emitStopCutIn, emitStopCutInByBgm } from '@axe/core/event/domain-events';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutIn } from '@axe/domain/media/cut-in';

@SyncObject('cut-in-launcher')
export class CutInLauncher extends GameObject {
  @SyncVar() launchCutInIdentifier: string = '';
  @SyncVar() launchTimeStamp: number = 0;
  @SyncVar() launchMySelf = false;
  @SyncVar() launchIsStart: boolean = false;
  @SyncVar() stopBlankTagCutInTimeStamp: number = 0;
  @SyncVar() sendTo: string = '';
  @SyncVar() soundOnlyCutInIdentifier: string = '';
  @SyncVar() soundOnlyTimeStamp: number = 0;

  reloadDummy = 5;
  private isInitialSync = true;

  // The chat trigger and the uploaded music have moved to the cut-in service.
  // This class keeps to the synchronised record of starting, stopping and sound-only launches.

  /**
   * Plays only the sound of a cut-in, here at once and on the other peers as the change arrives.
   *
   * With `sendTo`, the other peers leave it to the one user whose id it names.
   */
  startSoundOnlyCutIn(cutIn: CutIn, sendTo?: string) {
    this.soundOnlyCutInIdentifier = cutIn.identifier;
    this.soundOnlyTimeStamp = this.soundOnlyTimeStamp + 1;

    if (sendTo) {
      this.sendTo = sendTo;
    } else {
      this.sendTo = '';
    }

    this.startSelfSoundOnly();
  }

  /** Shows a cut-in on this peer alone. The launch is still shared, but other peers do not act on it. */
  startCutInMySelf(cutIn: CutIn) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = true;
    this.launchTimeStamp = this.launchTimeStamp + 1;
    this.launchMySelf = true;
    this.sendTo = '';
    this.startSelfCutIn();
  }

  /**
   * Shows a cut-in here at once and on the other peers as the change arrives.
   *
   * With `sendTo`, the other peers leave it to the one user whose id it names.
   */
  startCutIn(cutIn: CutIn, sendTo?: string) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = true;
    this.launchTimeStamp = this.launchTimeStamp + 1;
    this.launchMySelf = false;

    if (sendTo) {
      this.sendTo = sendTo;
    } else {
      this.sendTo = '';
    }

    this.startSelfCutIn();
  }

  /**
   * Stops a cut-in here at once and on the other peers as the change arrives.
   *
   * The recipient is left as the last launch set it, so a stop following a start sent to one
   * user reaches that user alone.
   */
  stopCutIn(cutIn: CutIn) {
    this.launchCutInIdentifier = cutIn.identifier;
    this.launchIsStart = false;
    this.launchTimeStamp = this.launchTimeStamp + 1;
    this.launchMySelf = false;

    this.stopSelfCutIn();
  }

  /**
   * Closes every untagged cut-in that carries a sound, here at once and on the other peers as the
   * change arrives, so a new track from the jukebox does not play over it.
   *
   * The stop reaches the other peers even while the last launch is one a user started for themselves
   * alone, since that holds back only the launch it belongs to.
   */
  stopBlankTagCutIn() {
    this.stopBlankTagCutInTimeStamp = this.stopBlankTagCutInTimeStamp + 1;
    emitStopCutInByBgm();
  }

  /** The other cut-ins in the room that share this cut-in's tag. */
  sameTagCutIn(cutIn: CutIn): CutIn[] {
    const cutIns = this.getCutIns();
    const tagName = cutIn.tagName;
    const sameTagCutIn: CutIn[] = [];
    for (const cutIn_ of cutIns) {
      if (cutIn_.tagName == tagName && cutIn_.identifier !== cutIn.identifier) {
        sameTagCutIn.push(cutIn_);
      }
    }
    return sameTagCutIn;
  }

  /** Shows the last launched cut-in on this peer only, by raising the start event. Nothing is shared. */
  startSelfCutIn() {
    const cutIn_ = ObjectStore.instance.get(this.launchCutInIdentifier);
    emitStartCutIn({ cutIn: cutIn_ });
  }

  /** Plays the sound of the last sound-only launch on this peer only, by raising its event. Nothing is shared. */
  startSelfSoundOnly() {
    const cutIn_ = ObjectStore.instance.get(this.soundOnlyCutInIdentifier);
    emitSoundOnlyCutIn({ cutIn: cutIn_ });
  }

  /** Stops the last launched cut-in on this peer only, by raising the stop event. Nothing is shared. */
  stopSelfCutIn() {
    const cutIn_ = ObjectStore.instance.get(this.launchCutInIdentifier);
    emitStopCutIn({ cutIn: cutIn_ });
  }

  /** Stops the given cut-in on this peer only, by raising the stop event. Nothing is shared. */
  stopSelfCutInByIdentifier(identifier: string) {
    const cutIn_ = ObjectStore.instance.get(identifier);
    emitStopCutIn({ cutIn: cutIn_ });
  }

  /** Every cut-in in the room. */
  getCutIns(): CutIn[] {
    return ObjectStore.instance.getObjects(CutIn);
  }

  /**
   * Takes in an update from another peer and plays out the launch it carries.
   *
   * The first update, which brings the state as it already stood, is ignored so that joining a
   * room replays nothing. A launch meant for its sender alone, or sent to another user, is
   * ignored as well.
   */
  override apply(context: ObjectContext) {
    const launchCutInIdentifier = this.launchCutInIdentifier;
    const launchIsStart = this.launchIsStart;
    const launchTimeStamp = this.launchTimeStamp;
    const stopBlankTagCutInTimeStamp = this.stopBlankTagCutInTimeStamp;
    const soundOnlyTimeStamp = this.soundOnlyTimeStamp;
    super.apply(context);

    if (this.isInitialSync) {
      this.isInitialSync = false;
      return;
    }

    if (stopBlankTagCutInTimeStamp !== this.stopBlankTagCutInTimeStamp) {
      emitStopCutInByBgm();
    }

    if (this.sendTo != '' && this.sendTo != getPeerContext().userId) {
      return;
    }

    const launchChanged =
      launchCutInIdentifier !== this.launchCutInIdentifier ||
      launchIsStart !== this.launchIsStart ||
      launchTimeStamp !== this.launchTimeStamp;
    // Only a launch marks itself as the sender's alone; the flag stays set until the next launch,
    // so the music stops and sound-only cut-ins after it still reach everyone.
    if (launchChanged && !this.launchMySelf) {
      if (this.launchIsStart) {
        this.startSelfCutIn();
      } else {
        this.stopSelfCutIn();
      }
    }

    if (soundOnlyTimeStamp !== this.soundOnlyTimeStamp) {
      this.startSelfSoundOnly();
    }
  }
}

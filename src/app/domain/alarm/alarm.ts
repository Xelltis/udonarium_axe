import { emitAlarmPop, emitAlarmTimeUp } from '@axe/core/event/domain-events';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { PresetSound } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

@SyncObject('Alarm')
export class Alarm extends GameObject {
  @SyncVar() initTimeStamp = 0;
  @SyncVar() alarmTitle = '';
  @SyncVar() targetPeerId: string[] = [];
  @SyncVar() alarmTime = 0;
  @SyncVar() alarmId = 0;
  @SyncVar() alarmPeerId = '';
  @SyncVar() targetText = '';

  @SyncVar() isSound = false;
  @SyncVar() isPopUp = false;

  /** The cursor of the peer running this tab, which is who the alarm is checked against. */
  get myPeer(): PeerCursor {
    return PeerCursor.myCursor;
  }

  /**
   * Sets the alarm up for a new countdown, writing every field that the room shares.
   *
   * The time stamp is taken afresh, and that change is what makes every other peer start its
   * own countdown when the update arrives. The peer that sets it has to call `startAlarm()`
   * itself: its own update comes back to it, but the synchronizer does not apply a peer's own
   * update, so `apply()` never runs there.
   */
  makeAlarm(
    alarmTime: number,
    alarmTitle: string,
    targetPeerId: string[],
    alarmPeerId: string,
    targetText: string,
    isSound: boolean,
    isPopUp: boolean
  ) {
    this.alarmTitle = alarmTitle;
    this.alarmTime = alarmTime;
    this.alarmId++;
    this.alarmPeerId = alarmPeerId;
    this.targetPeerId = targetPeerId;
    this.targetText = targetText;
    this.initTimeStamp = Date.now();
    this.isSound = isSound;
    this.isPopUp = isPopUp;
  }

  /** Whether this peer is among the alarm's targets. False before this peer has a cursor. */
  chkToMe(): boolean {
    if (!PeerCursor.myCursor) return false;
    for (const target of this.targetPeerId) {
      if (PeerCursor.myCursor.peerId == target) return true;
    }
    return false;
  }

  /**
   * Starts the countdown on this peer, doing nothing when this peer is not a target.
   *
   * When the time is up it posts the time-up message and plays the alarm sound if sound was
   * asked for, and raises the pop-up if that was asked for. The timer cannot be cancelled.
   */
  startAlarm() {
    if (this.chkToMe()) {
      setTimeout(() => {
        if (this.isSound) {
          const text_ = `アラーム(${this.alarmTime}秒)経過${this.targetText}${this.alarmTitle}`;
          emitAlarmTimeUp({ text: text_ });
          const audio = AudioStorage.instance.get(PresetSound.alarm);
          if (audio) AudioPlayer.play(audio, 0.5);
        }
        if (this.isPopUp) {
          emitAlarmPop({ title: this.alarmTitle, time: this.alarmTime });
        }
      }, this.alarmTime * 1000);
    }
  }

  /** Takes in an update from another peer, and starts the countdown when it carries a new time stamp. */
  override apply(context: ObjectContext) {
    const initTimeStamp = this.initTimeStamp;
    super.apply(context);

    if (initTimeStamp !== this.initTimeStamp) {
      this.startAlarm();
    }
  }
}

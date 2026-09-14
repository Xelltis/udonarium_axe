import { callSoundEffect, sendMessage$, soundEffect$ } from '@axe/core/event/domain-events';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { SyncObject } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';

export class PresetSound {
  static dicePick: string = '';
  static dicePut: string = '';
  static diceRoll1: string = '';
  static diceRoll2: string = '';
  static coinFlip: string = '';
  static damageSmall: string = '';
  static damageMedium: string = '';
  static damageLarge: string = '';
  static healSmall: string = '';
  static healMedium: string = '';
  static healLarge: string = '';
  static mechDamageSmall: string = '';
  static mechDamageMedium: string = '';
  static mechDamageLarge: string = '';
  static mechHealSmall: string = '';
  static mechHealMedium: string = '';
  static mechHealLarge: string = '';
  static cardDraw: string = '';
  static cardPick: string = '';
  static cardPut: string = '';
  static cardShuffle: string = '';
  static piecePick: string = '';
  static piecePut: string = '';
  static blockPick: string = '';
  static blockPut: string = '';
  static lock: string = '';
  static unlock: string = '';
  static sweep: string = '';
  static alarm: string = '';
  static chatPageTurnLong: string = '';
  static chatPageTurnShort: string = '';
  static chatBubble: string = '';
  static chatCyber: string = '';
  static chatNotify1: string = '';
  static chatNotify2: string = '';

  // For the effects on the map.
  static fireSmall: string = '';
  static fireMedium: string = '';
  static fireLarge: string = '';
  static explosionSmall: string = '';
  static explosionLarge: string = '';
  static explosionHuge: string = '';
  static iceSmall: string = '';
  static iceMedium: string = '';
  static iceLarge: string = '';
  static thunderSmall: string = '';
  static thunderBolt: string = '';
  static thunderLarge: string = '';
  static windSmall: string = '';
  static windLarge: string = '';
  static earthUpheaval: string = '';
  static rockBreak: string = '';
  static stoneHit: string = '';
  static cureSmall: string = '';
  static cureMedium: string = '';
  static cureLarge: string = '';
  static poison: string = '';
  static buff: string = '';
  static holy: string = '';
  static dark: string = '';
  static charge: string = '';
  static slashSmall: string = '';
  static slashCombo: string = '';
  static slashLarge: string = '';
  static bowRelease: string = '';
  static bowPierce: string = '';
  static gunHandgun: string = '';
  static gunRifle: string = '';
  static breathFire: string = '';
  static breathIce: string = '';
  static breathPoison: string = '';
  static barrier: string = '';
  static reflect: string = '';
  static drain: string = '';
  static warp: string = '';
  static summon: string = '';
  static gravity: string = '';
  static gravityLarge: string = '';
  static cleanse: string = '';
  static qigong: string = '';
  static superArts: string = '';
  static gunSmg: string = '';
  static gunMachinegun: string = '';
  static slashIai: string = '';
  static slashCharged: string = '';
  static breathWind: string = '';
  static bashSmall: string = '';
  static bashMedium: string = '';
  static bashLarge: string = '';
  static bashFinish: string = '';
  static statusSleep: string = '';
  static statusBind: string = '';
  static statusCurse: string = '';
  static statusPetrify: string = '';
  static statusCure: string = '';
  static beamSmall: string = '';
  static collapse: string = '';
  static sfShot: string = '';
  static sfHit: string = '';
  static sfBeam: string = '';
  static holyBlade: string = '';
  static missileLaunch: string = '';
  static rocketLaunch: string = '';
  static flashImpact: string = '';
}

@SyncObject('sound-effect')
export class SoundEffect extends GameObject {
  private cleanups: (() => void)[] = [];

  // GameObject Lifecycle
  /**
   * Starts listening: a sound sent over the network is played at half volume, and a dice roll
   * this peer sends through the dice bot plays one of the two rolling sounds.
   */
  override onStoreAdded() {
    super.onStoreAdded();
    this.cleanups.push(
      soundEffect$.subscribe((identifier) => {
        const audio = AudioStorage.instance.get(identifier);
        if (audio) AudioPlayer.play(audio, 0.5);
      })
    );
    this.cleanups.push(
      sendMessage$.subscribe((data) => {
        const chatMessage = ObjectStore.instance.get<ChatMessage>(data.messageIdentifier);
        if (!chatMessage || !chatMessage.isSendFromSelf || !chatMessage.isDicebot) return;
        if (Math.random() < 0.5) {
          SoundEffect.play(PresetSound.diceRoll1);
        } else {
          SoundEffect.play(PresetSound.diceRoll2);
        }
      })
    );
  }

  // GameObject Lifecycle
  /** Stops listening for sounds and dice rolls. */
  override onStoreRemoved() {
    super.onStoreRemoved();
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  /** Plays a sound for the whole room, the same as the static `play`. */
  play(arg: string | AudioFile): void {
    SoundEffect.play(arg);
  }

  /**
   * Sends a sound to the whole room, and every peer plays it at half volume.
   *
   * This peer plays it too, because the network hands each broadcast back to the peer that sent it.
   * A peer that does not hold the audio file plays nothing.
   */
  static play(arg: string | AudioFile): void {
    const identifier = typeof arg === 'string' ? arg : arg.identifier;
    SoundEffect._play(identifier);
  }

  /** Plays a sound on this peer alone, at half volume. Nothing happens for an empty identifier or a missing file. */
  static playLocal(arg: string | AudioFile): void {
    const identifier = typeof arg === 'string' ? arg : arg.identifier;
    if (identifier.length < 1) return;
    const audio = AudioStorage.instance.get(identifier);
    if (audio) AudioPlayer.play(audio, 0.5);
  }

  private static _play(identifier: string) {
    callSoundEffect(identifier);
  }
}

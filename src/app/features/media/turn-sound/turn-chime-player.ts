import { Injectable } from '@angular/core';
import type { ChimePreset } from '@axe/core/audio/turn-chime';
import { playChime } from '@axe/core/audio/turn-chime';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';

/**
 * Plays a turn's chime on this screen alone, through the channel notices play through, so that the
 * reader's notice volume and mute and the room's volume for notices hold for it as they do for the
 * alarm and the chat's notes.
 */
@Injectable({ providedIn: 'root' })
export class TurnChimePlayer {
  play(preset: ChimePreset): void {
    playChime(AudioPlayer.audioContext, preset, AudioPlayer.channelInput(VolumeType.NOTIFICATION));
  }
}

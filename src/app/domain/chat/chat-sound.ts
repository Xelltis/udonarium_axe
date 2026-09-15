import { PresetSound } from '@axe/domain/media/sound-effect';

export const CHAT_SOUND_TYPES = ['pageTurn', 'bubble', 'cyber', 'notify1', 'notify2'] as const;

export type ChatSoundType = (typeof CHAT_SOUND_TYPES)[number];

export const DEFAULT_CHAT_SOUND_TYPE: ChatSoundType = 'notify1';

export const CHAT_SOUND_VOLUME_DEFAULT = 0.5;

/** Where a line stops counting as a remark and starts counting as a passage. */
export const LONG_CHAT_LENGTH = 30;

export interface ChatSoundSetting {
  enabled: boolean;
  volume: number;
  type: ChatSoundType;
}

export const DEFAULT_CHAT_SOUND: ChatSoundSetting = {
  enabled: false,
  volume: CHAT_SOUND_VOLUME_DEFAULT,
  type: DEFAULT_CHAT_SOUND_TYPE,
};

/** Whether a stored value names a known chat notification sound. */
export function isChatSoundType(value: unknown): value is ChatSoundType {
  return typeof value === 'string' && (CHAT_SOUND_TYPES as readonly string[]).includes(value);
}

/** A stored volume held between 0 and 1, or the default for anything that is not a number. */
export function clampChatSoundVolume(value: unknown): number {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return CHAT_SOUND_VOLUME_DEFAULT;
  return Math.min(1, Math.max(0, volume));
}

/** Turning a page takes longer for a passage than for a word, so the two are told apart by length. */
export function chatSoundOf(type: ChatSoundType, text: string): string {
  switch (type) {
    case 'pageTurn':
      return text.length >= LONG_CHAT_LENGTH ? PresetSound.chatPageTurnLong : PresetSound.chatPageTurnShort;
    case 'bubble':
      return PresetSound.chatBubble;
    case 'cyber':
      return PresetSound.chatCyber;
    case 'notify1':
      return PresetSound.chatNotify1;
    case 'notify2':
      return PresetSound.chatNotify2;
  }
}

import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import {
  CHAT_SOUND_TYPES,
  chatSoundOf,
  clampChatSoundVolume,
  isChatSoundType,
  LONG_CHAT_LENGTH,
  playChatSound,
} from '@axe/domain/chat/chat-sound';
import { PresetSound } from '@axe/domain/media/sound-effect';

describe('chatSoundOf()', () => {
  beforeEach(() => {
    PresetSound.chatPageTurnLong = 'long';
    PresetSound.chatPageTurnShort = 'short';
    PresetSound.chatBubble = 'bubble';
    PresetSound.chatCyber = 'cyber';
    PresetSound.chatNotify1 = 'notify1';
    PresetSound.chatNotify2 = 'notify2';
  });

  it('turns a whole page for a passage and a corner for a remark', () => {
    expect(chatSoundOf('pageTurn', 'あ'.repeat(LONG_CHAT_LENGTH))).toBe('long');
    expect(chatSoundOf('pageTurn', 'あ'.repeat(LONG_CHAT_LENGTH - 1))).toBe('short');
  });

  it('sounds the same whatever is said, for the rest', () => {
    expect(chatSoundOf('bubble', 'あ'.repeat(200))).toBe('bubble');
    expect(chatSoundOf('cyber', '')).toBe('cyber');
    expect(chatSoundOf('notify1', '')).toBe('notify1');
    expect(chatSoundOf('notify2', '')).toBe('notify2');
  });

  it('has a sound for every type it offers', () => {
    for (const type of CHAT_SOUND_TYPES) expect(chatSoundOf(type, '')).not.toBe('');
  });
});

describe('what comes back from storage', () => {
  it('takes only a type it knows', () => {
    expect(isChatSoundType('bubble')).toBe(true);
    expect(isChatSoundType('trumpet')).toBe(false);
    expect(isChatSoundType(3)).toBe(false);
  });

  it('holds the volume between silence and full', () => {
    expect(clampChatSoundVolume(0.4)).toBe(0.4);
    expect(clampChatSoundVolume(-1)).toBe(0);
    expect(clampChatSoundVolume(9)).toBe(1);
    expect(clampChatSoundVolume('loud')).toBe(0.5);
  });
});

describe('playChatSound()', () => {
  beforeEach(() => {
    PresetSound.chatBubble = 'bubble';
    vi.spyOn(AudioStorage.instance, 'get').mockImplementation(
      (identifier: string) => ({ identifier }) as unknown as AudioFile
    );
  });

  afterEach(() => {
    PresetSound.chatBubble = '';
    vi.restoreAllMocks();
  });

  it('plays the note through the notification channel at the volume asked', () => {
    const play = vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});

    playChatSound('bubble', '', 0.4);

    expect(play).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'bubble' }), 0.4, VolumeType.NOTIFICATION);
  });

  it('plays nothing at no volume', () => {
    const play = vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});

    playChatSound('bubble', '', 0);

    expect(play).not.toHaveBeenCalled();
  });
});

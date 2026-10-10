import { TestBed } from '@angular/core/testing';
import { emitSendMessage, soundEffect$ } from '@axe/core/event/domain-events';
import { IPeerContext } from '@axe/core/network/peer-context';
import { resetPeerContextProvider, setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';

describe('PresetSound', () => {
  it('starts with no sound for picking a die up', () => {
    expect(PresetSound.dicePick).toBe('');
  });

  it('starts with none for putting one down', () => {
    expect(PresetSound.dicePut).toBe('');
  });

  it('starts with none for the first roll', () => {
    expect(PresetSound.diceRoll1).toBe('');
  });

  it('starts with none for the second', () => {
    expect(PresetSound.diceRoll2).toBe('');
  });

  it('starts with none for drawing a card', () => {
    expect(PresetSound.cardDraw).toBe('');
  });

  it('starts with none for shuffling', () => {
    expect(PresetSound.cardShuffle).toBe('');
  });

  it('starts with none for the alarm', () => {
    expect(PresetSound.alarm).toBe('');
  });
});

describe('SoundEffect', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  describe('creating one', () => {
    it('can be created', () => {
      const se = new SoundEffect();
      se.initialize();
      expect(se).toBeTruthy();
    });
  });

  describe('static play()', () => {
    it('takes a string', () => {
      // calls through without throwing
      SoundEffect.play('test-identifier');
    });
  });

  describe('instance play()', () => {
    it('takes a string', () => {
      const se = new SoundEffect();
      se.initialize();
      se.play('test-identifier');
    });
  });

  describe('playing a dice sound on a message', () => {
    const selfUserId = 'self-user';

    beforeEach(() => {
      setPeerContextProvider({
        peerContext: { userId: selfUserId } as unknown as IPeerContext,
        peerContexts: [],
        peerIds: [],
        peerId: selfUserId,
      });
    });

    afterEach(() => {
      resetPeerContextProvider();
    });

    it('plays for a dice bot message', async () => {
      const se = new SoundEffect('test-se');
      se.initialize();
      store.add(se);

      const playSpy = vi.spyOn(SoundEffect, 'play').mockImplementation(() => {});

      const msg = new ChatMessage();
      msg.setAttribute('tag', 'system');
      msg.setAttribute('from', 'System-BCDice');
      msg.setAttribute('originFrom', selfUserId);
      msg.initialize();
      store.add(msg);

      emitSendMessage({ messageIdentifier: msg.identifier, messageTarget: null });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(playSpy).toHaveBeenCalledTimes(1);
      const calledWith = playSpy.mock.calls[0][0] as unknown as string;
      expect(calledWith === PresetSound.diceRoll1 || calledWith === PresetSound.diceRoll2).toBe(true);

      playSpy.mockRestore();
    });

    it('plays for nothing else', async () => {
      const se = new SoundEffect('test-se-2');
      se.initialize();
      store.add(se);

      const playSpy = vi.spyOn(SoundEffect, 'play').mockImplementation(() => {});

      const msg = new ChatMessage();
      msg.setAttribute('tag', '');
      msg.setAttribute('from', selfUserId);
      msg.initialize();
      store.add(msg);

      emitSendMessage({ messageIdentifier: msg.identifier, messageTarget: null });

      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(playSpy).not.toHaveBeenCalled();

      playSpy.mockRestore();
    });
  });
});

describe('which channel a sound plays through', () => {
  const presets = PresetSound as unknown as Record<string, string>;
  const named: Record<string, string> = {
    diceRoll1: 'dice-roll',
    cardShuffle: 'card-shuffle',
    sweep: 'sweep',
    alarm: 'alarm',
    chatNotify1: 'chat-notify',
    fireSmall: 'fire-small',
    damageLarge: 'damage-large',
  };

  function addAudio(identifier: string): AudioFile {
    const audio = AudioFile.createEmpty(identifier);
    const context = (audio as unknown as { context: Record<string, unknown> }).context;
    context['blob'] = new Blob(['x']);
    context['url'] = `blob:${identifier}`;
    AudioStorage.instance.add(audio);
    return audio;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    for (const [key, identifier] of Object.entries(named)) presets[key] = identifier;
  });

  afterEach(() => {
    for (const key of Object.keys(named)) presets[key] = '';
    AudioStorage.instance.audios.forEach((audio) => AudioStorage.instance.delete(audio.identifier));
    vi.restoreAllMocks();
  });

  it('sends the built-in sounds of handling things to the handling channel', () => {
    expect(SoundEffect.kindOf('dice-roll')).toBe(VolumeType.HANDLING);
    expect(SoundEffect.kindOf('card-shuffle')).toBe(VolumeType.HANDLING);
    expect(SoundEffect.kindOf('sweep')).toBe(VolumeType.HANDLING);
  });

  it('sends the alarm and the chat notifications to the notification channel', () => {
    expect(SoundEffect.kindOf('alarm')).toBe(VolumeType.NOTIFICATION);
    expect(SoundEffect.kindOf('chat-notify')).toBe(VolumeType.NOTIFICATION);
  });

  it('sends the sounds of effects and of values going up or down to the effects channel', () => {
    expect(SoundEffect.kindOf('fire-small')).toBe(VolumeType.EFFECT);
    expect(SoundEffect.kindOf('damage-large')).toBe(VolumeType.EFFECT);
  });

  it('leaves a sound somebody added, or none at all, on the sound-effect channel', () => {
    expect(SoundEffect.kindOf('uploaded-by-someone')).toBe(VolumeType.SE);
    expect(SoundEffect.kindOf('')).toBe(VolumeType.SE);
  });

  it('plays a sound that arrives from the room through the channel of its kind', () => {
    const play = vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});
    const dice = addAudio('dice-roll');
    const uploaded = addAudio('uploaded');
    new SoundEffect('SoundEffect').initialize();

    soundEffect$.emit('dice-roll');
    soundEffect$.emit('uploaded');

    expect(play).toHaveBeenCalledWith(dice, 0.5, VolumeType.HANDLING);
    expect(play).toHaveBeenCalledWith(uploaded, 0.5, VolumeType.SE);
  });

  it('plays a sound on this peer alone through the kind given, or else the kind it is', () => {
    const play = vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});
    const uploaded = addAudio('uploaded');
    const fire = addAudio('fire-small');

    SoundEffect.playLocal('uploaded', VolumeType.EFFECT);
    SoundEffect.playLocal('fire-small');

    expect(play).toHaveBeenCalledWith(uploaded, 0.5, VolumeType.EFFECT);
    expect(play).toHaveBeenCalledWith(fire, 0.5, VolumeType.EFFECT);
  });
});

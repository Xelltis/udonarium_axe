import { encodeLaunchSpeaker, readLaunchSpeaker, withSpeakerName } from '@axe/domain/media/cut-in-speaker';

describe('who a cut-in is played for', () => {
  const speaker = { characterId: 'hero', imageIdentifier: 'hero-smile', name: 'ヒロ' };

  it('reads back the speaker written for a launch', () => {
    expect(readLaunchSpeaker(encodeLaunchSpeaker(speaker, 7, 'cut-in-1'), 7, 'cut-in-1')).toEqual(speaker);
  });

  it('reads nobody from a speaker left over from another launch, from nothing, or from anything unreadable', () => {
    const held = encodeLaunchSpeaker(speaker, 7, 'cut-in-1');

    expect(readLaunchSpeaker(held, 8, 'cut-in-1')).toBeNull();
    expect(readLaunchSpeaker(held, 7, 'cut-in-2')).toBeNull();
    expect(readLaunchSpeaker('', 7, 'cut-in-1')).toBeNull();
    expect(readLaunchSpeaker('{', 7, 'cut-in-1')).toBeNull();
    expect(encodeLaunchSpeaker(null, 7, 'cut-in-1')).toBe('');
  });

  it('puts the name in for {character}, a stand-in where there is none, and keeps {{character}} as written', () => {
    expect(withSpeakerName('{character}、参戦！', 'ヒロ', '？？？')).toBe('ヒロ、参戦！');
    expect(withSpeakerName('{character}、参戦！', '', '？？？')).toBe('？？？、参戦！');
    expect(withSpeakerName('{{character}} と書く', 'ヒロ', '？？？')).toBe('{character} と書く');
    expect(withSpeakerName('ふつうの文', 'ヒロ', '？？？')).toBe('ふつうの文');
  });
});

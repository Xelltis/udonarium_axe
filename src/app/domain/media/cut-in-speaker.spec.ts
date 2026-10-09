import { encodeLaunchSpeaker, readLaunchSpeaker, withSpeakerName } from '@axe/domain/media/cut-in-speaker';

describe('who a cut-in is played for', () => {
  const speaker = { characterId: 'hero', imageIdentifier: 'hero-smile', name: 'ヒロ' };

  it('reads back the speaker written for a launch', () => {
    expect(readLaunchSpeaker(encodeLaunchSpeaker(speaker, 7, 'cut-in-1'), 7, 'cut-in-1')).toEqual({
      ...speaker,
      fit: null,
    });
  });

  it('reads back how the speaker set their portrait, and no fit from one that cannot be read', () => {
    const fitted = { ...speaker, fit: { scale: 1.8, x: 0.1, y: 0.3 } };
    expect(readLaunchSpeaker(encodeLaunchSpeaker(fitted, 7, 'cut-in-1'), 7, 'cut-in-1')).toEqual(fitted);

    const broken = JSON.stringify({ v: 1, stamp: 7, cutIn: 'cut-in-1', c: 'hero', i: 'hero-smile', n: 'ヒロ', f: [1] });
    expect(readLaunchSpeaker(broken, 7, 'cut-in-1')?.fit).toBeNull();
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

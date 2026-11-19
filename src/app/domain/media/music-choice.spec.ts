import { chooseMusic, moodWords, type MusicCandidate } from '@axe/domain/media/music-choice';

const track = (id: string, ...names: string[]): MusicCandidate => ({ kind: 'track', id, name: names[0], names });
const playlist = (id: string, ...names: string[]): MusicCandidate => ({ kind: 'playlist', id, name: names[0], names });

describe('music-choice', () => {
  it('parts a mood at spaces and commas of either width, in half-width lower case', () => {
    expect(moodWords(' Battle、緊迫　ＢＯＳＳ,  ')).toEqual(['battle', '緊迫', 'boss']);
  });

  it('finds what holds more of the words first, and of as many a playlist before a track', () => {
    const found = chooseMusic(moodWords('戦闘 緊迫'), [
      track('t1', '緊迫の戦闘', 'BGM'),
      playlist('p1', '戦闘曲', '第1話/戦闘'),
      track('t2', '村の朝', 'BGM'),
      track('t3', 'Battle Theme', '戦闘曲'),
    ]);

    expect(found.map((match) => [match.candidate.id, match.matched])).toEqual([
      ['t1', ['戦闘', '緊迫']],
      ['p1', ['戦闘']],
      ['t3', ['戦闘']],
    ]);
  });

  it('finds nothing for words no name holds', () => {
    expect(chooseMusic(['海'], [track('t1', '森', 'BGM')])).toEqual([]);
  });
});

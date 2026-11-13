import {
  REPLAY_NAME_PLATE_DEFAULT,
  REPLAY_RING_DEFAULT,
  replayPlateColor,
  replayRingColor,
} from '@axe/domain/replay/video/replay-speaker-color';

describe('replayPlateColor()', () => {
  it('deepens the speaker’s own colour so white reads on it', () => {
    expect(replayPlateColor('#ff8800')).toBe('rgb(158, 84, 0)');
  });

  it('gives the usual plate for black, which is what most rooms leave the colour at', () => {
    expect(replayPlateColor('#000000')).toBe(REPLAY_NAME_PLATE_DEFAULT);
  });

  it('gives the usual plate for a colour too dark or too pale to tell anyone apart by', () => {
    expect(replayPlateColor('#202020')).toBe(REPLAY_NAME_PLATE_DEFAULT);
    expect(replayPlateColor('#fafafa')).toBe(REPLAY_NAME_PLATE_DEFAULT);
    expect(replayPlateColor('#282828')).toBe('rgb(25, 25, 25)');
  });

  it('gives the usual plate for anything not written in hex', () => {
    expect(replayPlateColor('')).toBe(REPLAY_NAME_PLATE_DEFAULT);
    expect(replayPlateColor('red')).toBe(REPLAY_NAME_PLATE_DEFAULT);
  });
});

describe('replayRingColor()', () => {
  it('rings a speaker in their own colour where it shows', () => {
    expect(replayRingColor('#ff8800')).toBe('#ff8800');
  });

  it('rings a speaker in gold where their colour would not show', () => {
    expect(replayRingColor('#000000')).toBe(REPLAY_RING_DEFAULT);
    expect(replayRingColor('')).toBe(REPLAY_RING_DEFAULT);
  });
});

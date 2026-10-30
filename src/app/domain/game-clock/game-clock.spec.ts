import {
  cleanPeriods,
  dayFractionOf,
  DEFAULT_GAME_CLOCK,
  formatGameClockDay,
  formatGameClockTime,
  type GameClock,
  periodsOf,
  readGameClock,
  stepGameClock,
  withDay,
  writeGameClock,
} from '@axe/domain/game-clock/game-clock';

const PARTS = ['朝', '昼', '夕', '夜'];

function clock(overrides: Partial<GameClock> = {}): GameClock {
  return { ...DEFAULT_GAME_CLOCK, ...overrides };
}

describe('the time the room keeps in its story', () => {
  describe('read from a room', () => {
    it('reads a room that has set none as the morning of the first day', () => {
      expect(readGameClock('')).toEqual(DEFAULT_GAME_CLOCK);
      expect(readGameClock(undefined)).toEqual(DEFAULT_GAME_CLOCK);
      expect(readGameClock('not json')).toEqual(DEFAULT_GAME_CLOCK);
      expect(readGameClock('[1,2]')).toEqual(DEFAULT_GAME_CLOCK);
    });

    it('reads back what it wrote', () => {
      const written = clock({
        day: 12,
        mode: 'hours',
        minutes: 845,
        periods: ['早朝', '朝'],
        step: 30,
        announce: false,
      });

      expect(readGameClock(writeGameClock(written))).toEqual(written);
    });

    it('brings what is out of bounds back inside them', () => {
      const read = readGameClock(JSON.stringify({ day: -3, minutes: 5000, period: 99, step: 7, mode: 'week' }));

      expect(read.day).toBe(1);
      expect(read.minutes).toBe(1439);
      expect(read.period).toBe(11);
      expect(read.step).toBe(60);
      expect(read.mode).toBe('periods');
    });
  });

  it('keeps the names of the parts of a day trimmed, once each, and no more than twelve', () => {
    expect(cleanPeriods([' 朝 ', '', '昼', '朝', '夜'])).toEqual(['朝', '昼', '夜']);
    expect(cleanPeriods(Array.from({ length: 20 }, (_, index) => `${index}`))).toHaveLength(12);
  });

  it('tells the hour by the parts of the language where the room has named none', () => {
    expect(periodsOf(clock(), PARTS)).toEqual(PARTS);
    expect(periodsOf(clock({ periods: ['昼', '夜'] }), PARTS)).toEqual(['昼', '夜']);
  });

  describe('stepping through the parts of a day', () => {
    it('moves on a part, and into the next day past the last', () => {
      expect(stepGameClock(clock({ period: 1 }), 1, 4)).toMatchObject({ day: 1, period: 2 });
      expect(stepGameClock(clock({ day: 2, period: 3 }), 1, 4)).toMatchObject({ day: 3, period: 0 });
    });

    it('moves back a part, and into the day before past the first, but never before the first day', () => {
      expect(stepGameClock(clock({ day: 2, period: 0 }), -1, 4)).toMatchObject({ day: 1, period: 3 });
      expect(stepGameClock(clock({ day: 1, period: 0 }), -1, 4)).toMatchObject({ day: 1, period: 0 });
    });

    it('takes up a part beyond the last there now as the last', () => {
      expect(stepGameClock(clock({ period: 6 }), 1, 4)).toMatchObject({ day: 2, period: 0 });
    });
  });

  describe('stepping a clock of 24 hours', () => {
    it('moves on by its step, and into the next day past midnight', () => {
      expect(stepGameClock(clock({ mode: 'hours', minutes: 600, step: 30 }), 1, 4)).toMatchObject({
        day: 1,
        minutes: 630,
      });
      expect(stepGameClock(clock({ mode: 'hours', day: 1, minutes: 1410, step: 60 }), 1, 4)).toMatchObject({
        day: 2,
        minutes: 30,
      });
    });

    it('moves back into the day before past midnight, and stops at the start of the first day', () => {
      expect(stepGameClock(clock({ mode: 'hours', day: 3, minutes: 20, step: 60 }), -1, 4)).toMatchObject({
        day: 2,
        minutes: 1400,
      });
      expect(stepGameClock(clock({ mode: 'hours', day: 1, minutes: 20, step: 60 }), -1, 4)).toMatchObject({
        day: 1,
        minutes: 0,
      });
    });
  });

  it('goes to another day with the hour as it was', () => {
    expect(withDay(clock({ period: 2 }), 7)).toMatchObject({ day: 7, period: 2 });
    expect(withDay(clock({ day: 4 }), 0).day).toBe(1);
  });

  describe('written out', () => {
    it('writes the day in the format the room set, else the language’s own', () => {
      expect(formatGameClockDay(clock({ day: 3 }), '{n}日目')).toBe('3日目');
      expect(formatGameClockDay(clock({ day: 3, dayFormat: 'Day {n}' }), '{n}日目')).toBe('Day 3');
      expect(formatGameClockDay(clock({ day: 3, dayFormat: '日' }), '{n}日目')).toBe('3日目');
    });

    it('writes the part of the day, or the time on the clock', () => {
      expect(formatGameClockTime(clock({ period: 3 }), PARTS)).toBe('夜');
      expect(formatGameClockTime(clock({ mode: 'hours', minutes: 545 }), PARTS)).toBe('09:05');
    });
  });

  describe('stepping past the last day', () => {
    it('stops at the end of the last day rather than going back to the start of it', () => {
      const late = clock({ mode: 'hours', day: 99999, minutes: 23 * 60, step: 60 });
      expect(stepGameClock(late, 1, PARTS.length)).toEqual({ ...late, minutes: 24 * 60 - 1 });
      const night = clock({ day: 99999, period: 3 });
      expect(stepGameClock(night, 1, PARTS.length)).toEqual(night);
    });
  });

  describe('dayFractionOf', () => {
    it('reads the time on a clock of 24 hours as the share of the day gone', () => {
      expect(dayFractionOf(clock({ mode: 'hours', minutes: 0 }), 4)).toBe(0);
      expect(dayFractionOf(clock({ mode: 'hours', minutes: 18 * 60 }), 4)).toBe(0.75);
    });

    it('lays the parts of the day evenly from dawn, morning at six, noon at twelve and night at midnight', () => {
      expect([0, 1, 2, 3].map((period) => dayFractionOf(clock({ period }), PARTS.length))).toEqual([
        0.25, 0.5, 0.75, 0,
      ]);
      expect(dayFractionOf(clock({ period: 9 }), PARTS.length)).toBe(0);
    });
  });
});

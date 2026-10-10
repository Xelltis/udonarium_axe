import {
  COMPASS_POINTS,
  compassPointOf,
  nearestTurnTo,
  northNeedleAngle,
  screenBearingOf,
  swingNeedle,
} from '@axe/domain/ui/compass';

describe('reading the table as a compass', () => {
  describe('which way the screen looks', () => {
    it('looks north up a table that has not been turned', () => {
      expect(screenBearingOf(0)).toBe(0);
    });

    it('reads the turn backwards, the table having carried its north round', () => {
      expect(screenBearingOf(90)).toBe(270);
      expect(screenBearingOf(-90)).toBe(90);
    });

    it('answers within one turn however many times the table has been round', () => {
      expect(screenBearingOf(730)).toBe(350);
      expect(screenBearingOf(-730)).toBe(10);
    });
  });

  describe('where the rose is drawn', () => {
    it('sits where the table put it', () => {
      expect(northNeedleAngle(0)).toBe(0);
      expect(northNeedleAngle(90)).toBe(90);
    });

    it('comes back round rather than counting on past a turn', () => {
      expect(northNeedleAngle(-90)).toBe(270);
      expect(northNeedleAngle(450)).toBe(90);
    });

    it('stands opposite the way the screen looks, bar the one they share', () => {
      for (const turn of [0, 10, 45, 123, 270, -37]) {
        expect((northNeedleAngle(turn) + screenBearingOf(turn)) % 360).toBe(0);
      }
    });
  });

  describe('writing an angle so as to lie nearest the last one', () => {
    it('crosses north the short way rather than round the other side', () => {
      expect(nearestTurnTo(355, 5)).toBe(-5);
      expect(nearestTurnTo(5, 355)).toBe(365);
    });

    it('leaves an angle that is already the nearest one alone', () => {
      expect(nearestTurnTo(90, 80)).toBe(90);
      expect(nearestTurnTo(10, 10)).toBe(10);
    });

    it('never asks for more than half a turn', () => {
      for (const bearing of [0, 37, 179, 181, 270, 359]) {
        for (const drawn of [-730, -5, 0, 12, 355, 1080]) {
          expect(Math.abs(nearestTurnTo(bearing, drawn) - drawn)).toBeLessThanOrEqual(180);
        }
      }
    });

    it('still points where it was asked to point', () => {
      for (const bearing of [0, 37, 179, 270, 359]) {
        for (const drawn of [-730, -5, 12, 1080]) {
          expect((((nearestTurnTo(bearing, drawn) % 360) + 360) % 360).toFixed(6)).toBe(bearing.toFixed(6));
        }
      }
    });
  });

  describe('naming a bearing', () => {
    it('names each of the eight points at its own bearing', () => {
      expect(COMPASS_POINTS.map((_, at) => compassPointOf(at * 45))).toEqual([...COMPASS_POINTS]);
    });

    it('gives each point the forty-five degrees around it', () => {
      expect(compassPointOf(22)).toBe('n');
      expect(compassPointOf(23)).toBe('ne');
      expect(compassPointOf(337)).toBe('nw');
      expect(compassPointOf(338)).toBe('n');
    });

    it('reads north again rather than a ninth point at the far end', () => {
      expect(compassPointOf(359)).toBe('n');
      expect(compassPointOf(360)).toBe('n');
      expect(compassPointOf(-1)).toBe('n');
    });
  });
});

describe('a needle under a magnetic anomaly', () => {
  it('turns by however fast it is going', () => {
    expect(swingNeedle({ angle: 100, rate: 0 }, 0.1, 0).angle).toBe(100);
    expect(swingNeedle({ angle: 100, rate: 200 }, 0.1, 0).angle).toBeCloseTo(117.8, 1);
  });

  it('is shoved into turning by a pull, either way round', () => {
    expect(swingNeedle({ angle: 0, rate: 0 }, 0.1, 1).rate).toBeGreaterThan(0);
    expect(swingNeedle({ angle: 0, rate: 0 }, 0.1, -1).rate).toBeLessThan(0);
  });

  it('loses what it was given once the pull lets up, rather than sweeping on forever', () => {
    let swing = { angle: 0, rate: 600 };
    for (let tick = 0; tick < 40; tick++) swing = swingNeedle(swing, 0.1, 0);

    expect(Math.abs(swing.rate)).toBeLessThan(6);
  });

  it('never turns faster than two turns a second, however hard it is pulled', () => {
    let swing = { angle: 0, rate: 0 };
    for (let tick = 0; tick < 200; tick++) swing = swingNeedle(swing, 0.1, 1);

    expect(swing.rate).toBeLessThanOrEqual(720);
  });

  it('does the same thing twice, the pull being handed to it rather than found', () => {
    const from = { angle: 37, rate: -120 };

    expect(swingNeedle(from, 0.06, 0.4)).toEqual(swingNeedle(from, 0.06, 0.4));
  });
});

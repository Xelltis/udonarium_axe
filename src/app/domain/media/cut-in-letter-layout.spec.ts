import { type CutInTextSetting, layoutCutInText } from '@axe/domain/media/cut-in-letter-layout';

/** Every character is ten units wide, so widths read as character counts. */
const tenEach = (text: string) => [...text].length * 10;

const box = { left: 100, top: 200, width: 400, height: 100 };

function setting(partial: Partial<CutInTextSetting> = {}): CutInTextSetting {
  return { fontSizePx: 20, lineHeight: 1.5, letterSpacingPx: 0, vertical: false, textAlign: 'center', ...partial };
}

describe('layoutCutInText()', () => {
  describe('set a line at a time', () => {
    it('centres the lines in the box, each at the middle of its line', () => {
      const { align, runs } = layoutCutInText('一\n二', box, setting(), false, tenEach);

      expect(align).toBe('center');
      // Two lines of 30 fill 60 of the 100: the block starts 20 down, the first line's middle 15 into it.
      expect(runs).toEqual([
        { text: '一', rank: 0, x: 300, y: 235 },
        { text: '二', rank: 1, x: 300, y: 265 },
      ]);
    });

    it('sets the lines against the edge they are aligned to', () => {
      expect(layoutCutInText('あ', box, setting({ textAlign: 'left' }), false, tenEach)).toMatchObject({
        align: 'left',
        runs: [{ x: 100 }],
      });
      expect(layoutCutInText('あ', box, setting({ textAlign: 'right' }), false, tenEach)).toMatchObject({
        align: 'right',
        runs: [{ x: 500 }],
      });
    });

    it('never sets the lines closer than four tenths of the font size', () => {
      const { runs } = layoutCutInText('一\n二', box, setting({ lineHeight: 0.1 }), false, tenEach);

      expect(runs[1].y - runs[0].y).toBe(8);
    });
  });

  describe('set a letter at a time', () => {
    it('centres each letter where it stands in its line', () => {
      const { align, runs } = layoutCutInText('あい', box, setting(), true, tenEach);

      expect(align).toBe('center');
      // The line is 20 wide, so it starts at 290: the letters' middles are at 295 and 305.
      expect(runs).toEqual([
        { text: 'あ', rank: 0, x: 295, y: 250 },
        { text: 'い', rank: 1, x: 305, y: 250 },
      ]);
    });

    it('starts a left-aligned line at the left edge and a right-aligned one at the right', () => {
      expect(
        layoutCutInText('あい', box, setting({ textAlign: 'left' }), true, tenEach).runs.map((run) => run.x)
      ).toEqual([105, 115]);
      expect(
        layoutCutInText('あい', box, setting({ textAlign: 'right' }), true, tenEach).runs.map((run) => run.x)
      ).toEqual([485, 495]);
    });

    it('keeps the ranks running on across the lines', () => {
      const { runs } = layoutCutInText('あ\nい', box, setting(), true, tenEach);

      expect(runs.map((run) => run.rank)).toEqual([0, 1]);
      expect(runs[1].y).toBeGreaterThan(runs[0].y);
    });
  });

  describe('set downwards', () => {
    it('runs the first line down the rightmost column and the next to its left', () => {
      const { align, runs } = layoutCutInText('あい\nう', box, setting({ vertical: true }), false, tenEach);

      expect(align).toBe('center');
      // Two columns of 30 are 60 wide, centred in the 400: the right one's middle is at 315, the left's at 285.
      expect(runs.map((run) => run.x)).toEqual([315, 315, 285]);
      // Two letters of 20 are centred in the 100 down: their middles are at 240 and 260; one alone at 250.
      expect(runs.map((run) => run.y)).toEqual([240, 260, 250]);
      expect(runs.map((run) => run.text)).toEqual(['あ', 'い', 'う']);
    });

    it('sets the letters further apart by the spacing asked for', () => {
      const { runs } = layoutCutInText('あい', box, setting({ vertical: true, letterSpacingPx: 10 }), false, tenEach);

      expect(runs[1].y - runs[0].y).toBe(30);
    });
  });
});

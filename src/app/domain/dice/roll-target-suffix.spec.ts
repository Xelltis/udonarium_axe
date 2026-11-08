import { MAX_ROLL_TARGET_NAME_LENGTH } from '@axe/core/network/server/server-protocol';
import { rollTargetSuffix, rollTogetherSuffix } from '@axe/domain/dice/roll-target-suffix';

describe('roll-target-suffix', () => {
  it('writes a name on one line, its brackets and arrows turned into ones that read as no result', () => {
    expect(rollTargetSuffix('騎士[見習い]\n→')).toBe(' [騎士［見習い］ ⇒]');
    expect(rollTargetSuffix('')).toBeUndefined();
  });

  describe('rollTogetherSuffix()', () => {
    it('writes every name where they all fit', () => {
      expect(rollTogetherSuffix(['ゴブリンA', '騎士[見習い]', ''])).toBe(' [ゴブリンA、騎士［見習い］]');
      expect(rollTogetherSuffix(['', ''])).toBeUndefined();
    });

    it('writes as many whole names as fit, with an ellipsis for the rest, and never more than a server takes', () => {
      const names = Array.from({ length: 12 }, (_, index) => `ゴブリンシャーマン${String(index + 1).padStart(2, '0')}`);

      const suffix = rollTogetherSuffix(names)!;

      expect(suffix).toBe(` [${names.slice(0, 10).join('、')}、…]`);
      expect(suffix.length - 3).toBeLessThanOrEqual(MAX_ROLL_TARGET_NAME_LENGTH);
    });

    it('cuts the first name short where not even that one fits', () => {
      const long = 'あ'.repeat(MAX_ROLL_TARGET_NAME_LENGTH + 10);

      expect(rollTogetherSuffix([long, 'ゴブリン'])).toBe(rollTargetSuffix(long));
    });
  });
});

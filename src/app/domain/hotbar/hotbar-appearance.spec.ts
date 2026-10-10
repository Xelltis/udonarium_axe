import { hotbarSlotColor, hotbarSlotIcon, hotbarSlotLabel } from '@axe/domain/hotbar/hotbar-appearance';

describe('how a hotbar slot shows itself', () => {
  describe('the icon', () => {
    it('takes the one it was given', () => {
      expect(hotbarSlotIcon('chat', '2d6', 'star')).toBe('star');
    });

    it('reads a chat macro to guess what it does', () => {
      expect(hotbarSlotIcon('chat', '2d6+3 攻撃')).toBe('casino');
      expect(hotbarSlotIcon('chat', ':HP-5')).toBe('favorite');
      expect(hotbarSlotIcon('chat', '&!毒/継続/3')).toBe('auto_fix_high');
      expect(hotbarSlotIcon('chat', '《炎》を放つ')).toBe('auto_awesome');
      expect(hotbarSlotIcon('chat', 'こんばんは')).toBe('chat_bubble');
    });

    it('takes no ruby for an effect', () => {
      expect(hotbarSlotIcon('chat', '|炎《ほのお》よ')).toBe('chat_bubble');
      expect(hotbarSlotIcon('chat', '|炎《ほのお》よ《爆炎》')).toBe('auto_awesome');
    });

    it('goes by the kind for everything else', () => {
      expect(hotbarSlotIcon('sound', 'dice-roll')).toBe('volume_up');
      expect(hotbarSlotIcon('range', 'LINE')).toBe('radar');
    });
  });

  describe('the colour', () => {
    it('takes a buff colour word, so the vocabulary carries over', () => {
      expect(hotbarSlotColor('chat', '赤')).toBe('#c62828');
      expect(hotbarSlotColor('chat', '#123456')).toBe('#123456');
    });

    it('falls back to the colour of its kind', () => {
      expect(hotbarSlotColor('effect')).toBe('#6a1b9a');
      expect(hotbarSlotColor('effect', 'nonsense')).toBe('#6a1b9a');
    });
  });

  describe('the label', () => {
    it('takes the one it was given', () => {
      expect(hotbarSlotLabel('2d6', '全力攻撃')).toBe('全力攻撃');
    });

    it('names what it points at, so a rename shows through', () => {
      expect(hotbarSlotLabel('effect-id', '', '爆炎')).toBe('爆炎');
    });

    it('falls back to the first line that says anything', () => {
      expect(hotbarSlotLabel('\n\n  2d6+3 攻撃\n:HP-5')).toBe('2d6+3 攻撃');
      expect(hotbarSlotLabel('   ')).toBe('');
    });
  });
});

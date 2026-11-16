import { barColumns, timelineColumns, timelineSpan, toTimelineBars } from '@axe/domain/character/buff-timeline';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('buff-timeline', () => {
  function makeRoot(): DataElement {
    const root = DataElement.create('バフ', '');
    root.appendChild(DataElement.create('バフ/デバフ', ''));
    return root;
  }

  function addBuff(root: DataElement, name: string, rounds: number, effect = ''): DataElement {
    const buff = DataElement.create(name, rounds, { type: DataElementType.NUMBER_RESOURCE, currentValue: effect });
    root.children[0].appendChild(buff);
    return buff;
  }

  describe('toTimelineBars()', () => {
    it('has nothing to draw for a character with no buffs', () => {
      expect(toTimelineBars(null)).toEqual([]);
      expect(toTimelineBars(makeRoot())).toEqual([]);
    });

    it('puts the longest bar first, so the tail of the chart reads down the left', () => {
      const root = makeRoot();
      addBuff(root, '短い', 1);
      addBuff(root, '長い', 5);
      addBuff(root, '中くらい', 3);

      expect(toTimelineBars(root).map((bar) => bar.name)).toEqual(['長い', '中くらい', '短い']);
    });

    it('carries what the bar has to say about itself', () => {
      const root = makeRoot();
      const buff = addBuff(root, '猛攻撃', 3, '命中+2');
      buff.setAttribute(DataElementAttribute.BUFF_TIMING, 'turnStart');
      buff.setAttribute(DataElementAttribute.BUFF_TRIGGER, '術者');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_TARGET, '命中');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_APPLIED, '2');

      expect(toTimelineBars(root)[0]).toMatchObject({
        name: '猛攻撃',
        effect: '命中+2',
        strength: '+2',
        rounds: 3,
        timing: 'turnStart',
        trigger: '術者',
        modifierTarget: '命中',
      });
    });
  });

  describe('what a bar says of the buff moving its status at every count', () => {
    it('says a plain buff moves nothing at every count and has no moment for it', () => {
      const root = makeRoot();
      addBuff(root, '猛攻撃', 3, '命中+2');

      expect(toTimelineBars(root)[0]).toMatchObject({ movesAtCounts: false, effectTiming: null });
    });

    it('says a buff moves at every count, and at which moment where it has one of its own', () => {
      const root = makeRoot();
      const buff = addBuff(root, '再生', 3, ':HP+0~+3');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_TARGET, 'HP');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_APPLIED, '0');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_KEPT, '0');
      buff.setAttribute(DataElementAttribute.BUFF_MOD_KEPT_STEP, '3');

      expect(toTimelineBars(root)[0]).toMatchObject({ movesAtCounts: true, effectTiming: null });

      buff.setAttribute(DataElementAttribute.BUFF_EFFECT_TIMING, 'turnEnd');
      expect(toTimelineBars(root)[0]).toMatchObject({ movesAtCounts: true, effectTiming: 'turnEnd' });
    });
  });

  describe('timelineSpan()', () => {
    const row = (rounds: number[]) => ({
      characterIdentifier: 'c',
      characterName: 'コマ',
      imageUrl: '',
      bars: rounds.map((r, i) => ({
        identifier: `b${i}`,
        name: 'バフ',
        effect: '',
        strength: '',
        icon: '✦',
        iconUrl: '',
        color: '#000',
        rounds: r,
        timing: 'roundEnd' as const,
        trigger: '',
        modifierTarget: '',
        movesAtCounts: false,
        effectTiming: null,
      })),
    });

    it('keeps a nearly empty chart wide enough to read', () => {
      expect(timelineSpan([row([1])])).toBe(4);
      expect(timelineSpan([])).toBe(4);
    });

    it('grows to the longest buff on the table', () => {
      expect(timelineSpan([row([2]), row([7])])).toBe(7);
    });

    it('follows a long buff rather than cutting it to what fits on screen', () => {
      expect(timelineSpan([row([40])])).toBe(40);
    });

    it('stops at a span nobody would want a column apiece for', () => {
      expect(timelineSpan([row([400])])).toBe(60);
    });
  });

  describe('barColumns()', () => {
    it('gives a bar a column per round it has left', () => {
      expect(barColumns(1, 4)).toBe(1);
      expect(barColumns(3, 4)).toBe(3);
    });

    it('holds a bar that outruns the chart at its edge', () => {
      expect(barColumns(30, 4)).toBe(4);
    });

    it('still shows a buff that has run out of rounds', () => {
      expect(barColumns(0, 4)).toBe(1);
    });
  });

  describe('timelineColumns()', () => {
    it('counts from the round being played', () => {
      expect(timelineColumns(3, 4)).toEqual([3, 4, 5, 6]);
    });

    it('starts at the first round before anyone has begun', () => {
      expect(timelineColumns(0, 3)).toEqual([1, 2, 3]);
    });
  });
});

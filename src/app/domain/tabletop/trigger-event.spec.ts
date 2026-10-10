import {
  asTriggerMoment,
  asTriggerRepeat,
  asTriggerTarget,
  DEFAULT_TRIGGER_REPEAT,
  readSpentBy,
  rollTriggerAmount,
  TRIGGER_REPEATS,
  triggerCatches,
  triggerPassTake,
  writeSpentBy,
} from '@axe/domain/tabletop/trigger-event';

describe('when painted ground goes off', () => {
  it('goes off as a walk ends on it unless it was told otherwise', () => {
    expect(asTriggerMoment('nonsense')).toBe('stop');
    expect(asTriggerMoment('enter')).toBe('enter');
  });

  it('catches whoever it was pointed at', () => {
    expect(asTriggerTarget('sideways')).toBe('all');
    expect(triggerCatches('all', true)).toBe(true);
    expect(triggerCatches('all', false)).toBe(true);
    expect(triggerCatches('pc', false)).toBe(true);
    expect(triggerCatches('pc', true)).toBe(false);
    expect(triggerCatches('npc', true)).toBe(true);
    expect(triggerCatches('npc', false)).toBe(false);
  });
});

describe('what painted ground takes', () => {
  const highest = () => 0.999999;
  const lowest = () => 0;

  it('takes a plain number as it is written', () => {
    expect(rollTriggerAmount('5')).toBe(5);
    expect(rollTriggerAmount('-3')).toBe(-3);
    expect(rollTriggerAmount(' 12 ')).toBe(12);
  });

  it('rolls a handful of dice', () => {
    expect(rollTriggerAmount('2d6', highest)).toBe(12);
    expect(rollTriggerAmount('2d6', lowest)).toBe(2);
    expect(rollTriggerAmount('d6', highest)).toBe(6);
  });

  it('adds and takes away what is written beside the dice', () => {
    expect(rollTriggerAmount('1d6+2', highest)).toBe(8);
    expect(rollTriggerAmount('1d6-2', lowest)).toBe(-1);
    expect(rollTriggerAmount('2+3')).toBe(5);
  });

  it('reads a sign written after a space, since a space is nothing to read', () => {
    expect(rollTriggerAmount(' -3')).toBe(-3);
    expect(rollTriggerAmount('  +4 ')).toBe(4);
    expect(rollTriggerAmount(' - 2d6', highest)).toBe(-12);
  });

  describe('from somebody who made the roll it asked for', () => {
    it('takes nothing where nothing was written', () => {
      expect(triggerPassTake('', 12)).toBe(0);
      expect(triggerPassTake('   ', 12)).toBe(0);
    });

    it('takes half of what was rolled, rounded down', () => {
      expect(triggerPassTake('half', 12)).toBe(6);
      expect(triggerPassTake('HALF', 7)).toBe(3);
    });

    it('rounds half of something given back towards nothing as well', () => {
      expect(triggerPassTake('half', -7)).toBe(-3);
    });

    it('rolls an amount of its own where one is written', () => {
      expect(triggerPassTake('1d6', 12, highest)).toBe(6);
      expect(triggerPassTake('2', 12)).toBe(2);
    });
  });

  it('takes nothing at all where nothing readable was written', () => {
    expect(rollTriggerAmount('')).toBe(0);
    expect(rollTriggerAmount('たくさん')).toBe(0);
    expect(rollTriggerAmount('1d')).toBe(0);
    expect(rollTriggerAmount('0d6')).toBe(0);
  });

  it('refuses a handful nobody could throw', () => {
    expect(rollTriggerAmount('1000d6')).toBe(0);
    expect(rollTriggerAmount('1d2000')).toBe(0);
  });
});

describe('how often a piece of ground has another go', () => {
  it('reads the answers it knows', () => {
    for (const repeat of TRIGGER_REPEATS) expect(asTriggerRepeat(repeat)).toBe(repeat);
  });

  it('reads anything else as ground with no end of goes in it', () => {
    expect(asTriggerRepeat('twice')).toBe(DEFAULT_TRIGGER_REPEAT);
    expect(asTriggerRepeat(undefined)).toBe(DEFAULT_TRIGGER_REPEAT);
  });

  it('writes the pieces it has had in one line, each of them once', () => {
    expect(writeSpentBy(['b', 'a', 'b'])).toBe('a b');
  });

  it('writes them in the same order whichever order they came in', () => {
    expect(writeSpentBy(['c', 'a', 'b'])).toBe(writeSpentBy(['b', 'c', 'a']));
  });

  it('reads back what it wrote, and nothing at all from an empty line', () => {
    expect(readSpentBy(writeSpentBy(['a', 'b']))).toEqual(['a', 'b']);
    expect(readSpentBy('')).toEqual([]);
    expect(readSpentBy('   ')).toEqual([]);
  });
});

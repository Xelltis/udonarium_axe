import {
  asTriggerMoment,
  asTriggerTarget,
  rollTriggerAmount,
  triggerCatches,
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

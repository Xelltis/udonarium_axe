import {
  canStep,
  clampToBounds,
  numericInputMode,
  stepValue,
} from '@axe/features/data-element/game-data-element/value-stepper';

const open = { min: '', max: '' };

describe('stepValue', () => {
  it('moves a number one step', () => {
    expect(stepValue(10, 1, open)).toBe(11);
    expect(stepValue('10', -1, open)).toBe(9);
  });

  it('starts an empty value from nothing', () => {
    expect(stepValue('', 1, open)).toBe(1);
  });

  it('holds the value within its bounds', () => {
    expect(stepValue(20, 1, { min: '0', max: '20' })).toBe(20);
    expect(stepValue(0, -1, { min: '0', max: '20' })).toBe(0);
  });

  it('lets a value go below zero where nothing stops it', () => {
    expect(stepValue(0, -1, open)).toBe(-1);
  });

  it('ignores a bound that is not a number', () => {
    expect(stepValue(5, 1, { min: '', max: 'abc' })).toBe(6);
  });

  it('does not step text that is not a number', () => {
    expect(stepValue('初級', 1, open)).toBeNull();
  });
});

describe('canStep', () => {
  it('is false against the bound the step would cross', () => {
    expect(canStep(20, 1, { min: '0', max: '20' })).toBe(false);
    expect(canStep(20, -1, { min: '0', max: '20' })).toBe(true);
  });

  it('is false for text', () => {
    expect(canStep('初級', 1, open)).toBe(false);
  });
});

describe('numericInputMode', () => {
  it('asks for the number pad for a value that never goes below zero', () => {
    expect(numericInputMode('0')).toBe('decimal');
    expect(numericInputMode('3')).toBe('decimal');
  });

  it('keeps the ordinary keyboard where the value may be negative', () => {
    expect(numericInputMode('')).toBeNull();
    expect(numericInputMode('-10')).toBeNull();
  });
});

describe('clampToBounds', () => {
  it('holds a number between its bounds', () => {
    expect(clampToBounds(12, { min: '0', max: '10' })).toBe(10);
    expect(clampToBounds(-3, { min: '0', max: '10' })).toBe(0);
    expect(clampToBounds(5, { min: '', max: '' })).toBe(5);
  });

  it('reads a number typed as text, and hands it back as a number', () => {
    expect(clampToBounds('7', { min: '0', max: '5' })).toBe(5);
    expect(clampToBounds('3', { min: '0', max: '5' })).toBe(3);
  });

  it('leaves an empty value and text that is not a number as they were', () => {
    expect(clampToBounds('', { min: '0', max: '5' })).toBe('');
    expect(clampToBounds('たくさん', { min: '0', max: '5' })).toBe('たくさん');
  });
});

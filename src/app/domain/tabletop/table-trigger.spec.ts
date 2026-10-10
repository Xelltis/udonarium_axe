import { TableTrigger, triggerEffectLine } from '@axe/domain/tabletop/table-trigger';
import { describe, expect, it } from 'vitest';

function ground(overrides: Partial<TableTrigger> = {}): TableTrigger {
  const trigger = new TableTrigger();
  Object.assign(trigger, overrides);
  return trigger;
}

describe('how often a stretch of painted ground has another go', () => {
  it('reads ground painted before there was a finer answer by the plain yes or no', () => {
    expect(ground({ once: true }).repeats).toBe('once');
    expect(ground({ once: false }).repeats).toBe('always');
  });

  it('lets the finer answer stand over the plain one', () => {
    expect(ground({ once: true, repeat: 'oncePerPiece' }).repeats).toBe('oncePerPiece');
  });

  it('reads an answer it does not know as ground with no end of goes in it', () => {
    expect(ground({ repeat: 'twice' }).repeats).toBe('always');
  });
});

describe('whether a stretch of ground has a go left', () => {
  it('has one for anybody, any number of times, where nothing was said', () => {
    const held = ground();

    held.spend('hero', 1);

    expect(held.hasGoFor('hero', 1)).toBe(true);
  });

  it('is spent for everybody once it is spent at all', () => {
    const held = ground({ repeat: 'once' });

    held.spend('hero', 1);

    expect(held.hasGoFor('hero', 1)).toBe(false);
    expect(held.hasGoFor('rogue', 2)).toBe(false);
  });

  it('is spent on the piece that had it, and nobody else, where it has one apiece', () => {
    const held = ground({ repeat: 'oncePerPiece' });

    held.spend('hero', 1);

    expect(held.hasGoFor('hero', 1)).toBe(false);
    expect(held.hasGoFor('rogue', 1)).toBe(true);
  });

  it('keeps every piece it has had, not merely the last', () => {
    const held = ground({ repeat: 'oncePerPiece' });

    held.spend('hero', 1);
    held.spend('rogue', 1);

    expect(held.hasGoFor('hero', 1)).toBe(false);
    expect(held.hasGoFor('rogue', 1)).toBe(false);
  });

  it('comes round again with the round, where it has one go a round', () => {
    const held = ground({ repeat: 'oncePerRound' });

    held.spend('hero', 1);

    expect(held.hasGoFor('hero', 1)).toBe(false);
    expect(held.hasGoFor('rogue', 1)).toBe(false);
    expect(held.hasGoFor('hero', 2)).toBe(true);
  });

  it('has one go and no more at a table counting no rounds', () => {
    const held = ground({ repeat: 'oncePerRound' });

    held.spend('hero', -1);

    expect(held.hasGoFor('hero', -1)).toBe(false);
  });

  it('writes the plain yes or no beside the finer answer, for a peer that knows only the one', () => {
    const held = ground({ repeat: 'once' });

    held.spend('hero', 1);

    expect(held.spent).toBe(true);
  });
});

describe('who a stretch of painted ground is shown to', () => {
  it('is the master alone where nothing was said and it was not painted open', () => {
    expect(ground().shows).toBe('master');
  });

  it('is the room where nothing was said and it was painted open', () => {
    expect(ground({ open: true }).shows).toBe('room');
  });

  it('is whatever was said, whatever the older answer says', () => {
    expect(ground({ shownTo: 'sight', open: true }).shows).toBe('sight');
    expect(ground({ shownTo: 'room', open: false }).shows).toBe('room');
  });

  it('reads an answer it does not know by the older one', () => {
    expect(ground({ shownTo: 'whoever', open: true }).shows).toBe('room');
  });

  it('counts only the room as being shown it, sight or no sight', () => {
    expect(ground({ shownTo: 'sight' }).isShown).toBe(false);
    expect(ground({ shownTo: 'room' }).isShown).toBe(true);
  });

  it('counts ground that gave itself away as shown, however it was painted', () => {
    expect(ground({ shownTo: 'master', found: true }).isShown).toBe(true);
  });
});

describe('what a stretch of painted ground says it does', () => {
  it('says what it takes and what it leaves behind', () => {
    expect(triggerEffectLine(ground({ element: 'HP', amount: '2d6', ailment: '毒' }))).toBe('HP -2d6  毒');
  });

  it('says a healing spring gives rather than takes', () => {
    expect(triggerEffectLine(ground({ element: 'HP', amount: '-5' }))).toBe('HP +5');
  });

  it('says nothing about where it carries anybody, only that it does', () => {
    expect(triggerEffectLine(ground({ warps: true, warpCol: 9, warpRow: 9 }))).toBe('→');
  });

  it('says nothing at all for ground that does nothing', () => {
    expect(triggerEffectLine(ground())).toBe('');
  });
});

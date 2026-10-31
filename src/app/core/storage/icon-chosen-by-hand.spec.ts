import {
  forgetIconChosenByHand,
  hasChosenIconByHand,
  noteIconChosenByHand,
} from '@axe/core/storage/icon-chosen-by-hand';

describe('the icons chosen by hand', () => {
  it('notes an account that chose its icon by hand, and forgets it again, leaving the others noted', () => {
    noteIconChosenByHand('acct_1');
    noteIconChosenByHand('acct_2');

    forgetIconChosenByHand('acct_1');

    expect(hasChosenIconByHand('acct_1')).toBe(false);
    expect(hasChosenIconByHand('acct_2')).toBe(true);
  });
});

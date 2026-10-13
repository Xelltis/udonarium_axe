import { CurrentCarry } from '@axe/domain/effect/ambience/current-carry';

describe('CurrentCarry', () => {
  it('adds up how far the water carries, pass by pass, turning as the current seen turns', () => {
    const carry = new CurrentCarry();
    expect(carry.advance(1000, { across: 1, toward: 0 })?.carriedAcross).toBe(0);
    expect(carry.advance(1050, { across: 1, toward: 0 })?.carriedAcross).toBeCloseTo(0.05, 6);

    const turned = carry.advance(1100, { across: 0, toward: 2 })!;

    expect(turned.carriedAcross).toBeCloseTo(0.05, 6);
    expect(turned.carriedToward).toBeCloseTo(0.1, 6);
    expect(turned.toward).toBe(2);
  });

  it('carries no further than a short step across a pause', () => {
    const carry = new CurrentCarry();
    carry.advance(0, { across: 1, toward: 0 });
    expect(carry.advance(60_000, { across: 1, toward: 0 })?.carriedAcross).toBeCloseTo(0.1, 6);
  });

  it('forgets how far it had carried once the water stands still', () => {
    const carry = new CurrentCarry();
    carry.advance(0, { across: 1, toward: 0 });
    carry.advance(100, { across: 1, toward: 0 });
    expect(carry.advance(200, null)).toBeNull();
    expect(carry.advance(300, { across: 1, toward: 0 })?.carriedAcross).toBe(0);
  });
});

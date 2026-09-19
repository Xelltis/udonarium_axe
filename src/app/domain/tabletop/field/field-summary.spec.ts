import { fieldAtmosphereById } from '@axe/domain/tabletop/field/field-atmosphere';
import { planField } from '@axe/domain/tabletop/field/field-generator';
import { buildFieldSummary } from '@axe/domain/tabletop/field/field-summary';

const labels = {
  seed: 'seed',
  ground: 'ground',
  standing: 'standing',
  fires: 'fires',
  textureName: (texture: string) => texture,
  propName: (prop: string) => prop,
};

function summarise(id = 'woodland') {
  const plan = planField({ atmosphere: id as 'woodland', size: 40, density: 50, seed: 7 });
  return {
    plan,
    text: buildFieldSummary({ ...plan, name: 'A wood', seed: 7, labels, atmosphere: fieldAtmosphereById(id) }),
  };
}

describe('buildFieldSummary()', () => {
  it('opens with the name, the seed and the size of the board', () => {
    const { text } = summarise();

    expect(text.split('\n')[0]).toBe('A wood / seed 7 / 40x30');
  });

  it('says what the ground is made of, thickest first, in whole hundredths', () => {
    const { text } = summarise();
    const line = text.split('\n')[1];
    const shares = [...line.matchAll(/(\d+)%/g)].map((match) => Number(match[1]));

    expect(line.startsWith('ground: ')).toBe(true);
    expect(shares.length).toBeGreaterThan(1);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });

  it('counts what stands on it and says where anything is burning', () => {
    const { plan, text } = summarise();
    const trees = plan.layout.props.filter((prop) => prop === 'tree').length;

    expect(text).toContain(`tree ${trees}`);
    expect(text).toContain(`fires: (${plan.blocks.lights[0].x}, ${plan.blocks.lights[0].y})`);
  });

  it('leaves out a line it has nothing to put on', () => {
    const plan = planField({ atmosphere: 'meadow', size: 40, density: 0, seed: 7 });
    const text = buildFieldSummary({
      ...plan,
      name: 'Bare',
      seed: 7,
      labels,
      atmosphere: fieldAtmosphereById('meadow'),
    });

    expect(text).not.toContain('standing:');
  });
});

describe('buildFieldSummary() of a town', () => {
  it('counts the buildings one to a building, first, however many cells each stands on', () => {
    const { plan, text } = summarise('city');
    const standing = text.split('\n').find((line) => line.startsWith('standing: '))!;

    expect(plan.layout.buildings.length).toBeGreaterThan(0);
    expect(standing.startsWith(`standing: building ${plan.layout.buildings.length}`)).toBe(true);
  });
});

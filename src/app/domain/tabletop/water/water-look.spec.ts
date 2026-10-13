import {
  deepWaterColor,
  shadedWaterColor,
  waterFloorWash,
  waterSideWash,
  waterSurfaceWash,
} from '@axe/domain/tabletop/water/water-look';

describe('the look of water', () => {
  it('draws the depths darker than the water', () => {
    expect(deepWaterColor('#6496c8')).toBe('#203040');
    expect(deepWaterColor('#abc')).toBe('#363c41');
  });

  it('hands a colour it cannot read back as it is', () => {
    expect(deepWaterColor('teal')).toBe('teal');
    expect(shadedWaterColor('teal', 0.5)).toBe('teal');
  });

  it('darkens water to how lit it is, and leaves lit water alone', () => {
    expect(shadedWaterColor('#6496c8', 0.5)).toBe('#324b64');
    expect(shadedWaterColor('#6496c8', 1)).toBe('#6496c8');
    expect(shadedWaterColor('#6496c8', 0)).toBe('#000000');
  });

  it('draws thicker water more strongly', () => {
    const alphaOf = (wash: string) => Number(/,\s*([\d.]+)\)/.exec(wash)?.[1]);
    expect(alphaOf(waterFloorWash('#3399cc', 1))).toBeGreaterThan(alphaOf(waterFloorWash('#3399cc', 0)));
  });

  it('runs the side from the depths at the floor up to the colour of the water', () => {
    const wash = waterSideWash('#3399cc', 0.6);
    expect(wash.startsWith('linear-gradient(to top, rgba(16, 49, 65')).toBe(true);
    expect(wash).toContain('rgba(51, 153, 204');
  });

  it('keeps the surface clear enough to see the floor through', () => {
    const alphas = [...waterSurfaceWash('#3399cc', 1).matchAll(/,\s*([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(Math.max(...alphas)).toBeLessThan(0.6);
  });
});

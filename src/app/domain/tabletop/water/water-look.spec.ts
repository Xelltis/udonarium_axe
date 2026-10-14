import {
  causticOpacity,
  deepWaterColor,
  depthsWash,
  dirtyWaterColor,
  glintOpacity,
  murkAlpha,
  rgbTripletOf,
  scumOpacity,
  shadedWaterColor,
  siltOpacity,
  underwaterDeepColor,
  waterFloorWash,
  waterMurkLayer,
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

  it('keeps the blue of the depths under the default light of a map under water', () => {
    expect(underwaterDeepColor('#c8f0ff')).toBe('#06354f');
    expect(underwaterDeepColor('#6496c8')).toBe(deepWaterColor('#6496c8'));
  });

  it('lays the depths over the floor in the colour given, not darkened again', () => {
    expect(depthsWash('#06354f', 0)).toBe('rgba(6, 53, 79, 0.22)');
  });

  it('gives a colour as the three numbers rgba() takes', () => {
    expect(rgbTripletOf('#06354f')).toBe('6, 53, 79');
    expect(rgbTripletOf('teal')).toBeNull();
  });

  it('lets less light through murky and deep water onto the floor', () => {
    expect(causticOpacity(0.6, 1)).toBeLessThan(causticOpacity(0.6, 0) * 0.2);
    expect(causticOpacity(0.6, 0, 6)).toBeLessThan(causticOpacity(0.6, 0, 0) * 0.6);
    expect(glintOpacity(0.6, 1)).toBeLessThan(glintOpacity(0.6, 0));
  });

  it('lays murk over the surface in the water\u2019s own colour, opaque at the top of the scale', () => {
    expect(waterMurkLayer('#3399cc', 0)).toBe('');
    expect(murkAlpha(1)).toBe(1);
    expect(murkAlpha(0.5)).toBeGreaterThan(0.3);
    expect(murkAlpha(0.5)).toBeLessThan(0.6);
    expect(waterMurkLayer('#3399cc', 1)).toContain('rgba(45, 135, 180, 1)');
  });

  it('turns dirty water towards the dull brown of silt and rot, and leaves clean water its colour', () => {
    expect(dirtyWaterColor('#3399cc', 0)).toBe('#3399cc');
    expect(dirtyWaterColor('#3399cc', 1)).not.toBe('#3399cc');
    expect(scumOpacity(0)).toBe(0);
    expect(scumOpacity(1)).toBeGreaterThan(0.5);
    expect(glintOpacity(0.6, 0, 1)).toBeLessThan(glintOpacity(0.6, 0, 0) * 0.2);
  });

  it('shows no clouds of silt in clear water', () => {
    expect(siltOpacity(0.15)).toBe(0);
    expect(siltOpacity(1)).toBeGreaterThan(0.5);
  });
});

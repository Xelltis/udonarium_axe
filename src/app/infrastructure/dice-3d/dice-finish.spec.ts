import {
  DiceDressing,
  DiceDressingKind,
  dressDie,
  faceColorsOf,
  FINISHES,
  swirlSeedOf,
  veinOf,
} from '@axe/infrastructure/dice-3d/dice-finish';
import { Color, ShaderLib, Texture, WebGLProgramParametersWithUniforms } from 'three';

function dressed(material: DiceDressingKind) {
  const dressing: DiceDressing = {
    diceMarks: { value: new Texture() },
    diceVein: { value: new Color(1, 1, 1) },
    diceSeed: { value: 7 },
    dicePicture: { value: new Texture() },
  };
  const shader = {
    uniforms: {},
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  } as unknown as WebGLProgramParametersWithUniforms;
  dressDie(material, dressing)(shader);
  return { shader, dressing };
}

describe('dice finish', () => {
  it('lets glass alone light through, and metal alone mirror', () => {
    expect(FINISHES.glass.transmission).toBe(1);
    expect(FINISHES.resin.transmission ?? 0).toBe(0);
    expect(FINISHES.metal.metalness).toBe(1);
    expect(FINISHES.marble.metalness).toBe(0);
  });

  it('reads where the marks lie on every material it dresses, so they stay paint', () => {
    for (const material of ['marble', 'metal', 'glass'] as const) {
      const { shader, dressing } = dressed(material);
      expect(shader.uniforms['diceMarks']).toBe(dressing.diceMarks);
      expect(shader.fragmentShader).toContain('float diceMark = texture2D( diceMarks, vMapUv ).r;');
      expect(shader.vertexShader).toContain('vDiceSpot = position;');
    }
  });

  it('swirls marble from where on the die a point lies, with the die’s own seed', () => {
    const { shader, dressing } = dressed('marble');

    expect(shader.fragmentShader).toContain('diceFbm( diceAt * 1.3 )');
    expect(shader.uniforms['diceSeed']).toBe(dressing.diceSeed);
    expect(dressed('metal').shader.fragmentShader).not.toContain('diceFbm( diceAt');
  });

  it('takes the metal out of metal where its marks are painted', () => {
    expect(dressed('metal').shader.fragmentShader).toContain('metalnessFactor *= 1.0 - diceMark;');
    expect(dressed('marble').shader.fragmentShader).not.toContain('metalnessFactor *= 1.0 - diceMark;');
  });

  it('wraps a picture round a die from three ways across it, by where on the die each point lies and which way it faces', () => {
    const { shader, dressing } = dressed('picture');

    expect(shader.uniforms['dicePicture']).toBe(dressing.dicePicture);
    expect(shader.vertexShader).toContain('vDiceNormal = normal;');
    expect(shader.fragmentShader).toContain('uniform sampler2D dicePicture;');
    expect(shader.fragmentShader).toContain('texture2D( dicePicture, dicePictureAt.xy + dicePictureShift )');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = mix( diceWorn, diffuseColor.rgb, diceMark );');
  });

  it('asks nothing of a picture on a die that wears none', () => {
    for (const material of ['marble', 'metal', 'glass'] as const) {
      expect(dressed(material).shader.fragmentShader).not.toContain('dicePicture');
      expect(dressed(material).shader.vertexShader).not.toContain('vDiceNormal');
    }
  });

  it('lets no light through glass where its marks are painted', () => {
    const fragment = dressed('glass').shader.fragmentShader;

    expect(fragment).toContain('material.transmission = transmission * ( 1.0 - diceMark );');
    expect(fragment).not.toContain('#include <transmission_fragment>');
  });

  it('paints the faces of glass in a pale wash of its colour, and the rest as they are', () => {
    const colors = { body: '#3b5bdb', ink: '#f6f3ec', accent: '#c8102e' };

    expect(faceColorsOf('resin', colors)).toBe(colors);
    expect(faceColorsOf('metal', colors)).toBe(colors);
    const glass = new Color(faceColorsOf('glass', colors).body);
    expect(glass.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(new Color(colors.body).getHSL({ h: 0, s: 0, l: 0 }).l);
  });

  it('seeds a die’s swirl from its roll and its place in it alone, so it never changes for the same die', () => {
    expect(swirlSeedOf('roll-a', 0)).toBe(swirlSeedOf('roll-a', 0));
    expect(swirlSeedOf('roll-a', 1)).not.toBe(swirlSeedOf('roll-a', 0));
    expect(swirlSeedOf('roll-b', 0)).not.toBe(swirlSeedOf('roll-a', 0));
    for (const seed of [swirlSeedOf('roll-a', 0), swirlSeedOf('roll-b', 3), swirlSeedOf('', 0)]) {
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThan(50);
    }
  });

  it('veins a dark die lighter and a light die darker', () => {
    const dark = new Color('#1e6b52');
    const light = new Color('#f2efe6');

    expect(veinOf('#1e6b52').getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(dark.getHSL({ h: 0, s: 0, l: 0 }).l);
    expect(veinOf('#f2efe6').getHSL({ h: 0, s: 0, l: 0 }).l).toBeLessThan(light.getHSL({ h: 0, s: 0, l: 0 }).l);
  });
});

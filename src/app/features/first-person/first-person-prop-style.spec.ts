import { FirstPersonProp } from '@axe/application/tabletop/first-person-props.service';
import { eyeFrameOf } from '@axe/domain/tabletop/first-person/first-person-clip';
import {
  glowStyle,
  lyingCorners,
  lyingSamples,
  propClip,
  propStyle,
} from '@axe/features/first-person/first-person-prop-style';
import { describe, expect, it } from 'vitest';

function prop(overrides: Partial<FirstPersonProp>): FirstPersonProp {
  return {
    id: 'p',
    kind: 'lie',
    what: 'card',
    x: 100,
    y: 50,
    z: 1,
    width: 40,
    height: 20,
    rotate: 0,
    image: '',
    color: '',
    wash: '',
    opacity: 1,
    dark: false,
    round: false,
    label: '',
    text: '',
    ...overrides,
  };
}

describe('propStyle', () => {
  it('lays a flat thing down about its middle, turned the way it lies', () => {
    expect(propStyle(prop({ rotate: 30 }), 0, 2)['transform']).toBe(
      'translate3d(200px, 100px, 2px) rotateZ(30deg) translate(-50%, -50%)'
    );
  });

  it('stands a board up on its bottom edge, facing the way it was set rather than the eye', () => {
    expect(propStyle(prop({ kind: 'board', rotate: 90 }), 45, 2)['transform']).toBe(
      'translate3d(200px, 100px, 2px) rotateZ(90deg) rotateX(-90deg) translate(-50%, -100%)'
    );
  });

  it('turns a thing that stands to face the eye', () => {
    expect(propStyle(prop({ kind: 'stand' }), 45, 2)['transform']).toContain('rotateZ(45deg) rotateX(-90deg)');
  });
});

describe('lyingCorners', () => {
  it('finds the corners of a flat thing, turned about its middle', () => {
    const corners = lyingCorners(prop({ rotate: 90 }));

    expect(corners[0].x).toBeCloseTo(110);
    expect(corners[0].y).toBeCloseTo(30);
  });
});

describe('lyingSamples', () => {
  it('spreads a point over every cell a flat thing covers', () => {
    const points = lyingSamples(prop({ width: 100, height: 50 }), 50);

    expect(points).toHaveLength(2);
    expect(points[0].x).toBeCloseTo(75);
    expect(points[1].x).toBeCloseTo(125);
  });
});

describe('propClip', () => {
  const eye = eyeFrameOf({ x: 100, y: 100, z: 40, yaw: 0 });

  it('leaves a flat thing whole while it lies wholly in front of the eye, and drops it once it is behind', () => {
    expect(propClip(prop({ y: 40 }), eye, 2, 2)).toBe('');
    expect(propClip(prop({ y: 130 }), eye, 2, 2)).toBeNull();
  });

  it('cuts off the part of a flat thing the eye stands over', () => {
    expect(propClip(prop({ y: 95 }), eye, 2, 2)).toBe('polygon(0px 26px, 0px 0px, 80px 0px, 80px 26px)');
  });

  it('cuts an upright board short where it passes the eye', () => {
    expect(propClip(prop({ kind: 'board', y: 95, rotate: 90 }), eye, 2, 2)).toBe('inset(0 42.5% 0 0%)');
  });

  it('keeps a standing thing while its foot is in front of the eye', () => {
    expect(propClip(prop({ kind: 'stand', y: 95 }), eye, 2, 2)).toBe('');
    expect(propClip(prop({ kind: 'stand', y: 105 }), eye, 2, 2)).toBeNull();
  });
  describe('with the camera tipped', () => {
    const lookingUp = eyeFrameOf({ x: 100, y: 100, z: 40, yaw: 0, pitch: 70 });
    const lookingDown = eyeFrameOf({ x: 100, y: 100, z: 40, yaw: 0, pitch: -70 });

    it('cuts a standing thing near the eye from below as it looks up, its label over it and its sides kept', () => {
      expect(propClip(prop({ kind: 'stand', y: 90, z: 0, height: 100 }), lookingUp, 2, 2)).toMatch(
        /^inset\(-400% -100% [\d.]+% -100%\)$/
      );
    });

    it('cuts an upright board the eye stands beside on a slant as it looks up', () => {
      expect(propClip(prop({ kind: 'board', y: 95, z: 0, height: 100, rotate: 90 }), lookingUp, 2, 2)).toMatch(
        /^polygon\(/
      );
    });

    it('keeps the part of a flat thing behind the feet as it looks down', () => {
      expect(propClip(prop({ y: 115, z: 0 }), eye, 2, 2)).toBeNull();
      expect(propClip(prop({ y: 115, z: 0 }), lookingDown, 2, 2)).not.toBeNull();
    });
  });
});

describe('glowStyle', () => {
  it('centres a glow on its light in the light colour, and falls back to lamplight', () => {
    const glow = { id: 'g', x: 10, y: 10, z: 30, radius: 10, color: '#ff0000' };

    expect(glowStyle(glow, 0, 1)['transform']).toContain('translate3d(10px, 10px, 20px)');
    expect(glowStyle(glow, 0, 1)['backgroundImage']).toContain('#ff0000');
    expect(glowStyle({ ...glow, color: '' }, 0, 1)['backgroundImage']).toContain('#ffd68c');
  });
});

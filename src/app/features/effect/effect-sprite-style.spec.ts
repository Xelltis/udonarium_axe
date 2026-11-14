import type { EffectSprite } from '@axe/domain/effect/effect-timeline';
import {
  effectPaintStyle,
  effectSpriteStyle,
  type EffectViewpoint,
  hasEffectPaintLayer,
} from '@axe/features/effect/effect-sprite-style';

describe('effect sprite styles', () => {
  function sprite(overrides: Partial<EffectSprite> = {}): EffectSprite {
    return {
      key: 'spark',
      x: 100,
      y: 200,
      z: 30,
      offsetX: 0,
      offsetY: 0,
      width: 40,
      height: 20,
      rotate: 0,
      opacity: 0.5,
      background: '',
      borderRadius: '',
      clipPath: '',
      shadow: '',
      animation: '',
      origin: '',
      flat: false,
      ...overrides,
    };
  }

  function viewpoint(overrides: Partial<EffectViewpoint> = {}): EffectViewpoint {
    return { rotation: { x: 60, y: 5, z: 20 }, liftPx: 40, risePx: 7, flatRisePx: 2, ...overrides };
  }

  describe('hasEffectPaintLayer()', () => {
    it('gives an inner layer only to a sprite that is animated', () => {
      expect(hasEffectPaintLayer(sprite())).toBe(false);
      expect(hasEffectPaintLayer(sprite({ animation: 'spin 1s linear' }))).toBe(true);
    });
  });

  describe('effectSpriteStyle()', () => {
    it('places the sprite by its top-left corner at its size, faded as far as it is, out of the pointer’s way', () => {
      const style = effectSpriteStyle(sprite(), viewpoint());

      expect(style).toMatchObject({
        position: 'absolute',
        left: '0px',
        top: '0px',
        width: '40px',
        height: '20px',
        opacity: '0.500',
        'transform-origin': '0 0',
        'pointer-events': 'none',
      });
    });

    it('stands a billboard up against the way the board is turned, lifted towards the camera and centred', () => {
      const style = effectSpriteStyle(sprite(), viewpoint());

      expect(style['transform']).toBe(
        'translate3d(100px, 200px, 37px) rotateZ(-20deg) rotateX(-60deg) rotateY(-5deg) translateZ(40px) translate(-50%, -50%)'
      );
    });

    it('turns a billboard against the usual tilt of the board where the turn is not known', () => {
      const style = effectSpriteStyle(sprite(), viewpoint({ rotation: null }));

      expect(style['transform']).toContain('rotateZ(-10deg) rotateX(-50deg) rotateY(0deg)');
    });

    it('lays a flat sprite on the board at the flat rise, without turning it to the camera', () => {
      const style = effectSpriteStyle(sprite({ flat: true }), viewpoint());

      expect(style['transform']).toBe('translate3d(100px, 200px, 32px) translate(-50%, -50%)');
    });

    it('offsets and turns the sprite after facing it to the camera, and before centring it', () => {
      const style = effectSpriteStyle(sprite({ offsetX: 1.234, offsetY: -5, rotate: 33.333 }), viewpoint());

      expect(style['transform']).toMatch(
        /translateZ\(40px\) translate\(1\.23px, -5\.00px\) rotateZ\(33\.33deg\) translate\(-50%, -50%\)$/
      );
    });

    it('carries the look itself while the sprite has no inner layer', () => {
      const style = effectSpriteStyle(
        sprite({ background: 'red', borderRadius: '50%', clipPath: 'circle(40%)', shadow: '0 0 4px red' }),
        viewpoint()
      );

      expect(style).toMatchObject({
        background: 'red',
        'border-radius': '50%',
        'clip-path': 'circle(40%)',
        'box-shadow': '0 0 4px red',
      });
    });

    it('leaves the look to the inner layer of an animated sprite', () => {
      const style = effectSpriteStyle(sprite({ background: 'red', animation: 'spin 1s linear' }), viewpoint());

      expect(style['background']).toBeUndefined();
      expect(style['animation']).toBeUndefined();
    });
  });

  describe('effectPaintStyle()', () => {
    it('carries the look and the animation, turning about the centre unless told otherwise', () => {
      expect(effectPaintStyle(sprite({ background: 'blue', animation: 'spin 1s linear' }))).toEqual({
        background: 'blue',
        animation: 'spin 1s linear',
        'transform-origin': '50% 50%',
      });
      expect(effectPaintStyle(sprite({ origin: '0 100%' }))['transform-origin']).toBe('0 100%');
    });

    it('writes none of the parts of the look the sprite leaves empty', () => {
      expect(effectPaintStyle(sprite())).toEqual({ 'transform-origin': '50% 50%' });
    });
  });
});

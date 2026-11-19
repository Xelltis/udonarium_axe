import { skyDomeAt } from '@axe/domain/tabletop/world/sky-dome';
import { skyLightAt } from '@axe/domain/tabletop/world/sky-light';

describe('the light of the sky over the table', () => {
  it('raises the sun in the east, stands it high in the south at noon, and sets it in the west', () => {
    const dawn = skyLightAt(0.25);
    const noon = skyLightAt(0.5);
    const dusk = skyLightAt(0.749);

    expect(dawn.direction.x).toBeCloseTo(1, 5);
    expect(dawn.direction.z).toBeCloseTo(0, 5);
    expect(noon.direction.y).toBeCloseTo(Math.cos(Math.PI / 3), 5);
    expect(noon.direction.z).toBeCloseTo(Math.sin(Math.PI / 3), 5);
    expect(dusk.direction.x).toBeLessThan(-0.99);
  });

  it('crosses the sky with the moon through the night, dimmer than the sun and bluer', () => {
    const midnight = skyLightAt(0);
    const noon = skyLightAt(0.5);

    expect(midnight.direction.z).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(midnight.strength).toBeLessThan(noon.strength);
    expect(midnight.colour).not.toBe(noon.colour);
  });

  it('warms the sun while it is low', () => {
    expect(skyLightAt(0.27).colour).not.toBe(skyLightAt(0.5).colour);
  });

  it('lights a table with no sky drawn over it in the colours it always was', () => {
    expect(skyLightAt(0.5)).toMatchObject({ colour: '#fff4e2', skyColour: '#ffffff' });
    expect(skyLightAt(0.27)).toMatchObject({ colour: '#ffb877', skyColour: '#ffffff' });
    expect(skyLightAt(0.73)).toMatchObject({ colour: '#ffb877', skyColour: '#ffffff' });
    expect(skyLightAt(0)).toMatchObject({ colour: '#c3d0ff', skyColour: '#e4e9ff', moonlit: 0 });
    expect(skyLightAt(0.75).colour).toBe('#c3d0ff');
  });

  describe('under the sky drawn over a table', () => {
    const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const green = (hex: string) => parseInt(hex.slice(3, 5), 16);
    const blue = (hex: string) => parseInt(hex.slice(5, 7), 16);
    const brightness = (hex: string) => red(hex) + green(hex) + blue(hex);

    it('warms the setting sun more than the rising one', () => {
      const rising = skyLightAt(0.27, true).colour;
      const setting = skyLightAt(0.73, true).colour;

      expect(red(setting) - blue(setting)).toBeGreaterThan(red(rising) - blue(rising));
    });

    it('lights the shade a little blue by day, pale as the sun rises, violet as it sets', () => {
      const hues = [0.5, 0.27, 0.73].map((time) => skyLightAt(time, true).skyColour);

      expect(new Set(hues).size).toBe(3);
      for (const hue of hues) expect(blue(hue)).toBeGreaterThan(red(hue));
    });

    it('keeps the setting sun’s light at the hour it sets', () => {
      const sunset = skyLightAt(0.75, true);

      expect(sunset.colour).toBe(skyLightAt(0.73, true).colour);
      expect(sunset.direction.x).toBeLessThan(-0.99);
    });

    it('lights the night by the moon, bluer and dimmer than the day, fading into it through the twilight', () => {
      const midnight = skyLightAt(0, true);
      const noon = skyLightAt(0.5, true);
      const dusk = skyLightAt(0.76, true);

      expect(brightness(midnight.skyColour)).toBeLessThan(brightness(noon.skyColour) * 0.85);
      expect(blue(midnight.skyColour) - red(midnight.skyColour)).toBeGreaterThan(
        blue(noon.skyColour) - red(noon.skyColour)
      );
      expect(dusk.skyColour).not.toBe(midnight.skyColour);
      expect(dusk.skyColour).not.toBe(skyLightAt(0.73, true).skyColour);
    });

    it('draws the night as by moonlight, coming on through the twilight, and never the day or a table with no sky', () => {
      expect(skyLightAt(0, true).moonlit).toBeGreaterThan(0.5);
      expect(skyLightAt(0.76, true).moonlit).toBeGreaterThan(0);
      expect(skyLightAt(0.76, true).moonlit).toBeLessThan(skyLightAt(0, true).moonlit);
      expect(skyLightAt(0.5, true).moonlit).toBe(0);
      expect(skyLightAt(0.75, true).moonlit).toBe(0);
      expect(skyLightAt(0).moonlit).toBe(0);
    });

    it('lights the twilight from where the sun went down and then from the moon, never jumping', () => {
      expect(skyLightAt(0.76, true).direction.x).toBeLessThan(-0.9);
      expect(skyLightAt(0.24, true).direction.x).toBeGreaterThan(0.9);
      expect(skyLightAt(0.79, true).direction).toEqual(skyLightAt(0.79).direction);
      let before = skyLightAt(0.7, true).strength;
      for (let step = 1; step <= 600; step++) {
        const strength = skyLightAt(0.7 + step / 6000, true).strength;
        expect(Math.abs(strength - before), `${0.7 + step / 6000}`).toBeLessThan(0.02);
        before = strength;
      }
    });

    it('brings the moonlight on as the sky drawn brings its stars out, at every hour', () => {
      const full = skyLightAt(0, true).moonlit;
      for (let step = 0; step < 200; step++) {
        const time = step / 200;
        expect(skyLightAt(time, true).moonlit).toBeCloseTo(skyDomeAt(time).stars * full, 2);
      }
    });
  });

  it('gives a level surface as much light at every hour, the sky making up what the sun does not', () => {
    for (const time of [0, 0.1, 0.25, 0.3, 0.5, 0.7, 0.75, 0.8, 0.99, 1.25, -0.5]) {
      for (const light of [skyLightAt(time), skyLightAt(time, true)]) {
        expect(light.skyStrength + light.strength * light.direction.z).toBeCloseTo(1, 10);
        expect(Math.hypot(light.direction.x, light.direction.y, light.direction.z)).toBeCloseTo(1, 10);
      }
    }
  });
});

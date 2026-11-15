import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { drawArcaneShot } from '@axe/domain/effect/scene/shot/arcane-shot';
import { drawArrowShot } from '@axe/domain/effect/scene/shot/arrow-shot';
import { drawCurseShot } from '@axe/domain/effect/scene/shot/curse-shot';
import { drawGunShot } from '@axe/domain/effect/scene/shot/gun-shot';
import { drawHolyShot } from '@axe/domain/effect/scene/shot/holy-shot';
import { drawCruiseShot, drawMissileShot } from '@axe/domain/effect/scene/shot/missile-shot';
import { shotLookOf, strikesByItself } from '@axe/domain/effect/scene/shot/shot-looks';
import { drawSniperShot } from '@axe/domain/effect/scene/shot/sniper-shot';
import { drawSpiritShot } from '@axe/domain/effect/scene/shot/spirit-shot';

function shotOf(projectileStyle: string, impactKind: string, tagName = '射撃'): EffectPreset {
  const preset = new EffectPreset('preset');
  preset.kind = 'projectile';
  preset.projectileStyle = projectileStyle;
  preset.tagName = tagName;
  preset.impactKind = impactKind;
  return preset;
}

describe('the look a shot is drawn whole by', () => {
  it('is that of its arrow, round, sniper or missile', () => {
    expect(shotLookOf(shotOf('arrow', 'impact'))).toBe(drawArrowShot);
    expect(shotLookOf(shotOf('bullet', 'rubble'))).toBe(drawGunShot);
    expect(shotLookOf(shotOf('tracer', 'impact'))).toBe(drawSniperShot);
    expect(shotLookOf(shotOf('missile', 'burst'))).toBe(drawMissileShot);
    expect(shotLookOf(shotOf('cruise', 'burst'))).toBe(drawCruiseShot);
  });

  it('is none for a crescent, a blaster or a meteor, which are drawn as they fly', () => {
    for (const look of ['crescent', 'blaster', 'meteor']) expect(shotLookOf(shotOf(look, 'impact'))).toBeNull();
  });

  it('is one of spirit, of a curse, of holy light or of plain magic for a bolt, as what it lands in and its family say', () => {
    expect(shotLookOf(shotOf('bolt', 'impact'))).toBe(drawSpiritShot);
    expect(shotLookOf(shotOf('bolt', 'miasma'))).toBe(drawCurseShot);
    expect(shotLookOf(shotOf('bolt', 'smite'))).toBe(drawHolyShot);
    expect(shotLookOf(shotOf('bolt', 'burst'))).toBe(drawArcaneShot);
  });

  it('is none for a bolt that lands in ice, which keeps the flight of a bolt of light', () => {
    expect(shotLookOf(shotOf('bolt', 'frost'))).toBeNull();
    expect(shotLookOf(shotOf('bolt', 'frost', '氷'))).toBeNull();
  });
});

describe('a shot that strikes by itself', () => {
  it('is an arrow or a round that lands in an impact or in rubble, and nothing that lands in a look of its own', () => {
    expect(strikesByItself(shotOf('arrow', 'impact'))).toBe(true);
    expect(strikesByItself(shotOf('bullet', 'rubble'))).toBe(true);
    expect(strikesByItself(shotOf('tracer', 'impact'))).toBe(true);
    expect(strikesByItself(shotOf('bullet', 'burst'))).toBe(false);
    expect(strikesByItself(shotOf('missile', 'impact'))).toBe(false);
    expect(strikesByItself(shotOf('bolt', 'impact'))).toBe(false);
  });
});

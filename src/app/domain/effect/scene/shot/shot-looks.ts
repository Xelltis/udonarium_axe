import type { EffectPreset } from '@axe/domain/effect/effect-preset';
import { type MagicShot, magicShotOf } from '@axe/domain/effect/magic-looks';
import { drawArcaneShot } from '@axe/domain/effect/scene/shot/arcane-shot';
import { drawArrowShot } from '@axe/domain/effect/scene/shot/arrow-shot';
import { drawCurseShot } from '@axe/domain/effect/scene/shot/curse-shot';
import { drawGunShot } from '@axe/domain/effect/scene/shot/gun-shot';
import { drawHolyShot } from '@axe/domain/effect/scene/shot/holy-shot';
import { drawCruiseShot, drawMissileShot } from '@axe/domain/effect/scene/shot/missile-shot';
import type { ShotLook } from '@axe/domain/effect/scene/shot/shot-flight';
import { drawSniperShot } from '@axe/domain/effect/scene/shot/sniper-shot';
import { drawSpiritShot } from '@axe/domain/effect/scene/shot/spirit-shot';

/*
 * Which looks of a shot are drawn whole, from the firing to what is left where it struck, by a look
 * of their own: an arrow, a round of a gun, a sniper's shot, a missile, and a bolt of no element,
 * which is of spirit, of a curse, of holy light or of plain magic. The shots of an element, a
 * blaster's bolt and a meteor have their own, chosen before these, and a bolt that lands in ice
 * keeps the flight of a bolt of light.
 */

const WHOLE: Readonly<Record<string, ShotLook>> = {
  arrow: drawArrowShot,
  bullet: drawGunShot,
  tracer: drawSniperShot,
  missile: drawMissileShot,
  cruise: drawCruiseShot,
};

/** The looks a bolt of no element is drawn whole by. */
const MAGIC: Readonly<Record<MagicShot, ShotLook>> = {
  spirit: drawSpiritShot,
  curse: drawCurseShot,
  holy: drawHolyShot,
  arcane: drawArcaneShot,
};

/** The looks that strike by themselves where they land in an impact or in rubble, leaving the ground to what they draw of it. */
const STRIKES_ITSELF: ReadonlySet<string> = new Set(['arrow', 'bullet', 'tracer']);
const STRUCK_GROUND: ReadonlySet<string> = new Set(['impact', 'rubble']);

/** What a bolt may land in that leaves it the flight of a bolt of light. */
const LIGHT_FLIGHT_LANDINGS: ReadonlySet<string> = new Set(['frost']);

/** The look that draws the whole of a shot of a preset, or null for one drawn as it flies and landed by another. */
export function shotLookOf(preset: EffectPreset): ShotLook | null {
  if (preset.projectileLook === 'bolt') {
    return LIGHT_FLIGHT_LANDINGS.has(preset.impactEffectKind) ? null : MAGIC[magicShotOf(preset)];
  }
  return WHOLE[preset.projectileLook] ?? null;
}

/**
 * Whether a shot draws its own landing: an arrow or a round that lands in an impact or in rubble
 * strikes as an arrow or a round does, sparks, chips and a pock in the ground, and not as the ground
 * stamped in or burst open.
 */
export function strikesByItself(preset: EffectPreset): boolean {
  return STRIKES_ITSELF.has(preset.projectileLook) && STRUCK_GROUND.has(preset.impactEffectKind);
}

import { BattleFighter } from '@axe/domain/battle/battle-scene';
import { resourceChangeSeverity } from '@axe/domain/character/resource-change';
import { autoEffectIdentifier } from '@axe/domain/effect/resource-effect-map';

/**
 * The built-in effect a blow is drawn with where neither the line nor the piece striking names
 * one: the same strike or healing light, by how hard it landed, that plays by itself when a
 * resource changes. A blow that moved nothing is drawn as a middling strike.
 */
export function defaultBlowEffectIdentifier(defenders: readonly BattleFighter[]): string {
  let hurt = false;
  let healed = false;
  let ratio = 0;
  for (const defender of defenders) {
    for (const gauge of defender.gauges) {
      const delta = gauge.after - gauge.before;
      if (delta === 0) continue;
      const worse = gauge.inverted ? delta > 0 : delta < 0;
      hurt ||= worse;
      healed ||= !worse;
      if (gauge.max > 0) ratio = Math.max(ratio, Math.abs(delta) / gauge.max);
    }
  }
  return autoEffectIdentifier(healed && !hurt ? 'heal' : 'damage', resourceChangeSeverity(ratio));
}

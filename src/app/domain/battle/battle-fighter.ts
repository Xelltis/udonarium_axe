import { FighterReading } from '@axe/domain/battle/battle-reading';
import { BattleFighter, BattleGauge, isBattleDefeat, MAX_BATTLE_GAUGES } from '@axe/domain/battle/battle-scene';

/** How a fighter going down is told, as the room sets it. */
export interface DefeatRule {
  enabled: boolean;
  /** The resource whose fall to nothing brings a fighter down, by name. */
  resource: string;
}

/**
 * A fighter for the stage out of two readings of the same piece, before the exchange and after it.
 *
 * It carries the resources shown as bars over the piece and then any other that moved, each in the
 * order the sheet reads them, at most eight. A resource that came or went between the readings is taken as it
 * reads where it is. It is brought down where the rule names a resource that fell to nothing
 * between the two; one already at nothing before stays standing, as a stage replayed over a body
 * would otherwise kill it again.
 */
export function fighterBetween(before: FighterReading, after: FighterReading, rule: DefeatRule): BattleFighter {
  const gauges: BattleGauge[] = [];
  const moved: BattleGauge[] = [];
  let defeated = false;

  for (const [identifier, now] of after.resources) {
    const then = before.resources.get(identifier) ?? now;
    const gauge: BattleGauge = {
      name: now.name,
      before: then.current,
      after: now.current,
      max: now.max,
      inverted: now.inverted,
      color: now.color,
    };
    if (now.bar) gauges.push(gauge);
    else if (gauge.before !== gauge.after) moved.push(gauge);

    if (rule.enabled && now.name.trim() === rule.resource.trim()) {
      defeated ||= isBattleDefeat(gauge.before, gauge.after, now.max, now.inverted);
    }
  }

  return {
    identifier: after.identifier,
    name: after.name,
    image: after.image,
    gauges: [...gauges, ...moved].slice(0, MAX_BATTLE_GAUGES),
    defeated,
    facing: after.facing,
  };
}

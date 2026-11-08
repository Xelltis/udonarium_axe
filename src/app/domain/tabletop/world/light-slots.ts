import type { SceneLight } from '@axe/domain/tabletop/vision-scene';

/** How much better a light has to be than one already throwing shadows before it takes that one's place. */
const TAKE_OVER = 1.25;

/**
 * How much a light is worth a slot of its own, seen from a point of the board: as much more the wider
 * it reaches and the nearer it stands, the reach squared over the distance squared. A light the point
 * stands within is reckoned as near as its own bright reach.
 */
export function lightSlotScore(
  light: Pick<SceneLight, 'x' | 'y' | 'brightPx' | 'dimPx'>,
  focus: { x: number; y: number }
): number {
  const reach = Math.max(light.dimPx, light.brightPx, 1);
  const distance = Math.max(Math.hypot(light.x - focus.x, light.y - focus.y), light.brightPx, 1);
  return (reach * reach) / (distance * distance);
}

/**
 * The lights that throw shadows of their own, at most `count` of them, chosen among the lights set to
 * throw shadows on the floor by how much each is worth a slot seen from `focus`. A light already
 * throwing shadows keeps its slot until another is worth a quarter as much again, so two lights worth
 * about the same do not take a slot from each other back and forth as the camera moves.
 *
 * Answered as the lights' identifiers, best first.
 */
export function lightSlotsOf(
  lights: readonly SceneLight[],
  focus: { x: number; y: number },
  count: number,
  held: readonly string[] = []
): string[] {
  if (count < 1) return [];
  const scored = lights
    .filter((light) => light.castShadows && light.surface === 'floor' && light.dimPx > 0)
    .map((light) => ({ id: light.sourceId, score: lightSlotScore(light, focus) }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept = scored.filter((light) => held.includes(light.id));
  const chosen = scored.slice(0, count);
  for (const keeper of kept) {
    if (chosen.some((light) => light.id === keeper.id)) continue;
    const weakest = chosen[chosen.length - 1];
    if (chosen.length < count) chosen.push(keeper);
    else if (weakest && !held.includes(weakest.id) && weakest.score < keeper.score * TAKE_OVER) {
      chosen[chosen.length - 1] = keeper;
    }
    chosen.sort((a, b) => b.score - a.score);
  }
  return chosen.map((light) => light.id);
}

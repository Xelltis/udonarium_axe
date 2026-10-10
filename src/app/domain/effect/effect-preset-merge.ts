import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { duplicatedEffectName } from '@axe/domain/effect/effect-preset-form';

/**
 * Taking an effect that came in and putting it into the shelf that is already there.
 *
 * Nothing is ever added beside what it is. An effect carries its identifier out and back,
 * so one handed on and handed back is the same effect and lands on itself. Where the
 * identifier is new to this table, the name decides: it is what a chat line calls, what a
 * character sheet points at and what the shelf is read by, so two of a name would be a
 * question nobody can answer.
 */
export type MergeOutcome = 'added' | 'updated';

/**
 * Settles an effect read in from a file against the shelf, and says whether it was added or
 * went onto one already there.
 *
 * An effect whose identifier is already on the shelf is overwritten with what came in, and
 * takes a numbered name if its name now belongs to another. Failing that, one of the same
 * name is overwritten and the incoming copy destroyed. Otherwise the incoming effect stays
 * as a new one.
 */
export function takeIntoLibrary(incoming: EffectPreset): MergeOutcome {
  const sameEffect = ObjectStore.instance.get<EffectPreset>(incoming.identifier);
  if (sameEffect instanceof EffectPreset && sameEffect !== incoming) {
    // It is the effect it left as, whatever it has been renamed to since.
    copyOnto(sameEffect, incoming);
    keepTheNameApart(sameEffect);
    return 'updated';
  }

  const name = incoming.name.trim();
  const sameName = EffectPreset.list().find(
    (preset) => preset.identifier !== incoming.identifier && preset.name.trim() === name
  );
  if (!sameName) return 'added';

  copyOnto(sameName, incoming);
  incoming.destroy();
  return 'updated';
}

/**
 * The values come across whole, so an effect gains everything the newer one has to give.
 *
 * They are moved as one rather than field by field: a run built of stages, or whatever is
 * added after it, travels without anybody remembering to add it here.
 */
/**
 * The name it brought back is only its own where nothing else answers to it.
 *
 * An effect renamed here, with something else given the name it left under, would come back
 * onto a name already spoken for. What was here holds the name and the one returning takes
 * a number, so a line calling that name still reaches what it always reached.
 */
function keepTheNameApart(preset: EffectPreset): void {
  const taken = EffectPreset.list()
    .filter((other) => other.identifier !== preset.identifier)
    .map((other) => other.name.trim());
  const name = duplicatedEffectName(preset.name, taken);
  if (name !== preset.name) preset.name = name;
}

function copyOnto(target: EffectPreset, source: EffectPreset): void {
  const context = source.toContext();
  target.apply({
    ...context,
    identifier: target.identifier,
    majorVersion: Math.max(context.majorVersion, target.majorVersion),
  });
  target.update();
}

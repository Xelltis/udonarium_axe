import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { DEFAULT_STAGE_MS, type EffectStage, type EffectStageRole, MAX_STAGES } from '@axe/domain/effect/effect-stage';
import { AIMED_EFFECT_KINDS, CENTERED_EFFECT_KINDS } from '@axe/domain/effect/effect-timeline';

/**
 * Building a run in the editor.
 *
 * Every change hands back a new list rather than altering the one it was given: the list
 * on the preset is written in one go, so a half-finished edit never reaches the table.
 *
 * A stage may only be filled with a look that suits its role. Anything else is a look
 * playing where it has no direction to run in, which draws nothing worth seeing.
 */

/** A burst is what an unknown look falls back to, so it is offered rather than left out. */
const LANDING_KINDS: readonly EffectKind[] = ['burst', ...CENTERED_EFFECT_KINDS.filter((kind) => kind !== 'burst')];

/** What travels needs somewhere to run from; what lands and what is left behind do not. */
export function kindsForRole(role: EffectStageRole): readonly EffectKind[] {
  return role === 'travel' ? AIMED_EFFECT_KINDS : LANDING_KINDS;
}

/** The look a new stage of this role starts with: a projectile to travel, flame for a field, a burst otherwise. */
export function defaultKindFor(role: EffectStageRole): EffectKind {
  return role === 'travel' ? 'projectile' : role === 'field' ? 'flame' : 'burst';
}

/**
 * Adds a stage of the given role to the end of the run, with that role's default look.
 *
 * A spawn starts out throwing three ways across 120 degrees, each landing in a burst. The run
 * is handed back unchanged once it already holds as many stages as it may.
 */
export function addStage(stages: readonly EffectStage[], role: EffectStageRole): EffectStage[] {
  if (stages.length >= MAX_STAGES) return [...stages];

  const stage: EffectStage = { role, kind: defaultKindFor(role), durationMs: DEFAULT_STAGE_MS };
  if (role === 'spawn') {
    stage.branches = 3;
    stage.spreadDeg = 120;
    stage.children = [{ role: 'impact', kind: 'burst', durationMs: DEFAULT_STAGE_MS }];
  }
  return [...stages, stage];
}

/** Takes one stage out of the run. An index outside the run leaves it unchanged. */
export function removeStage(stages: readonly EffectStage[], index: number): EffectStage[] {
  if (index < 0 || index >= stages.length) return [...stages];
  return stages.filter((_unused, at) => at !== index);
}

/** Moves one stage up or down the run, which is the order it happens in. */
export function moveStage(stages: readonly EffectStage[], index: number, offset: number): EffectStage[] {
  const to = index + offset;
  if (index < 0 || index >= stages.length || to < 0 || to >= stages.length) return [...stages];

  const moved = [...stages];
  const [stage] = moved.splice(index, 1);
  moved.splice(to, 0, stage);
  return moved;
}

/**
 * Changes one stage of the run by laying the given fields over it.
 *
 * A stage that stops being a spawn loses its branches, and one that becomes a spawn is given
 * the default three. A look that no longer suits the role is swapped for the role's default.
 * An index outside the run leaves it unchanged.
 */
export function updateStage(stages: readonly EffectStage[], index: number, patch: Partial<EffectStage>): EffectStage[] {
  if (index < 0 || index >= stages.length) return [...stages];

  return stages.map((stage, at) => {
    if (at !== index) return stage;
    const next = { ...stage, ...patch };
    // A stage that no longer throws keeps nothing of what it threw.
    if (next.role !== 'spawn') {
      delete next.branches;
      delete next.spreadDeg;
      delete next.children;
    } else if (!next.children || next.children.length < 1) {
      next.branches = next.branches ?? 3;
      next.spreadDeg = next.spreadDeg ?? 120;
      next.children = [{ role: 'impact', kind: 'burst', durationMs: DEFAULT_STAGE_MS }];
    }
    // The look has to suit the role, or it plays with nowhere to run.
    if (!kindsForRole(next.role).includes(next.kind)) next.kind = defaultKindFor(next.role);
    return next;
  });
}

/**
 * Adds a stage to the chain each branch of a spawn follows.
 *
 * Asking for a spawn adds a landing instead, since a branch may not throw again. Nothing
 * changes when the stage at the index is not a spawn.
 */
export function addBranchStage(stages: readonly EffectStage[], index: number, role: EffectStageRole): EffectStage[] {
  return withChildren(stages, index, (children) => addStage(children, role === 'spawn' ? 'impact' : role));
}

/** Takes one stage out of a spawn's branch chain. Nothing changes when the stage at the index is not a spawn. */
export function removeBranchStage(stages: readonly EffectStage[], index: number, branchIndex: number): EffectStage[] {
  return withChildren(stages, index, (children) => removeStage(children, branchIndex));
}

/**
 * Changes one stage of a spawn's branch chain by laying the given fields over it.
 *
 * Any role in the fields is ignored, so a branch stage keeps the role it has. Nothing changes
 * when the stage at the index is not a spawn.
 */
export function updateBranchStage(
  stages: readonly EffectStage[],
  index: number,
  branchIndex: number,
  patch: Partial<EffectStage>
): EffectStage[] {
  // A branch keeps the role it has: what it does is edited, what it is stays.
  const { role: _unusedRole, ...rest } = patch;
  return withChildren(stages, index, (children) => updateStage(children, branchIndex, rest));
}

/** A branch may not throw again, so what it does is edited without ever taking that role. */
function withChildren(
  stages: readonly EffectStage[],
  index: number,
  change: (children: EffectStage[]) => EffectStage[]
): EffectStage[] {
  if (index < 0 || index >= stages.length || stages[index].role !== 'spawn') return [...stages];

  return stages.map((stage, at) =>
    at === index ? { ...stage, children: change([...(stage.children ?? [])]) } : stage
  );
}

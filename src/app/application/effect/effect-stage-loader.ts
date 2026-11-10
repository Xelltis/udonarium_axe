import { InjectionToken } from '@angular/core';
import type { EffectStageModule } from '@axe/infrastructure/table-3d/table-3d-port';

/** Loads what makes small stages to play effects on, or gives null where it cannot be loaded. */
export type EffectStageLoader = () => Promise<EffectStageModule | null>;

/** Loads the module that makes small stages, which holds three.js and so is loaded only when one is wanted. */
function loadEffectStage(): Promise<EffectStageModule | null> {
  return import('@axe/infrastructure/table-3d/effect-stage').then(
    (stage: EffectStageModule) => stage,
    () => null
  );
}

/** How a preview loads what makes its small stage, which a spec gives a stand-in for. */
export const EFFECT_STAGE_LOADER = new InjectionToken<EffectStageLoader>('EFFECT_STAGE_LOADER', {
  providedIn: 'root',
  factory: () => loadEffectStage,
});

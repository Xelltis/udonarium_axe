import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelSharingSystem } from '@axe/core/storage/model-sharing-system';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';

/**
 * The marks that long-lived things keep of a timer they wait on: the timer's handle, held to say that
 * one is waiting already, and put back to nothing by the timer as it goes off.
 */
interface TimerFlags {
  /** The source that keeps the marks. */
  readonly source: string;
  /** The classes whose one instance, made once for the page, keeps them. */
  readonly keepers: readonly object[];
  readonly fields: readonly string[];
}

/**
 * Every mark of a waiting timer kept by something that lives on from one file to the next. A file's
 * timers are called off as it ends, and a timer called off never takes its mark down: the keeper
 * would go on believing one is waiting, and never set another, for every file after. So the marks
 * are taken down where the timers are called off, by {@link lowerTimerFlags}.
 *
 * `timer-flags.spec.ts` reads the sources for every mark of this kind kept outside what Angular
 * makes anew for each test, and holds this list and {@link TIMER_FLAGS_MADE_ANEW} to them.
 */
export const TIMER_FLAGS: readonly TimerFlags[] = [
  { source: 'src/app/core/sync/object-store.ts', keepers: [ObjectStore], fields: ['garbageSweepCooldown'] },
  {
    source: 'src/app/core/sync/object-synchronizer.ts',
    keepers: [ObjectSynchronizer],
    fields: ['firstSyncTimer', 'settledSendTimer'],
  },
  {
    source: 'src/app/core/storage/shared-asset-storage.ts',
    keepers: [ImageStorage, AudioStorage, ModelStorage],
    fields: ['pausedRetry'],
  },
  {
    source: 'src/app/core/storage/shared-asset-sharing-system.ts',
    keepers: [ImageSharingSystem, AudioSharingSystem, ModelSharingSystem],
    fields: ['firstSyncHoldTimer'],
  },
];

/**
 * The sources that keep such a mark in something made anew with what holds it, so that none lives on
 * past the test that set it: each with why.
 */
export const TIMER_FLAGS_MADE_ANEW: Readonly<Record<string, string>> = {
  'src/app/domain/dice/server-roll-requests.ts':
    'kept by the dice bot, which clears it as the store it is emptied from before every test lets go of it',
  'src/app/infrastructure/model-viewer/model-viewer.ts': 'kept by a viewer the component showing a model makes',
};

/** The one instance a class has made for the page, or nothing where it has made none yet. */
function instanceOf(keeper: object): Record<string, unknown> | undefined {
  return (keeper as { _instance?: Record<string, unknown> })._instance;
}

/**
 * Takes down every mark of a waiting timer kept across files, as the timers they stand for are called
 * off. An instance not made yet is left unmade.
 */
export function lowerTimerFlags(): void {
  for (const { keepers, fields } of TIMER_FLAGS) {
    for (const keeper of keepers) {
      const instance = instanceOf(keeper);
      if (instance) for (const field of fields) instance[field] = null;
    }
  }
}

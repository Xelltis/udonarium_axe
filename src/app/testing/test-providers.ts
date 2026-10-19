import { CLASS_SINGLETON_PROVIDERS } from '@axe/composition/class-provider';
import { CUT_IN_WINDOW_LOADER, type CutInWindowType } from '@axe/features/media/cut-in-window-loader';

/** A light stand-in for the cut-in window, which the specs open through a stubbed panel if at all. */
class StubCutInWindow {}

/**
 * Providers shared by the specs.
 * Used as TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] }).
 *
 * The cut-in window is not loaded for real: the screen asks for it as it starts, and loading it with
 * all it brings could outlast a spec, or time out on a busy worker and fail every cut-in spec.
 */
export const TEST_PROVIDERS = [
  ...CLASS_SINGLETON_PROVIDERS,
  { provide: CUT_IN_WINDOW_LOADER, useValue: () => Promise.resolve(StubCutInWindow as unknown as CutInWindowType) },
];

import { detectInitialLang } from '@axe/application/i18n/transloco.config';
import { refuseLocalStorage } from '@axe/testing/refused-storage';

describe('detectInitialLang()', () => {
  afterEach(() => vi.restoreAllMocks());

  it('goes by the browser’s own language where the browser refuses to say what was chosen before', () => {
    refuseLocalStorage();

    expect(['ja', 'ko', 'en']).toContain(detectInitialLang());
  });
});

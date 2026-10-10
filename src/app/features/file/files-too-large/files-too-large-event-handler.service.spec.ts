import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { emitFilesTooLarge } from '@axe/core/event/domain-events';
import { FilesTooLargeEventHandlerService } from '@axe/features/file/files-too-large/files-too-large-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FilesTooLargeEventHandlerService', () => {
  it('tells the reader at the foot of the screen which files were left out', () => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.inject(FilesTooLargeEventHandlerService);
    const t = TestBed.inject(TRANSLATE_FN);

    emitFilesTooLarge({ files: [{ name: 'long.ogg', kind: 'audio', limitBytes: 10 * 1024 * 1024 }] });

    const shown = TestBed.inject(SnackbarService).current()?.message;
    expect(shown).toBe(
      t('feature.file.tooLarge.one', {
        name: 'long.ogg',
        count: 0,
        limits: t('feature.file.tooLarge.audioLimit', { mb: 10 }),
      })
    );
    expect(shown).toContain('long.ogg');
  });
});

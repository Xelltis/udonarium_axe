import { TestBed } from '@angular/core/testing';
import { ReloadCheck } from '@axe/domain/peer/reload-check';

describe('ReloadCheck', () => {
  let reloadCheck: ReloadCheck;

  beforeEach(() => {
    TestBed.configureTestingModule({});

    reloadCheck = new ReloadCheck('ReloadCheck');
    (reloadCheck as unknown as Record<string, () => void>).createDataElements();
    reloadCheck.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('reloadCheckStart()', () => {
    it('allows the reload without asking while it is online', () => {
      reloadCheck.reloadCheckStart(true);
      expect(reloadCheck.isLoadOk()).toBe(true);
    });

    it('allows it, having asked, while it is offline', () => {
      reloadCheck.reloadCheckStart(false);
      expect(reloadCheck.isLoadOk()).toBe(true);
    });
  });

  describe('answerWithheldCheck()', () => {
    it('asks once for a load, in a room or out of one, and stops the rest of it when declined', () => {
      reloadCheck.reloadCheckStart(false);
      const confirm = vi.fn().mockReturnValue(false);
      window.confirm = confirm;

      expect(reloadCheck.answerWithheldCheck()).toBe(false);
      expect(reloadCheck.answerWithheldCheck()).toBe(false);

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(reloadCheck.isLoadOk()).toBe(false);
    });

    it('asks nothing more in a room once it is declined, the overwrite of the chat beside it included', () => {
      reloadCheck.reloadCheckStart(true);
      const confirm = vi.fn().mockReturnValue(false);
      window.confirm = confirm;

      reloadCheck.answerWithheldCheck();
      confirm.mockReturnValue(true);

      expect(reloadCheck.answerCheck()).toBe(false);
      expect(confirm).toHaveBeenCalledTimes(1);
    });

    it('asks afresh for the next load', () => {
      reloadCheck.reloadCheckStart(true);
      window.confirm = vi.fn().mockReturnValue(false);
      reloadCheck.answerWithheldCheck();
      reloadCheck.reloadCheckStart(true);
      window.confirm = vi.fn().mockReturnValue(true);

      expect(reloadCheck.answerWithheldCheck()).toBe(true);
    });
  });

  describe('answerCheck()', () => {
    it('allows it without asking offline', () => {
      reloadCheck.reloadCheckStart(false);
      expect(reloadCheck.answerCheck()).toBe(true);
    });

    it('asks first online', () => {
      reloadCheck.reloadCheckStart(true);
      window.confirm = vi.fn().mockReturnValue(true);
      expect(reloadCheck.answerCheck()).toBe(true);
      expect(window.confirm).toHaveBeenCalledOnce();
    });

    it('refuses it when the question is dismissed', () => {
      reloadCheck.reloadCheckStart(true);
      window.confirm = vi.fn().mockReturnValue(false);
      expect(reloadCheck.answerCheck()).toBe(false);
    });

    it('asks only once', () => {
      reloadCheck.reloadCheckStart(true);
      window.confirm = vi.fn().mockReturnValue(true);
      reloadCheck.answerCheck();
      reloadCheck.answerCheck();
      expect(window.confirm).toHaveBeenCalledOnce();
    });
  });

  describe('isLoadOk()', () => {
    it('is true to begin with', () => {
      expect(reloadCheck.isLoadOk()).toBe(true);
    });
  });
});

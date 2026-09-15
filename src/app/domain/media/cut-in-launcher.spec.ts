import { TestBed } from '@angular/core/testing';
import { soundOnlyCutIn$, stopCutInByBgm$ } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/index';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';

describe('CutInLauncher', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts with no cut-in to launch', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      expect(launcher.launchCutInIdentifier).toBe('');
    });

    it('starts with no launch time', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      expect(launcher.launchTimeStamp).toBe(0);
    });

    it('starts unlaunched', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      expect(launcher.launchIsStart).toBe(false);
    });

    it('starts addressed to nobody', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      expect(launcher.sendTo).toBe('');
    });
  });

  describe('getCutIns()', () => {
    it('lists the cut-ins in the store', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      const cutIn1 = new CutIn();
      cutIn1.initialize();
      const cutIn2 = new CutIn();
      cutIn2.initialize();

      const cutIns = launcher.getCutIns();
      expect(cutIns).toHaveLength(2);
    });

    it('returns nothing when there are none', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      expect(launcher.getCutIns()).toEqual([]);
    });
  });

  describe('startCutIn / stopCutIn', () => {
    it('names the cut-in to launch', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      launcher.startCutIn(cutIn);
      expect(launcher.launchCutInIdentifier).toBe(cutIn.identifier);
      expect(launcher.launchIsStart).toBe(true);
      expect(launcher.launchMySelf).toBe(false);
    });

    it('unlaunches it on a stop', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      launcher.stopCutIn(cutIn);
      expect(launcher.launchCutInIdentifier).toBe(cutIn.identifier);
      expect(launcher.launchIsStart).toBe(false);
    });

    it('marks a cut-in launched for yourself alone', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      launcher.startCutInMySelf(cutIn);
      expect(launcher.launchMySelf).toBe(true);
    });

    it('addresses the launch', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      launcher.startCutIn(cutIn, 'user-1');
      expect(launcher.sendTo).toBe('user-1');
    });
  });

  describe('sameTagCutIn()', () => {
    it('returns the cut-ins that share a tag', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      const cutIn1 = new CutIn();
      cutIn1.initialize();
      cutIn1.tagName = 'battle';

      const cutIn2 = new CutIn();
      cutIn2.initialize();
      cutIn2.tagName = 'battle';

      const cutIn3 = new CutIn();
      cutIn3.initialize();
      cutIn3.tagName = 'other';

      const same = launcher.sameTagCutIn(cutIn1);
      expect(same).toHaveLength(1);
      expect(same[0]).toBe(cutIn2);
    });
  });

  describe('launchTimeStamp', () => {
    it('counts up on a launch', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      expect(launcher.launchTimeStamp).toBe(0);
      launcher.startCutIn(cutIn);
      expect(launcher.launchTimeStamp).toBe(1);
      launcher.startCutIn(cutIn);
      expect(launcher.launchTimeStamp).toBe(2);
    });
  });

  // The uploaded music and the chat trigger are tested with the cut-in service.

  describe('stopBlankTagCutIn()', () => {
    it('counts the stamp up and says the music stopped the cut-ins', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      let emitted = false;
      const cleanup = stopCutInByBgm$.subscribe(() => {
        emitted = true;
      });

      expect(launcher.stopBlankTagCutInTimeStamp).toBe(0);
      launcher.stopBlankTagCutIn();
      expect(launcher.stopBlankTagCutInTimeStamp).toBe(1);
      expect(emitted).toBe(true);
      cleanup();
    });
  });

  describe('startSoundOnlyCutIn()', () => {
    it('names the sound-only cut-in and stamps it', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      const cutIn = new CutIn();
      cutIn.initialize();

      expect(launcher.soundOnlyTimeStamp).toBe(0);
      vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});
      launcher.startSoundOnlyCutIn(cutIn);

      expect(launcher.soundOnlyCutInIdentifier).toBe(cutIn.identifier);
      expect(launcher.soundOnlyTimeStamp).toBe(1);
    });

    it('takes an address when one is given', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});
      launcher.startSoundOnlyCutIn(cutIn, 'user-abc');

      expect(launcher.sendTo).toBe('user-abc');
    });

    it('leaves it empty when none is', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const cutIn = new CutIn();
      cutIn.initialize();

      vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});
      launcher.startSoundOnlyCutIn(cutIn);

      expect(launcher.sendTo).toBe('');
    });
  });

  describe('apply() — soundOnlyTimeStamp', () => {
    it('starts the sound here when the stamp changes', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      launcher.apply(launcher.toContext());

      const soundSpy = vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});

      const ctx = launcher.toContext();
      ctx.syncData = { ...ctx.syncData, soundOnlyTimeStamp: 1 };
      launcher.apply(ctx);

      expect(soundSpy).toHaveBeenCalledOnce();
    });

    it('starts nothing while the stamp stays the same', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      launcher.apply(launcher.toContext());

      const soundSpy = vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});

      const ctx = launcher.toContext();
      // the stamp is left alone
      launcher.apply(ctx);

      expect(soundSpy).not.toHaveBeenCalled();
    });

    it('still sounds at another end after a cut-in was last launched for somebody alone', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      launcher.apply(launcher.toContext());

      const soundSpy = vi.spyOn(launcher, 'startSelfSoundOnly').mockImplementation(() => {});

      const ctx = launcher.toContext();
      ctx.syncData = { ...ctx.syncData, launchMySelf: true, soundOnlyTimeStamp: 1 };
      launcher.apply(ctx);

      expect(soundSpy).toHaveBeenCalledOnce();
    });
  });

  describe('startSelfSoundOnly()', () => {
    it('emits the cut-in the identifier names', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      const cutIn = new CutIn();
      cutIn.initialize();
      launcher.soundOnlyCutInIdentifier = cutIn.identifier;

      let emitted: unknown = null;
      const cleanup = soundOnlyCutIn$.subscribe((e) => {
        emitted = e.cutIn;
      });

      launcher.startSelfSoundOnly();

      expect(emitted).toBe(cutIn);
      cleanup();
    });
  });

  describe('syncing between peers', () => {
    it('launches nothing on the first sync', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      const startSpy = vi.spyOn(launcher, 'startSelfCutIn');

      const context = launcher.toContext();
      context.syncData = { ...context.syncData, launchIsStart: true, launchTimeStamp: 1 };
      launcher.apply(context);

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('launches nothing at another peer for one meant for yourself', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      const initCtx = launcher.toContext();
      launcher.apply(initCtx);

      const startSpy = vi.spyOn(launcher, 'startSelfCutIn');

      const ctx2 = launcher.toContext();
      ctx2.syncData = {
        ...ctx2.syncData,
        launchMySelf: true,
        launchIsStart: true,
        launchTimeStamp: 1,
      };
      launcher.apply(ctx2);

      expect(startSpy).not.toHaveBeenCalled();
    });

    it('starts the cut-in here when the stamp changes on a launch', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      const initCtx = launcher.toContext();
      launcher.apply(initCtx);

      const startSpy = vi.spyOn(launcher, 'startSelfCutIn').mockImplementation(() => {});

      const cutIn = new CutIn();
      cutIn.initialize();

      const ctx2 = launcher.toContext();
      ctx2.syncData = {
        ...ctx2.syncData,
        launchCutInIdentifier: cutIn.identifier,
        launchIsStart: true,
        launchTimeStamp: 1,
      };
      launcher.apply(ctx2);

      expect(startSpy).toHaveBeenCalledOnce();
    });

    it('stops it here when the stamp changes on a stop', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      const initCtx = launcher.toContext();
      launcher.apply(initCtx);

      const stopSpy = vi.spyOn(launcher, 'stopSelfCutIn').mockImplementation(() => {});

      const cutIn = new CutIn();
      cutIn.initialize();

      const ctx2 = launcher.toContext();
      ctx2.syncData = {
        ...ctx2.syncData,
        launchCutInIdentifier: cutIn.identifier,
        launchIsStart: false,
        launchTimeStamp: 1,
      };
      launcher.apply(ctx2);

      expect(stopSpy).toHaveBeenCalledOnce();
    });

    it('launches nothing when it is addressed to somebody else', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      const initCtx = launcher.toContext();
      launcher.apply(initCtx);

      const startSpy = vi.spyOn(launcher, 'startSelfCutIn').mockImplementation(() => {});

      // addressed to another user
      const origUserId = Network.peerContext.userId;
      (Network.peerContext as { userId: string }).userId = 'my-user';

      const ctx2 = launcher.toContext();
      ctx2.syncData = {
        ...ctx2.syncData,
        sendTo: 'other-user',
        launchIsStart: true,
        launchTimeStamp: 1,
      };
      launcher.apply(ctx2);

      expect(startSpy).not.toHaveBeenCalled();
      (Network.peerContext as { userId: string }).userId = origUserId;
    });

    it('says the music stopped the cut-ins when that stamp changes', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();

      // the first sync is passed over
      const initCtx = launcher.toContext();
      launcher.apply(initCtx);

      let emitted = false;
      const cleanup = stopCutInByBgm$.subscribe(() => {
        emitted = true;
      });

      const ctx2 = launcher.toContext();
      ctx2.syncData = { ...ctx2.syncData, stopBlankTagCutInTimeStamp: 1 };
      launcher.apply(ctx2);

      expect(emitted).toBe(true);
      cleanup();
    });

    it('still says so after a cut-in was last launched for somebody alone', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      launcher.apply(launcher.toContext());

      let emitted = false;
      const cleanup = stopCutInByBgm$.subscribe(() => {
        emitted = true;
      });

      const ctx = launcher.toContext();
      ctx.syncData = { ...ctx.syncData, launchMySelf: true, stopBlankTagCutInTimeStamp: 1 };
      launcher.apply(ctx);

      expect(emitted).toBe(true);
      cleanup();
    });

    it('still launches at another peer once a launch for everyone follows one for somebody alone', () => {
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      launcher.apply(launcher.toContext());

      const startSpy = vi.spyOn(launcher, 'startSelfCutIn').mockImplementation(() => {});
      const mine = launcher.toContext();
      mine.syncData = { ...mine.syncData, launchMySelf: true, launchIsStart: true, launchTimeStamp: 1 };
      launcher.apply(mine);
      expect(startSpy).not.toHaveBeenCalled();

      const everyone = launcher.toContext();
      everyone.syncData = { ...everyone.syncData, launchMySelf: false, launchIsStart: true, launchTimeStamp: 2 };
      launcher.apply(everyone);

      expect(startSpy).toHaveBeenCalledOnce();
    });
  });
});

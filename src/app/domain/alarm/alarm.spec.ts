import { TestBed } from '@angular/core/testing';
import * as domainEvents from '@axe/core/event/domain-events';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { Alarm } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

describe('Alarm', () => {
  let alarm: Alarm;
  const savedMyCursor = PeerCursor.myCursor;

  beforeEach(() => {
    TestBed.configureTestingModule({});

    alarm = new Alarm();
    alarm.initialize();

    // Mock PeerCursor.myCursor
    PeerCursor.myCursor = { peerId: 'my-peer-id' } as PeerCursor;
  });

  afterEach(() => {
    PeerCursor.myCursor = savedMyCursor;
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('how it starts', () => {
    it('starts unstamped', () => {
      expect(alarm.initTimeStamp).toBe(0);
    });

    it('starts untitled', () => {
      expect(alarm.alarmTitle).toBe('');
    });

    it('starts asking nobody', () => {
      expect(alarm.targetPeerId).toEqual([]);
    });

    it('starts at no time', () => {
      expect(alarm.alarmTime).toBe(0);
    });

    it('starts unnumbered', () => {
      expect(alarm.alarmId).toBe(0);
    });

    it('starts with no peer', () => {
      expect(alarm.alarmPeerId).toBe('');
    });

    it('starts with no text', () => {
      expect(alarm.targetText).toBe('');
    });

    it('starts silent', () => {
      expect(alarm.isSound).toBe(false);
    });

    it('starts without a pop-up', () => {
      expect(alarm.isPopUp).toBe(false);
    });
  });

  describe('myPeer', () => {
    it('returns your own cursor', () => {
      expect(alarm.myPeer).toBe(PeerCursor.myCursor);
    });
  });

  describe('makeAlarm()', () => {
    it('takes every field', () => {
      alarm.makeAlarm(30, 'テストアラーム', ['peer-1', 'peer-2'], 'alarm-peer', '対象テキスト', true, true);

      expect(alarm.alarmTime).toBe(30);
      expect(alarm.alarmTitle).toBe('テストアラーム');
      expect(alarm.targetPeerId).toEqual(['peer-1', 'peer-2']);
      expect(alarm.alarmPeerId).toBe('alarm-peer');
      expect(alarm.targetText).toBe('対象テキスト');
      expect(alarm.isSound).toBe(true);
      expect(alarm.isPopUp).toBe(true);
    });

    it('counts the alarm up', () => {
      expect(alarm.alarmId).toBe(0);
      alarm.makeAlarm(10, 'a', [], '', '', false, false);
      expect(alarm.alarmId).toBe(1);
      alarm.makeAlarm(10, 'b', [], '', '', false, false);
      expect(alarm.alarmId).toBe(2);
    });

    it('stamps it with the moment it started', () => {
      const before = Date.now();
      alarm.makeAlarm(10, 'title', [], '', '', false, false);
      const after = Date.now();

      expect(alarm.initTimeStamp).toBeGreaterThanOrEqual(before);
      expect(alarm.initTimeStamp).toBeLessThanOrEqual(after);
    });

    it('takes both the sound and the pop-up switched off', () => {
      alarm.makeAlarm(5, 'quiet', ['peer-1'], 'ap', '', false, false);

      expect(alarm.isSound).toBe(false);
      expect(alarm.isPopUp).toBe(false);
    });
  });

  describe('chkToMe()', () => {
    it('is true when you are among those it is for', () => {
      alarm.targetPeerId = ['other-peer', 'my-peer-id'];
      expect(alarm.chkToMe()).toBe(true);
    });

    it('is false when you are not', () => {
      alarm.targetPeerId = ['other-peer', 'another-peer'];
      expect(alarm.chkToMe()).toBe(false);
    });

    it('is false when it is for nobody', () => {
      alarm.targetPeerId = [];
      expect(alarm.chkToMe()).toBe(false);
    });

    it('is true when it is for you alone', () => {
      alarm.targetPeerId = ['my-peer-id'];
      expect(alarm.chkToMe()).toBe(true);
    });
  });

  describe('startAlarm()', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('sets no timer when it is not for you', () => {
      alarm.targetPeerId = ['other-peer'];
      alarm.isSound = true;
      alarm.isPopUp = true;
      const timeUpEvents: domainEvents.AlarmTimeUpEvent[] = [];
      const popEvents: domainEvents.AlarmPopEvent[] = [];
      const cleanups = [
        domainEvents.alarmTimeUp$.subscribe((e) => timeUpEvents.push(e)),
        domainEvents.alarmPop$.subscribe((e) => popEvents.push(e)),
      ];

      alarm.startAlarm();
      vi.advanceTimersByTime(100000);

      expect(timeUpEvents).toHaveLength(0);
      expect(popEvents).toHaveLength(0);
      cleanups.forEach((off) => off());
    });

    it('sounds when the time is up, if it is set to', () => {
      alarm.targetPeerId = ['my-peer-id'];
      alarm.alarmTime = 5;
      alarm.alarmTitle = 'テスト';
      alarm.targetText = '対象';
      alarm.isSound = true;
      alarm.isPopUp = false;

      const timeUpEvents: domainEvents.AlarmTimeUpEvent[] = [];
      const sub = domainEvents.alarmTimeUp$.subscribe((e) => timeUpEvents.push(e));
      vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});
      vi.spyOn(AudioStorage, 'instance', 'get').mockReturnValue({ get: () => null } as unknown as AudioStorage);

      alarm.startAlarm();
      vi.advanceTimersByTime(5000);

      expect(timeUpEvents).toHaveLength(1);
      expect(timeUpEvents[0]).toEqual(expect.objectContaining({ text: expect.any(String) }));
      sub();
    });

    it('sounds through the notification channel', () => {
      alarm.targetPeerId = ['my-peer-id'];
      alarm.alarmTime = 1;
      alarm.isSound = true;
      alarm.isPopUp = false;
      const bell = { identifier: 'bell' };
      const play = vi.spyOn(AudioPlayer, 'play').mockImplementation(() => {});
      vi.spyOn(AudioStorage, 'instance', 'get').mockReturnValue({ get: () => bell } as unknown as AudioStorage);

      alarm.startAlarm();
      vi.advanceTimersByTime(1000);

      expect(play).toHaveBeenCalledWith(bell, 0.5, VolumeType.NOTIFICATION);
    });

    it('pops up then, if it is set to', () => {
      alarm.targetPeerId = ['my-peer-id'];
      alarm.alarmTime = 3;
      alarm.alarmTitle = 'ポップアップテスト';
      alarm.isSound = false;
      alarm.isPopUp = true;

      const popEvents: domainEvents.AlarmPopEvent[] = [];
      const sub = domainEvents.alarmPop$.subscribe((e) => popEvents.push(e));

      alarm.startAlarm();
      vi.advanceTimersByTime(3000);

      expect(popEvents).toHaveLength(1);
      expect(popEvents[0]).toEqual({ title: 'ポップアップテスト', time: 3 });
      sub();
    });

    it('runs after the time it was set for', () => {
      alarm.targetPeerId = ['my-peer-id'];
      alarm.alarmTime = 10;
      alarm.isSound = false;
      alarm.isPopUp = true;
      alarm.alarmTitle = 'タイミングテスト';

      const popEvents: domainEvents.AlarmPopEvent[] = [];
      const sub = domainEvents.alarmPop$.subscribe((e) => popEvents.push(e));

      alarm.startAlarm();

      // not a moment before
      vi.advanceTimersByTime(9999);
      expect(popEvents).toHaveLength(0);

      // and then it runs
      vi.advanceTimersByTime(1);
      expect(popEvents).toHaveLength(1);
      sub();
    });
  });

  describe('apply()', () => {
    it('starts the alarm when the stamp changes', () => {
      const startAlarmSpy = vi.spyOn(alarm, 'startAlarm').mockImplementation(() => {});
      alarm.initTimeStamp = 100;

      const context = alarm.toContext();
      context.syncData = { ...context.syncData, initTimeStamp: 200 };

      alarm.apply(context);

      expect(startAlarmSpy).toHaveBeenCalled();
    });

    it('starts none while it stays the same', () => {
      const startAlarmSpy = vi.spyOn(alarm, 'startAlarm').mockImplementation(() => {});
      alarm.initTimeStamp = 100;

      const context = alarm.toContext();
      // the stamp is left as it was

      alarm.apply(context);

      expect(startAlarmSpy).not.toHaveBeenCalled();
    });
  });
});

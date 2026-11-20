import { TestBed } from '@angular/core/testing';
import { AlarmService } from '@axe/application/alarm/alarm.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm, clampAlarmSeconds } from '@axe/domain/alarm/alarm';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('AlarmService', () => {
  let service: AlarmService;
  let alarm: Alarm;
  let said: ReturnType<typeof vi.fn>;

  const call = (seconds: number) => ({ title: ' 休憩 ', seconds, to: ['someone'], sound: false, popup: false });

  beforeEach(() => {
    said = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: { sendSystemMessageAsLastSpeaker: said } });
    service = TestBed.inject(AlarmService);
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.peerId = 'my-peer';
    PeerCursor.myCursor.role = PeerRole.Player;
    alarm = new Alarm('Alarm');
    alarm.initialize();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('sets the alarm for the seats given, its time held to an hour, and says so', () => {
    expect(service.set(call(9999))).toBeNull();

    expect([alarm.alarmTitle, alarm.alarmTime, alarm.targetPeerId, alarm.alarmPeerId]).toEqual([
      '休憩',
      3600,
      ['someone'],
      'my-peer',
    ]);
    expect(said).toHaveBeenCalledOnce();
  });

  it('sets none for nobody', () => {
    expect(service.set({ ...call(60), to: [] })).toBe('noSeat');
    expect(alarm.initTimeStamp).toBe(0);
  });

  it('lets a guest set none, among peers as on a room server', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    for (const authority of [null, '@authority']) {
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue(authority);
      expect(service.maySet()).toBe(false);
      expect(service.set(call(60))).toBe('guest');
    }

    expect(alarm.initTimeStamp).toBe(0);
    expect(said).not.toHaveBeenCalled();
  });
});

describe('clampAlarmSeconds', () => {
  it('holds a time to between none and an hour, and reads no number as none', () => {
    expect([-10, 0, 90, 3600, 9999, Number.NaN].map(clampAlarmSeconds)).toEqual([0, 0, 90, 3600, 3600, 0]);
  });
});

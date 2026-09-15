import { CatalogSendSchedule } from '@axe/core/storage/catalog-send-schedule';

describe('CatalogSendSchedule', () => {
  let sent: (string | undefined)[];
  let schedule: CatalogSendSchedule;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    sent = [];
    schedule = new CatalogSendSchedule((peer) => sent.push(peer));
  });

  afterEach(() => {
    schedule.cancel();
    vi.useRealTimers();
  });

  it('sends at once when asked to send now', () => {
    schedule.now('peer-a');

    expect(sent).toEqual(['peer-a']);
  });

  it('folds the waiting calls for one peer into one catalogue for that peer', () => {
    schedule.later(1000, 'peer-a');
    schedule.later(1000, 'peer-a');
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual(['peer-a']);
  });

  it('tells everyone when the waiting calls name different peers', () => {
    schedule.later(1000, 'peer-a');
    schedule.later(1000, 'peer-b');
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([undefined]);
  });

  it('sends a later waiting call to the peer that call names', () => {
    schedule.later(1000, 'peer-a');
    vi.advanceTimersByTime(1000);
    schedule.later(1000, 'peer-b');
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual(['peer-a', 'peer-b']);
  });

  it('still tells everyone later after telling one peer now', () => {
    schedule.later(1000);
    schedule.now('peer-a');
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual(['peer-a', undefined]);
  });

  it('lets a catalogue sent to everyone now stand in for the one waiting', () => {
    schedule.later(1000, 'peer-a');
    schedule.now();
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([undefined]);
  });

  it('sends the time after the first call, however many calls keep coming', () => {
    schedule.later(1000);
    vi.advanceTimersByTime(600);
    schedule.later(1000);
    vi.advanceTimersByTime(400);

    expect(sent).toEqual([undefined]);
  });

  it('sends nothing once the waiting catalogue is cancelled', () => {
    schedule.later(1000);
    schedule.cancel();
    vi.advanceTimersByTime(1000);

    expect(sent).toEqual([]);
  });

  describe('waiting for quiet', () => {
    it('sends once the calls have stopped for the given time', () => {
      schedule.whenQuiet(100);
      vi.advanceTimersByTime(60);
      schedule.whenQuiet(100);
      vi.advanceTimersByTime(60);

      expect(sent).toEqual([]);
      vi.advanceTimersByTime(40);
      expect(sent).toEqual([undefined]);
    });

    it('folds the calls for one peer into one catalogue for that peer', () => {
      schedule.whenQuiet(100, 'peer-a');
      schedule.whenQuiet(100, 'peer-a');
      vi.advanceTimersByTime(100);

      expect(sent).toEqual(['peer-a']);
    });

    it('tells everyone when it and a waiting call name different peers', () => {
      schedule.later(1000, 'peer-a');
      schedule.whenQuiet(100, 'peer-b');
      vi.advanceTimersByTime(100);

      expect(sent).toEqual([undefined]);
    });

    it('cannot hold back a catalogue a call for a set time is waiting on', () => {
      schedule.later(1000);
      for (let elapsed = 0; elapsed < 1500; elapsed += 50) {
        schedule.whenQuiet(100);
        vi.advanceTimersByTime(50);
      }

      expect(sent).toEqual([undefined]);
    });

    it('is not put back by a call for a set time', () => {
      schedule.whenQuiet(100);
      schedule.later(1000);
      vi.advanceTimersByTime(100);

      expect(sent).toEqual([undefined]);
    });

    it('still tells everyone once quiet after telling one peer now', () => {
      schedule.whenQuiet(100);
      schedule.now('peer-a');
      vi.advanceTimersByTime(100);

      expect(sent).toEqual(['peer-a', undefined]);
    });

    it('lets a catalogue sent to everyone now stand in for it', () => {
      schedule.whenQuiet(100, 'peer-a');
      schedule.now();
      vi.advanceTimersByTime(100);

      expect(sent).toEqual([undefined]);
    });
  });
});

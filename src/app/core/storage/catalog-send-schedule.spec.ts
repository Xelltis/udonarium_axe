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
});

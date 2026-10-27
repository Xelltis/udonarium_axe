import { CHANGE, COMING_BACK, DELETION, MAX_HELD_BROADCASTS } from '@axe/core/network/server/outbound-events';
import { AuthorityEvent, EventContext } from '@axe/core/network/server/server-protocol';
import { WrittenDeletions } from '@axe/core/network/server/written-deletions';

const AUTHORITY = 'authority-peer';

function event(eventName: string, data: unknown, sendFrom = 'me'): EventContext {
  return { eventName, data, sendFrom };
}

/** The authority handing an object back, under a parent where one is given. */
function handedBack(identifier: string, parentIdentifier = '', sendFrom = AUTHORITY): EventContext {
  return event(AuthorityEvent.AUTHORITATIVE, { identifier, syncData: { parentIdentifier } }, sendFrom);
}

describe('WrittenDeletions', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('takes back what the authority hands back of a deletion this link carried', () => {
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'tab' })]);

    expect([...deletions.takenBack([handedBack('tab'), handedBack('other')], AUTHORITY)]).toEqual(['tab']);
  });

  it('takes back what comes back under it, however deep', () => {
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'tab' })]);

    const taken = deletions.takenBack(
      [handedBack('tab'), handedBack('line', 'tab'), handedBack('word', 'line'), handedBack('elsewhere', 'table')],
      AUTHORITY
    );

    expect([...taken].sort()).toEqual(['line', 'tab', 'word']);
  });

  it('takes nothing back from anybody but the authority', () => {
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'tab' })]);

    expect(deletions.takenBack([handedBack('tab', '', 'another-peer')], AUTHORITY).size).toBe(0);
  });

  it('forgets a deletion that went through, by a change or a word on what comes back written after it', () => {
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'changed' }), event(DELETION, { identifier: 'restored' })]);
    deletions.note([event(CHANGE, { identifier: 'changed' }), event(COMING_BACK, { identifiers: ['restored'] })]);

    expect(deletions.takenBack([handedBack('changed'), handedBack('restored')], AUTHORITY).size).toBe(0);
  });

  it('forgets every note once cleared', () => {
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'tab' })]);
    deletions.clear();

    expect(deletions.takenBack([handedBack('tab')], AUTHORITY).size).toBe(0);
  });

  it('lets the notes older than a minute go once there are many', () => {
    vi.useFakeTimers();
    const deletions = new WrittenDeletions();
    deletions.note([event(DELETION, { identifier: 'old' })]);
    vi.advanceTimersByTime(61_000);
    deletions.note([event(DELETION, { identifier: 'recent' })]);
    expect(deletions.takenBack([handedBack('old')], AUTHORITY).size).toBe(1);

    deletions.note(
      Array.from({ length: MAX_HELD_BROADCASTS }, (_, index) => event(DELETION, { identifier: `line-${index}` }))
    );

    expect(deletions.takenBack([handedBack('old')], AUTHORITY).size).toBe(0);
    expect(deletions.takenBack([handedBack('recent')], AUTHORITY).size).toBe(1);
  });
});

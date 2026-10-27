import { CHANGE, COMING_BACK, DELETION, keptWhileAway, latestChanges } from '@axe/core/network/server/outbound-events';
import { AuthorityEvent, EventContext } from '@axe/core/network/server/server-protocol';

const AUTHORITY = 'authority-peer';

function event(eventName: string, data: unknown = null): EventContext {
  return { eventName, data, sendFrom: 'me' };
}

function change(identifier: string, x: number): EventContext {
  return event(CHANGE, { identifier, x });
}

describe('latestChanges', () => {
  it('keeps the last change of each object alone, at its place', () => {
    const kept = latestChanges([
      { to: undefined, events: [change('piece', 1), change('card', 1)] },
      { to: undefined, events: [change('piece', 2)] },
    ]);

    expect(kept).toEqual([
      { to: undefined, events: [change('card', 1)] },
      { to: undefined, events: [change('piece', 2)] },
    ]);
  });

  it('keeps a change made before a deletion or a word on what comes back ahead of it', () => {
    const deletion = event(DELETION, { identifier: 'deck' });
    const comingBack = event(COMING_BACK, { identifiers: ['deck'] });

    const kept = latestChanges([
      { to: undefined, events: [change('card', 1), deletion, change('card', 2), comingBack, change('card', 3)] },
    ]);

    expect(kept[0].events).toEqual([change('card', 1), deletion, change('card', 2), comingBack, change('card', 3)]);
  });

  it('leaves the batches handed to it as they were', () => {
    const batches = [{ to: undefined, events: [change('piece', 1), change('piece', 2)] }];

    latestChanges(batches);

    expect(batches[0].events).toHaveLength(2);
  });
});

describe('keptWhileAway', () => {
  const role = event(AuthorityEvent.ROLE_REQUEST);
  const roll = event('DICE_ROLL');
  const deletion = event(DELETION, { identifier: 'tab' });
  const chat = event('CHAT_MESSAGE');

  it('keeps the changes, deletions and words on what comes back sent to everybody', () => {
    const comingBack = event(COMING_BACK, { identifiers: ['tab'] });

    expect(keptWhileAway([change('piece', 1), deletion, comingBack, chat], undefined, AUTHORITY)).toEqual([
      change('piece', 1),
      deletion,
      comingBack,
    ]);
  });

  it('keeps a role change asked of the authority, and no roll', () => {
    expect(keptWhileAway([role, roll], AUTHORITY, AUTHORITY)).toEqual([role]);
  });

  it('keeps nothing sent to another peer alone', () => {
    expect(keptWhileAway([role, deletion], 'another-peer', AUTHORITY)).toEqual([]);
  });
});

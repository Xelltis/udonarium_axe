import {
  membersOfParty,
  membersWithoutParty,
  partyIdsOwnedBy,
  PartyMemberLike,
} from '@axe/domain/party/party-membership';
import { describe, expect, it } from 'vitest';

function member(owner: string, partyIdentifier: string): PartyMemberLike {
  return { owner, partyIdentifier };
}

describe('partyIdsOwnedBy', () => {
  it('returns the parties your characters belong to, once each', () => {
    const members = [member('u1', 'p1'), member('u1', 'p1'), member('u1', 'p2'), member('u2', 'p3')];

    expect(partyIdsOwnedBy(members, 'u1')).toEqual(['p1', 'p2']);
  });

  it('leaves out the unattached and somebody elses', () => {
    const members = [member('u1', ''), member('u2', 'p1')];

    expect(partyIdsOwnedBy(members, 'u1')).toEqual([]);
  });

  it('returns nothing without a user', () => {
    expect(partyIdsOwnedBy([member('', 'p1')], '')).toEqual([]);
  });

  it('counts a party that names you among its players, with no character of yours in it', () => {
    const parties = [
      { identifier: 'p1', playerIds: ['u1', 'u2'] },
      { identifier: 'p2', playerIds: ['u2'] },
    ];

    expect(partyIdsOwnedBy([member('u1', 'p3')], 'u1', parties)).toEqual(['p3', 'p1']);
    expect(partyIdsOwnedBy([], 'u1', parties)).toEqual(['p1']);
  });
});

describe('membersOfParty', () => {
  it('returns the members of one party alone', () => {
    const members = [member('u1', 'p1'), member('u2', 'p2'), member('u3', 'p1')];

    expect(membersOfParty(members, 'p1')).toEqual([member('u1', 'p1'), member('u3', 'p1')]);
  });

  it('returns nothing without a party', () => {
    expect(membersOfParty([member('u1', '')], '')).toEqual([]);
  });
});

describe('membersWithoutParty', () => {
  it('returns the unattached and those pointing at a party that is gone', () => {
    const orphan = member('u3', 'gone');
    const members = [member('u1', 'p1'), member('u2', ''), orphan];

    expect(membersWithoutParty(members, ['p1'])).toEqual([member('u2', ''), orphan]);
  });
});

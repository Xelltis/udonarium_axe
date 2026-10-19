import {
  clearIdentity,
  guestUserIdAfter,
  guestUserIdOf,
  loadIdentity,
  PersistedIdentity,
  saveIdentity,
} from '@axe/core/storage/identity-storage';

const sample: PersistedIdentity = {
  userId: '550e8400-e29b-41d4-a716-446655440000',
  roomId: 'ab1',
  roomName: 'Room',
  role: 'gm',
  roomRole: 'gm',
  reConnectPass: 'secret',
  roomKey: '0123456789abcdef0123456789abcdef',
  guestUserId: '',
  accountUserId: '',
};

describe('identity-storage', () => {
  afterEach(() => clearIdentity());

  it('round-trips a persisted identity', () => {
    saveIdentity(sample);
    expect(loadIdentity()).toEqual(sample);
  });

  it('returns null when nothing is stored', () => {
    clearIdentity();
    expect(loadIdentity()).toBeNull();
  });

  it('returns null for an entry without a userId', () => {
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify({ roomId: 'ab1' }));
    expect(loadIdentity()).toBeNull();
  });

  it('fills missing optional fields with empty strings', () => {
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify({ userId: 'u1' }));
    expect(loadIdentity()).toEqual({
      userId: 'u1',
      roomId: '',
      roomName: '',
      role: '',
      roomRole: '',
      reConnectPass: '',
      roomKey: '',
      guestUserId: '',
      accountUserId: '',
    });
  });

  it('reads a seat saved before the role held in the room was kept as holding the role it saved', () => {
    const { roomRole: _roomRole, ...saved } = sample;
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify({ ...saved, role: 'pl' }));

    expect(loadIdentity()?.roomRole).toBe('pl');
  });

  it('keeps the role held in the room apart from the one taken since', () => {
    saveIdentity({ ...sample, role: 'pl', roomRole: 'gm' });

    expect(loadIdentity()).toEqual(expect.objectContaining({ role: 'pl', roomRole: 'gm' }));
  });

  it('takes the role saved without the one held in the room as that, as it is saved from inside one', () => {
    const { roomRole: _roomRole, ...saved } = sample;
    saveIdentity({ ...saved, role: 'pl' });

    expect(loadIdentity()?.roomRole).toBe('pl');
  });

  it('reads a seat saved before rooms had keys as having none', () => {
    const { roomKey: _roomKey, ...saved } = sample;
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify(saved));

    expect(loadIdentity()?.roomKey).toBe('');
  });

  it('goes by the saved user id without a login, as it did before logins', () => {
    expect(guestUserIdOf(sample)).toBe(sample.userId);
  });

  it('never goes by an account’s user id without a login', () => {
    const loggedIn = { ...sample, userId: 'acct_1234', guestUserId: 'tab-own' };
    saveIdentity(loggedIn);

    expect(guestUserIdOf(loadIdentity())).toBe('tab-own');
    expect(guestUserIdOf({ ...loggedIn, guestUserId: '' })).toBe('');
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify({ ...loggedIn, guestUserId: 'acct_forged' }));
    expect(guestUserIdOf(loadIdentity())).toBe('');
  });

  it('keeps the guest id saved before when an account’s identity is saved without one', () => {
    saveIdentity({ ...sample, userId: 'tab-own' });
    saveIdentity({ userId: 'acct_1234', roomId: 'r', roomName: 'n', role: 'gm', reConnectPass: '' });

    expect(guestUserIdOf(loadIdentity())).toBe('tab-own');
  });

  it('never goes by the user id of an account without the prefix, once it is known as one', () => {
    const account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
    saveIdentity({ ...sample, userId: 'tab-own' });
    saveIdentity({ ...sample, userId: account, guestUserId: undefined, accountUserId: account });

    expect(guestUserIdOf(loadIdentity())).toBe('tab-own');

    // Logged out: whoever saves next names neither the guest id nor the account.
    saveIdentity({ ...sample, userId: account, guestUserId: undefined, accountUserId: undefined });
    expect(loadIdentity()?.accountUserId).toBe(account);
    expect(guestUserIdOf(loadIdentity())).toBe('tab-own');
  });

  it('drops a guest id that is the account’s, as a version before this one could save it', () => {
    const account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
    sessionStorage.setItem(
      'udonarium-axe.identity',
      JSON.stringify({ ...sample, userId: account, guestUserId: account, accountUserId: account })
    );

    expect(guestUserIdOf(loadIdentity())).toBe('');
    // Saved without the account, the logged-in one still keeps it from being the guest's.
    sessionStorage.setItem(
      'udonarium-axe.identity',
      JSON.stringify({ ...sample, userId: account, guestUserId: account })
    );
    expect(guestUserIdOf(loadIdentity(), account)).toBe('');
    expect(guestUserIdAfter(account, loadIdentity(), account)).toBe('');
  });

  it('takes the user id of an identity saved before the account was kept beside it as maybe an account’s', () => {
    const account = 'e0100553-8866-4924-8a4a-d4900ac59de5';
    const { accountUserId: _kept, ...saved } = { ...sample, userId: account, guestUserId: account };
    sessionStorage.setItem('udonarium-axe.identity', JSON.stringify(saved));

    expect(guestUserIdOf(loadIdentity())).toBe('');
  });

  it('returns null for corrupt JSON', () => {
    sessionStorage.setItem('udonarium-axe.identity', '{not json');
    expect(loadIdentity()).toBeNull();
  });
});

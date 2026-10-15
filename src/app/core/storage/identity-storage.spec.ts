import {
  clearIdentity,
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
  reConnectPass: 'secret',
  roomKey: '0123456789abcdef0123456789abcdef',
  guestUserId: '',
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
      reConnectPass: '',
      roomKey: '',
      guestUserId: '',
    });
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

  it('returns null for corrupt JSON', () => {
    sessionStorage.setItem('udonarium-axe.identity', '{not json');
    expect(loadIdentity()).toBeNull();
  });
});

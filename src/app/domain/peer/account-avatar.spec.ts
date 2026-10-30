import { isAccountAvatar } from '@axe/domain/peer/account-avatar';

describe('the avatar of an account', () => {
  it('tells an account’s avatar from a picture of the room', () => {
    expect(isAccountAvatar('https://cdn.discordapp.com/avatars/1/a.png')).toBe(true);
    expect(isAccountAvatar('a'.repeat(64))).toBe(false);
  });

  it('takes an identifier a peer sent as no string for no avatar, rather than failing on it', () => {
    expect(isAccountAvatar(123 as unknown as string)).toBe(false);
    expect(isAccountAvatar(undefined as unknown as string)).toBe(false);
  });
});

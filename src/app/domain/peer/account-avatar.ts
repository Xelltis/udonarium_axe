/** Where the pictures of the accounts a room server logs in with are kept: Discord's avatars. */
const ACCOUNT_AVATAR_PREFIX = 'https://cdn.discordapp.com/avatars/';

/**
 * Whether a picture is the avatar of an account a room server logs in with, which a cursor wears as
 * its icon from the login on. It is no picture of the room's, so it is kept out of every list the
 * room's pictures are picked from.
 */
export function isAccountAvatar(imageIdentifier: string): boolean {
  return typeof imageIdentifier === 'string' && imageIdentifier.startsWith(ACCOUNT_AVATAR_PREFIX);
}

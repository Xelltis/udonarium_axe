/** The names this computer answers to, the only ones the bridge serves a request by. */
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1'];

/**
 * Whether a request came by one of this computer's own names, its port and an IPv6 address's
 * brackets aside: a page that rebinds a name of its own to this computer comes by that name instead.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  const text = (host ?? '').trim().toLowerCase();
  const bracketed = /^\[([^\]]*)\](?::\d+)?$/.exec(text);
  // A bare IPv6 address carries no port: its colons are its own.
  const name = bracketed ? bracketed[1] : text.split(':').length > 2 ? text : text.replace(/:\d+$/, '');
  return LOOPBACK_HOSTS.includes(name);
}

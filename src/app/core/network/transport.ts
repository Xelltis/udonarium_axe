/**
 * How this deployment connects players: through SkyWay, where every browser talks to every other,
 * or through a room server that relays and keeps the table. It is chosen per deployment in
 * `assets/config.json`, never per room.
 */
export type Transport = 'skyway' | 'server';

/** The transport a config asks for. Anything but `"server"`, a missing key included, means SkyWay. */
export function transportOf(config: Readonly<Record<string, unknown>>): Transport {
  return config['transport'] === 'server' ? 'server' : 'skyway';
}

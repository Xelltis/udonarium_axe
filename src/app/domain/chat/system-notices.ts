/**
 * Where a room sends each kind of notice the system writes into its chat: where that kind always
 * went, a tab the room chose, or nowhere.
 *
 * A room that chose nothing sends every kind where it always went, so a room saved before there was
 * a choice reads as it did.
 */

/** The kinds of notice a room may send somewhere of its own choosing. */
export const SYSTEM_NOTICE_KINDS = [
  'round',
  'clock',
  'diceReveal',
  'trigger',
  'movement',
  'card',
  'bgm',
  'room',
] as const;
export type SystemNoticeKind = (typeof SYSTEM_NOTICE_KINDS)[number];

/** Where each kind always went, and goes while the room chooses nothing: the leftmost tab, or the system tab. */
export const DEFAULT_NOTICE_PLACE: Readonly<Record<SystemNoticeKind, 'main' | 'system'>> = {
  round: 'main',
  clock: 'main',
  diceReveal: 'main',
  trigger: 'main',
  movement: 'system',
  card: 'system',
  bgm: 'system',
  room: 'system',
};

/** The route of a kind the room sends nowhere. */
export const NOTICE_OFF = 'off';

/**
 * Where the room sends each kind it chose for, by kind: {@link NOTICE_OFF}, or a chat tab's
 * identifier. A kind not named goes where it always went. Kinds this version does not know are kept,
 * for the version that does.
 */
export type SystemNoticeRoutes = Readonly<Record<string, string>>;

/** The routes of a room that chose nothing. */
export const DEFAULT_SYSTEM_NOTICES: SystemNoticeRoutes = {};

let lastRead: { readonly held: string; readonly routes: SystemNoticeRoutes } | null = null;

/**
 * Reads the routes a room holds.
 *
 * Empty text is a room that chose nothing. Anything that is not routes, such as a damaged save,
 * reads the same way, and so does a route that is not text, so every notice still goes where it
 * always went.
 */
export function readSystemNotices(held: unknown): SystemNoticeRoutes {
  const text = `${held ?? ''}`;
  if (lastRead?.held === text) return lastRead.routes;
  const routes = parseSystemNotices(text);
  lastRead = { held: text, routes };
  return routes;
}

/** Writes routes the way {@link readSystemNotices} reads them, with empty for a room that chose nothing. */
export function writeSystemNotices(routes: SystemNoticeRoutes): string {
  const written = Object.fromEntries(Object.entries(routes).filter(([, route]) => route.length > 0));
  return Object.keys(written).length > 0 ? JSON.stringify(written) : '';
}

/** Where a kind is sent: {@link NOTICE_OFF}, a chat tab's identifier, or empty for where it always went. */
export function noticeRouteOf(routes: SystemNoticeRoutes, kind: SystemNoticeKind): string {
  return routes[kind] ?? '';
}

/** The routes with one kind sent somewhere else, or where it always went for an empty route. */
export function withNoticeRoute(routes: SystemNoticeRoutes, kind: SystemNoticeKind, route: string): SystemNoticeRoutes {
  const rest = Object.fromEntries(Object.entries(routes).filter(([named]) => named !== kind));
  return route.length > 0 ? { ...rest, [kind]: route } : rest;
}

function parseSystemNotices(text: string): SystemNoticeRoutes {
  if (text.length < 1) return DEFAULT_SYSTEM_NOTICES;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return DEFAULT_SYSTEM_NOTICES;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return DEFAULT_SYSTEM_NOTICES;
  return Object.fromEntries(
    Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0
    )
  );
}

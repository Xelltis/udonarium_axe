import { AgentToolError } from '@axe/core/agent/agent-error';

/** How many candidates an ambiguous name lists. */
const LISTED = 10;

/**
 * The one thing a reference names among some things: the thing with that id, else the one thing of
 * that name. Refuses a reference that names nothing, telling what kind of thing was looked for, or
 * names several, listing their ids to choose from.
 */
export function findOne<T>(
  things: readonly T[],
  reference: string,
  idOf: (thing: T) => string,
  nameOf: (thing: T) => string,
  kind: string
): T {
  const wanted = reference.trim();
  const byId = things.find((thing) => idOf(thing) === wanted);
  if (byId) return byId;
  const named = things.filter((thing) => nameOf(thing) === wanted);
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    const ids = named.slice(0, LISTED).map((thing) => idOf(thing));
    throw new AgentToolError(
      'ambiguous',
      `${named.length} ${kind}s are named ${wanted}: give one of their ids instead (${ids.join(', ')}).`
    );
  }
  throw new AgentToolError('not_found', `There is no ${kind} named ${wanted} that this seat can see.`);
}

/** The things whose name holds a text, every thing for no text, and at most a number of them. */
export function filterByName<T>(things: readonly T[], nameOf: (thing: T) => string, text: unknown, limit: number): T[] {
  const wanted = typeof text === 'string' ? text.trim().toLowerCase() : '';
  const found = wanted ? things.filter((thing) => nameOf(thing).toLowerCase().includes(wanted)) : [...things];
  return found.slice(0, limit);
}

/** A text argument, or the fallback where it was not given. */
export function textArg(args: Readonly<Record<string, unknown>>, name: string, fallback = ''): string {
  const value = args[name];
  return typeof value === 'string' ? value : fallback;
}

/** A number argument, or the fallback where it was not given. */
export function numberArg(args: Readonly<Record<string, unknown>>, name: string, fallback: number): number {
  const value = args[name];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

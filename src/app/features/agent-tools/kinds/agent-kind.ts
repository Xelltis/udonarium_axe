import type { AgentObjectSchema, AgentSchema } from '@axe/core/agent/agent-schema';
import type { AgentAccess } from '@axe/core/agent/agent-tools';

/** What a tool was called with. */
export type AgentArgs = Readonly<Record<string, unknown>>;

/**
 * One field of a kind of thing in the room as an AI reads and writes it: its name, what it holds, the
 * shape a value of it takes, and who may write it, as the screen lets whom change it (null for a field
 * only read). `read` answers what this seat is shown of it, and undefined where the field is kept
 * from this seat, which leaves it out; `put` writes a value its schema let through.
 */
export interface AgentKindField<T> {
  readonly name: string;
  readonly description: string;
  readonly schema: AgentSchema;
  readonly access: AgentAccess | null;
  read(object: T): unknown;
  put?(object: T, value: unknown): void;
  /**
   * Why this seat may not write this value into the field of this thing, where the screen holds it to
   * more than the access and the schema, as who a note is shown to is its owner's and the master's to
   * say, or a tag someone else locked is not one to file under; null where it may. Asked of every field
   * of a call before any is written, so a call refused writes nothing.
   */
  refuse?(object: T, value: unknown): string | null;
}

/**
 * Making a thing of a kind: who may, what else it takes besides the fields written into it after
 * (where on the table, from what), and the making itself, as the screen makes one.
 */
export interface AgentKindCreate<T> {
  readonly access: AgentAccess;
  readonly description: string;
  readonly input: AgentObjectSchema;
  make(args: AgentArgs): T;
  /**
   * Takes back a thing just made whose fields were then refused, before anyone came to it: apart from
   * taking one away (`AgentKindRemove`), which the screen may hold to rules a thing just made is not
   * under, as a piece is put out of play only from the graveyard. Left out, the thing is destroyed.
   */
  unmake?(object: T): void;
}

/** Taking a thing of a kind away: who may, and the taking itself, its tidying up included. */
export interface AgentKindRemove<T> {
  readonly access: AgentAccess;
  take(object: T): void;
}

/**
 * Something done to a thing of a kind that no field written does, as a card is turned over or a die
 * rolled, which the screen does by a hand of its own: who may, what it takes, and the doing, which
 * answers what came of it.
 */
export interface AgentKindAction<T> {
  readonly name: string;
  readonly description: string;
  readonly access: AgentAccess;
  readonly input: AgentObjectSchema;
  readonly destructive?: boolean;
  run(object: T, args: AgentArgs): unknown;
}

/**
 * A kind of thing in the room as the AI link's generic tools offer it: what it is, its fields, the
 * things of it this seat may come across, and whether and how one is made, taken away or acted on.
 * Each kind goes by the rules the screen holds it to, and does what it does through the services the
 * screen does, so a rule kept there holds here as well.
 */
export interface AgentKind<T> {
  /** The name it is synced under, as `@SyncObject` gives it. */
  readonly kind: string;
  readonly description: string;
  readonly fields: readonly AgentKindField<T>[];
  /** Every thing of the kind this seat may come across, as the screen lists them for it. */
  list(): readonly T[];
  /**
   * Why this seat may not change, take away or act on this thing, where the screen keeps it from the
   * seat, as a note whose words it is not shown is not its to write; null where it may.
   */
  refuse?(object: T): string | null;
  /**
   * What has to come in before fields are written into a thing of the kind, or one made with them
   * (null for one being made), as a picture's own size its kept aspect is worked out from; null where
   * nothing has to. The fields are written once it has, on the thing as it then stands.
   */
  ready?(object: T | null, fields: AgentArgs): Promise<unknown> | null;
  idOf(object: T): string;
  nameOf(object: T): string;
  readonly create?: AgentKindCreate<T>;
  readonly remove?: AgentKindRemove<T>;
  readonly actions?: readonly AgentKindAction<T>[];
}

/** A kind of any thing, as the tools hold them side by side. */
export type AnyAgentKind = AgentKind<never>;

/** Holds a kind of some thing among the kinds of every other. */
export function anyKind<T>(kind: AgentKind<T>): AnyAgentKind {
  return kind as unknown as AnyAgentKind;
}

/** The schema of an object holding the given properties, of which those named are required. */
export function objectInput(
  properties: Readonly<Record<string, AgentSchema>> = {},
  required: readonly string[] = []
): AgentObjectSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

/** A field of text, written by a seat with the access given. */
export function textField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  read: (object: T) => unknown,
  put?: (object: T, value: string) => void,
  maxLength = 10000
): AgentKindField<T> {
  return {
    name,
    description,
    schema: { type: 'string', maxLength },
    access,
    read,
    ...(put ? { put: (object: T, value: unknown) => put(object, value as string) } : {}),
  };
}

/** A field of a number between the bounds given, written by a seat with the access given. */
export function numberField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  bounds: { readonly minimum?: number; readonly maximum?: number; readonly integer?: boolean },
  read: (object: T) => unknown,
  put?: (object: T, value: number) => void
): AgentKindField<T> {
  return {
    name,
    description,
    schema: {
      type: bounds.integer ? 'integer' : 'number',
      ...(bounds.minimum !== undefined ? { minimum: bounds.minimum } : {}),
      ...(bounds.maximum !== undefined ? { maximum: bounds.maximum } : {}),
    },
    access,
    read,
    ...(put ? { put: (object: T, value: unknown) => put(object, value as number) } : {}),
  };
}

/** A field that is on or off, written by a seat with the access given. */
export function flagField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  read: (object: T) => unknown,
  put?: (object: T, value: boolean) => void
): AgentKindField<T> {
  return {
    name,
    description,
    schema: { type: 'boolean' },
    access,
    read,
    ...(put ? { put: (object: T, value: unknown) => put(object, value as boolean) } : {}),
  };
}

/** A field holding one of some words, written by a seat with the access given. */
export function choiceField<T, C extends string>(
  name: string,
  description: string,
  access: AgentAccess | null,
  choices: readonly C[],
  read: (object: T) => unknown,
  put?: (object: T, value: C) => void
): AgentKindField<T> {
  return {
    name,
    description,
    schema: { type: 'string', enum: choices },
    access,
    read,
    ...(put ? { put: (object: T, value: unknown) => put(object, value as C) } : {}),
  };
}

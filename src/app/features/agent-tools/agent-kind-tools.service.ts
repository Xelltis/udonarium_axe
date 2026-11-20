import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import type { AgentAccess } from '@axe/core/agent/agent-tools';
import { GameObject } from '@axe/core/sync/game-object';
import { filterByName, findOne, textArg } from '@axe/features/agent-tools/agent-lookup';
import type { AgentArgs, AgentKindField, AnyAgentKind } from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentKinds } from '@axe/features/agent-tools/kinds/agent-kinds.service';

/** How many things a list answers with when the AI names no limit. */
const LISTED = 100;

/** A thing of some kind, as the generic tools hand it about. */
type Thing = never;

/**
 * The AI link's generic tools, which reach every kind of thing in the room the same way: describe the
 * kinds, list and read the things of one, and make, change, take away and act on them. Each kind says
 * its fields, who may write each and what the screen lets be done (see `AgentKind`); the tool layer has
 * already held a tool that changes the room to a seat that may change it, and a part kept for the game
 * master is held to the master's seat here.
 */
@Injectable({ providedIn: 'root' })
export class AgentKindTools {
  private readonly kinds = inject(AgentKinds);
  private readonly permission = inject(RolePermissionService);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    describe_kinds: (args) => this.describe(textArg(args, 'kind')),
    list_objects: (args) => this.listObjects(args),
    get_object: (args) => {
      const kind = this.kind(args);
      return this.view(kind, this.thing(kind, textArg(args, 'id')));
    },
    create_object: (args, { signal }) => this.create(args, signal),
    change_object: (args, { signal }) => this.change(args, signal),
    remove_object: (args) => this.remove(args),
    act_on_object: (args) => this.act(args),
  };

  /** Every kind, or the one named, as the AI is told of it: its fields, and what may be done to it and by whom. */
  private describe(named: string): unknown {
    const kinds = named ? [this.kindNamed(named)] : this.kinds.all();
    return kinds.map((kind) => ({
      kind: kind.kind,
      description: kind.description,
      fields: kind.fields.map((field) => ({
        name: field.name,
        description: field.description,
        schema: field.schema,
        written_by: field.access === null ? 'nobody' : field.access,
      })),
      ...(kind.create
        ? { create: { by: kind.create.access, description: kind.create.description, options: kind.create.input } }
        : {}),
      ...(kind.remove ? { remove: { by: kind.remove.access } } : {}),
      actions: (kind.actions ?? []).map((action) => ({
        name: action.name,
        description: action.description,
        by: action.access,
        args: action.input,
        ...(action.destructive ? { destructive: true } : {}),
      })),
    }));
  }

  private listObjects(args: AgentArgs): unknown {
    const kind = this.kind(args);
    const limit = typeof args['limit'] === 'number' ? args['limit'] : LISTED;
    return filterByName(kind.list(), (thing) => kind.nameOf(thing), args['name'], limit).map((thing) => ({
      id: kind.idOf(thing),
      name: kind.nameOf(thing),
    }));
  }

  /**
   * Makes a thing of a kind with the fields given, once what the kind needs has come in (see
   * `AgentKind.ready`), and nothing where the call was given up meanwhile: at once where nothing has
   * to, so a call answers as it is made.
   */
  private create(args: AgentArgs, signal: AbortSignal): unknown {
    const kind = this.kind(args);
    const making = kind.create;
    if (!making) throw new AgentToolError('not_allowed', `A ${kind.kind} cannot be made here.`);
    this.allow(making.access, `make a ${kind.kind}`);
    const options = this.record(args['options']);
    this.check(making.input, options, 'options');
    const given = this.record(args['fields']);
    this.fieldsToPut(kind, given);
    const ready = kind.ready?.(null, given) ?? null;
    const now = () => this.createNow(kind, making, options, given);
    return ready ? this.afterReady(ready, signal, now) : now();
  }

  private createNow(
    kind: AnyAgentKind,
    making: NonNullable<AnyAgentKind['create']>,
    options: AgentArgs,
    given: AgentArgs
  ): unknown {
    const fields = this.fieldsToPut(kind, given);
    const made = GameObject.batch(() => making.make(options) as Thing);
    const refused = fields
      .map(({ field, value }) => field.refuse?.(made, value) ?? null)
      .find((reason) => reason !== null);
    const takeBack = () => {
      if (making.unmake) making.unmake(made);
      else (made as unknown as { destroy?: () => void }).destroy?.();
    };
    if (refused) {
      takeBack();
      throw new AgentToolError('not_allowed', refused);
    }
    const failed = this.putAll(made, fields);
    if (failed) {
      takeBack();
      throw new AgentToolError('failed', `Nothing was made: ${failed.field} could not be written: ${failed.why}`);
    }
    return this.view(kind, made);
  }

  /**
   * Writes the fields given into a thing, once what its kind needs has come in (see `AgentKind.ready`),
   * the thing found again then as it stands, and nothing where the call was given up meanwhile: at
   * once where nothing has to.
   */
  private change(args: AgentArgs, signal: AbortSignal): unknown {
    const kind = this.kind(args);
    const id = textArg(args, 'id');
    const given = this.record(args['fields']);
    const fields = this.fieldsToPut(kind, given);
    if (fields.length < 1) throw new AgentToolError('invalid_input', 'Give at least one field to change.');
    const ready = kind.ready?.(this.changeable(kind, id), given) ?? null;
    const now = () => this.changeNow(kind, id, given);
    return ready ? this.afterReady(ready, signal, now) : now();
  }

  /** Does what a call asked once what it waited on has come in, and nothing where the call was given up meanwhile. */
  private async afterReady(ready: Promise<unknown>, signal: AbortSignal, then: () => unknown): Promise<unknown> {
    await ready;
    if (signal.aborted) {
      throw new AgentToolError('timeout', 'The call was given up before anything was written; nothing was.');
    }
    return then();
  }

  private changeNow(kind: AnyAgentKind, id: string, given: AgentArgs): unknown {
    const thing = this.changeable(kind, id);
    const fields = this.fieldsToPut(kind, given);
    const refused = fields
      .map(({ field, value }) => field.refuse?.(thing, value) ?? null)
      .find((reason) => reason !== null);
    if (refused) throw new AgentToolError('not_allowed', refused);
    const failed = this.putAll(thing, fields);
    if (failed) {
      const before =
        failed.written.length > 0
          ? `${failed.written.join(', ')} ${failed.written.length > 1 ? 'were' : 'was'} written; `
          : '';
      throw new AgentToolError('failed', `${before}${failed.field} could not be written: ${failed.why}`);
    }
    return this.view(kind, thing);
  }

  /**
   * Writes every field given, in one batch. Every value was checked against its field before any is
   * written, so a field throwing as it is written is the field's own failure: nothing is written back,
   * as what a field reads is what the AI is shown rather than what is held (a rule in force, a name kept
   * hidden), and writing that back would change what was never asked. It stops at the field that
   * failed and answers it, why, and the fields written before it, for the caller to tell the AI as it
   * stands: a change as partly made, a thing made as taken back. Null where every field was written.
   */
  private putAll(
    thing: Thing,
    fields: readonly { field: AgentKindField<Thing>; value: unknown }[]
  ): { readonly field: string; readonly why: string; readonly written: readonly string[] } | null {
    const written: string[] = [];
    return GameObject.batch(() => {
      for (const { field, value } of fields) {
        try {
          field.put!(thing, value);
        } catch (reason) {
          return { field: field.name, why: reason instanceof Error ? reason.message : String(reason), written };
        }
        written.push(field.name);
      }
      return null;
    });
  }

  private remove(args: AgentArgs): unknown {
    const kind = this.kind(args);
    const removing = kind.remove;
    if (!removing) throw new AgentToolError('not_allowed', `A ${kind.kind} cannot be taken away here.`);
    this.allow(removing.access, `take a ${kind.kind} away`);
    const thing = this.changeable(kind, textArg(args, 'id'));
    const named = { id: kind.idOf(thing), name: kind.nameOf(thing) };
    removing.take(thing);
    return { removed: named };
  }

  private act(args: AgentArgs): unknown {
    const kind = this.kind(args);
    const wanted = textArg(args, 'action');
    const action = (kind.actions ?? []).find((each) => each.name === wanted);
    if (!action) {
      const known = (kind.actions ?? []).map((each) => each.name);
      throw new AgentToolError(
        'invalid_input',
        `A ${kind.kind} has no action called ${wanted}${known.length ? ` (it has ${known.join(', ')})` : ''}.`
      );
    }
    this.allow(action.access, `${action.name} a ${kind.kind}`);
    const actionArgs = this.record(args['args']);
    this.check(action.input, actionArgs, 'args');
    return action.run(this.changeable(kind, textArg(args, 'id')), actionArgs);
  }

  /** The thing an id names, where this seat may change it as the screen lets it (see `AgentKind.refuse`). */
  private changeable(kind: AnyAgentKind, id: string): Thing {
    const thing = this.thing(kind, id);
    const refused = kind.refuse?.(thing) ?? null;
    if (refused) throw new AgentToolError('not_allowed', refused);
    return thing;
  }

  /**
   * The fields to write and their values, each known to the kind, written by someone and by this
   * seat, and fitting its schema. Every field is checked before any is written, so a call that names
   * one wrongly changes nothing. They are written in the order the kind lists its fields, whatever
   * order they were given in, so a field others are worked out from, as a cut-in's picture is for its
   * kept aspect, is written before them.
   */
  private fieldsToPut(kind: AnyAgentKind, given: AgentArgs): { field: AgentKindField<Thing>; value: unknown }[] {
    const order = (name: string) => kind.fields.findIndex((each) => each.name === name);
    const entries = Object.entries(given).sort(([a], [b]) => order(a) - order(b));
    return entries.map(([name, value]) => {
      const field = kind.fields.find((each) => each.name === name);
      if (!field) {
        const known = kind.fields.map((each) => each.name).join(', ');
        throw new AgentToolError('invalid_input', `A ${kind.kind} has no field called ${name} (it has ${known}).`);
      }
      if (field.access === null || !field.put) {
        throw new AgentToolError('not_allowed', `The ${name} of a ${kind.kind} is only read.`);
      }
      this.allow(field.access, `write the ${name} of a ${kind.kind}`);
      this.check(field.schema, value, `fields.${name}`);
      return { field, value };
    });
  }

  /** Refuses what this seat may not do, where only the game master's seat may. */
  private allow(access: AgentAccess, doing: string): void {
    if (access === 'gm' && !this.permission.isGameMaster()) {
      throw new AgentToolError('not_allowed', `Only the game master's seat may ${doing}.`);
    }
  }

  private check(schema: Parameters<typeof checkAgentInput>[0], value: unknown, at: string): void {
    const problems = checkAgentInput(schema, value, at);
    if (problems.length > 0) throw new AgentToolError('invalid_input', problems.join('; '));
  }

  /** A thing of a kind as this seat reads it: its id and name, and every field it is shown. */
  private view(kind: AnyAgentKind, thing: Thing): Record<string, unknown> {
    const shown: Record<string, unknown> = { id: kind.idOf(thing), name: kind.nameOf(thing) };
    for (const field of kind.fields) {
      const value = field.read(thing);
      if (value !== undefined) shown[field.name] = value;
    }
    return shown;
  }

  /** The thing of a kind an id names among those this seat may come across; for a kind of one thing, that one. */
  private thing(kind: AnyAgentKind, id: string): Thing {
    const things = kind.list();
    if (!id && things.length === 1) return things[0];
    if (!id) throw new AgentToolError('invalid_input', `Give the id of the ${kind.kind}.`);
    return findOne(
      things,
      id,
      (thing) => kind.idOf(thing),
      (thing) => kind.nameOf(thing),
      kind.kind
    );
  }

  private kind(args: AgentArgs): AnyAgentKind {
    return this.kindNamed(textArg(args, 'kind'));
  }

  private kindNamed(name: string): AnyAgentKind {
    const kind = this.kinds.of(name);
    if (kind) return kind;
    throw new AgentToolError(
      'not_found',
      `There is no kind called ${name}. describe_kinds lists them (${this.kinds
        .all()
        .map((each) => each.kind)
        .join(', ')}).`
    );
  }

  private record(value: unknown): AgentArgs {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as AgentArgs) : {};
  }
}

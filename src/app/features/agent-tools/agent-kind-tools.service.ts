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
    create_object: (args) => this.create(args),
    change_object: (args) => this.change(args),
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

  private create(args: AgentArgs): unknown {
    const kind = this.kind(args);
    const making = kind.create;
    if (!making) throw new AgentToolError('not_allowed', `A ${kind.kind} cannot be made here.`);
    this.allow(making.access, `make a ${kind.kind}`);
    const options = this.record(args['options']);
    this.check(making.input, options, 'options');
    const fields = this.fieldsToPut(kind, this.record(args['fields']));
    const made = GameObject.batch(() => making.make(options) as Thing);
    const refused = fields.map(({ field }) => field.refuse?.(made) ?? null).find((reason) => reason !== null);
    if (refused) {
      kind.remove?.take(made);
      throw new AgentToolError('not_allowed', refused);
    }
    GameObject.batch(() => {
      for (const { field, value } of fields) field.put!(made, value);
    });
    return this.view(kind, made);
  }

  private change(args: AgentArgs): unknown {
    const kind = this.kind(args);
    const thing = this.changeable(kind, textArg(args, 'id'));
    const fields = this.fieldsToPut(kind, this.record(args['fields']));
    if (fields.length < 1) throw new AgentToolError('invalid_input', 'Give at least one field to change.');
    const refused = fields.map(({ field }) => field.refuse?.(thing) ?? null).find((reason) => reason !== null);
    if (refused) throw new AgentToolError('not_allowed', refused);
    GameObject.batch(() => {
      for (const { field, value } of fields) field.put!(thing, value);
    });
    return this.view(kind, thing);
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
   * one wrongly changes nothing.
   */
  private fieldsToPut(kind: AnyAgentKind, given: AgentArgs): { field: AgentKindField<Thing>; value: unknown }[] {
    return Object.entries(given).map(([name, value]) => {
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

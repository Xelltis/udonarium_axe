/**
 * The shapes an agent's tool takes its input in: the part of JSON Schema the tools need, so that the
 * same definition is handed to an AI as it is and checked here without a schema library.
 */
export type AgentSchema =
  AgentStringSchema | AgentNumberSchema | AgentBooleanSchema | AgentArraySchema | AgentObjectSchema;

export interface AgentStringSchema {
  readonly type: 'string';
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
}

export interface AgentNumberSchema {
  readonly type: 'number' | 'integer';
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
}

export interface AgentBooleanSchema {
  readonly type: 'boolean';
  readonly description?: string;
}

export interface AgentArraySchema {
  readonly type: 'array';
  readonly description?: string;
  readonly items: AgentSchema;
  readonly minItems?: number;
  readonly maxItems?: number;
}

export interface AgentObjectSchema {
  readonly type: 'object';
  readonly description?: string;
  readonly properties: Readonly<Record<string, AgentSchema>>;
  readonly required?: readonly string[];
  /**
   * False for every tool's own input, which refuses what it does not know rather than leaving it
   * unread; true only for an object whose keys a tool checks itself, as the fields of a kind of thing
   * are checked by that kind.
   */
  readonly additionalProperties?: boolean;
}

/**
 * What is wrong with a value against a schema, one line for each thing, each naming where it is:
 * none for a value that fits.
 */
export function checkAgentInput(schema: AgentSchema, value: unknown, at = 'input'): string[] {
  switch (schema.type) {
    case 'string':
      return checkString(schema, value, at);
    case 'number':
    case 'integer':
      return checkNumber(schema, value, at);
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${at} must be true or false`];
    case 'array':
      return checkArray(schema, value, at);
    case 'object':
      return checkObject(schema, value, at);
  }
}

function checkString(schema: AgentStringSchema, value: unknown, at: string): string[] {
  if (typeof value !== 'string') return [`${at} must be a string`];
  if (schema.enum && !schema.enum.includes(value)) return [`${at} must be one of ${schema.enum.join(', ')}`];
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    return [`${at} must be at least ${schema.minLength} characters long`];
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    return [`${at} must be at most ${schema.maxLength} characters long`];
  }
  return [];
}

function checkNumber(schema: AgentNumberSchema, value: unknown, at: string): string[] {
  if (typeof value !== 'number' || !Number.isFinite(value)) return [`${at} must be a number`];
  if (schema.type === 'integer' && !Number.isInteger(value)) return [`${at} must be a whole number`];
  if (schema.minimum !== undefined && value < schema.minimum) return [`${at} must be at least ${schema.minimum}`];
  if (schema.maximum !== undefined && value > schema.maximum) return [`${at} must be at most ${schema.maximum}`];
  return [];
}

function checkArray(schema: AgentArraySchema, value: unknown, at: string): string[] {
  if (!Array.isArray(value)) return [`${at} must be a list`];
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    return [`${at} must hold at least ${schema.minItems} items`];
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    return [`${at} must hold at most ${schema.maxItems} items`];
  }
  return value.flatMap((item, index) => checkAgentInput(schema.items, item, `${at}[${index}]`));
}

function checkObject(schema: AgentObjectSchema, value: unknown, at: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${at} must be an object`];
  const record = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const name of schema.required ?? []) {
    if (record[name] === undefined) problems.push(`${at}.${name} is required`);
  }
  for (const [name, item] of Object.entries(record)) {
    const inner = schema.properties[name];
    if (!inner) {
      if (schema.additionalProperties !== true) problems.push(`${at}.${name} is not known`);
      continue;
    }
    if (item === undefined) continue;
    problems.push(...checkAgentInput(inner, item, `${at}.${name}`));
  }
  return problems;
}

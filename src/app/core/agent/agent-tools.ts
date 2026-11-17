import type { AgentObjectSchema, AgentSchema } from '@axe/core/agent/agent-schema';

/**
 * What a tool needs of the seat it runs on: nothing but to be connected, leave to change the room,
 * or leave to change it and the seat of the game master.
 */
export type AgentAccess = 'read' | 'write' | 'gm';

/** A tool an AI can call on the table, as it is described to the AI and checked before it runs. */
export interface AgentToolDefinition {
  readonly name: string;
  /** A short name for people, as an MCP client lists it. */
  readonly title: string;
  /** What the tool does and returns, written for the AI that picks it. */
  readonly description: string;
  readonly access: AgentAccess;
  readonly input: AgentObjectSchema;
  /** Whether the tool takes something away that cannot be had back by calling another tool. */
  readonly destructive?: boolean;
}

const PIECE: AgentSchema = {
  type: 'string',
  description: 'A piece on the table: its id, or its name as this seat sees it.',
  minLength: 1,
};
const PIECES: AgentSchema = { type: 'array', items: PIECE, maxItems: 100 };
const COL: AgentSchema = {
  type: 'integer',
  description: 'Column of the square, counted from 1 at the west (left) edge of the table.',
  minimum: 1,
};
const ROW: AgentSchema = {
  type: 'integer',
  description: 'Row of the square, counted from 1 at the north (top) edge of the table.',
  minimum: 1,
};
const SQUARE: AgentSchema = {
  type: 'object',
  description: 'A square of the table.',
  properties: { col: COL, row: ROW },
  required: ['col', 'row'],
  additionalProperties: false,
};
const TAB: AgentSchema = {
  type: 'string',
  description: 'The chat tab, by name or id. Leave out for the tab this seat has open.',
};
const SPEAKER: AgentSchema = {
  type: 'string',
  description:
    'Who speaks: a piece whose sheet this seat may open (id or name), or "self" for the seat itself. Leave out for the seat.',
};

function input(properties: Record<string, AgentSchema>, required: readonly string[] = []): AgentObjectSchema {
  return { type: 'object', properties, required, additionalProperties: false };
}

/**
 * Every tool an AI can call on the table, in the order they are listed to it: reading the room,
 * speaking and rolling in chat, moving pieces and changing their sheets, and the game master's tools.
 */
export const AGENT_TOOLS: readonly AgentToolDefinition[] = [
  {
    name: 'get_room',
    title: 'Look at the room',
    access: 'read',
    description:
      'Describe the room as this seat sees it: the seat (name, role, and whether the AI may change things), ' +
      'the tables and the one in view (grid kind, size in squares, and the length of a square with its unit, ' +
      'null where the room counts in squares), ' +
      'the round and whose turn it is, the chat tabs and the dice system, and events_cursor: pass it to the first ' +
      'wait_for_events to miss nothing from now on. Call this first.',
    input: input({}),
  },
  {
    name: 'list_pieces',
    title: 'List the pieces',
    access: 'read',
    description:
      'List the pieces on the table in view that this seat can see: id, name, square (col, row), altitude, size, ' +
      'owner, whether it is an NPC, its resources (current and maximum), its buffs and whether it is targeted. ' +
      'A game master also sees the pieces hidden from players, marked as hidden.',
    input: input({
      name: { type: 'string', description: 'Only the pieces whose name holds this text.' },
    }),
  },
  {
    name: 'get_piece',
    title: 'Read a piece',
    access: 'read',
    description:
      "Read one piece in full: its sheet as a tree of named values, its buffs, and its chat palette (the piece's " +
      'own dice commands and lines, which are worth using when it acts).',
    input: input({ piece: PIECE }, ['piece']),
  },
  {
    name: 'get_turn_order',
    title: 'Read the turn order',
    access: 'read',
    description:
      'The order the pieces take their turns in, whose turn it is, the round, and which pieces have acted or are holding.',
    input: input({}),
  },
  {
    name: 'read_chat',
    title: 'Read the chat',
    access: 'read',
    description:
      'Read the lines of a chat tab, newest last: speaker, the seat that said it, whom a whisper is to, text, dice ' +
      'results with their detail, time, and whether an AI sent it (by_ai). Lines this seat may not read are left out.',
    input: input({
      tab: TAB,
      limit: { type: 'integer', description: 'How many lines, 50 if left out.', minimum: 1, maximum: 200 },
      before: { type: 'string', description: 'Only the lines before the line with this id, to read further back.' },
    }),
  },
  {
    name: 'list_assets',
    title: 'List what can be used',
    access: 'read',
    description:
      'List the things of one kind the room has, by name and id, to use with the other tools: effects, music (bgm), ' +
      "ambient sounds, sound effects, cut-ins, images, scenes, scenario texts (on the game master's seat only), " +
      'tables, ranges on the table in view, or the dice systems.',
    input: input(
      {
        kind: {
          type: 'string',
          enum: [
            'effects',
            'bgm',
            'ambient',
            'sound_effects',
            'cut_ins',
            'images',
            'scenes',
            'scenario_texts',
            'tables',
            'ranges',
            'dice_systems',
          ],
        },
        name: { type: 'string', description: 'Only the things whose name holds this text.' },
        limit: { type: 'integer', description: 'How many, 100 if left out.', minimum: 1, maximum: 500 },
      },
      ['kind']
    ),
  },
  {
    name: 'read_scenario_text',
    title: 'Read a scenario text',
    access: 'read',
    description:
      "Read one of the game master's scenario texts (see list_assets) before it is said: its title, folder and the " +
      "passage as written, in the chat syntax. Only on the game master's seat.",
    input: input({ text: { type: 'string', description: 'The scenario text, by name or id.', minLength: 1 } }, [
      'text',
    ]),
  },
  {
    name: 'wait_for_events',
    title: 'Wait for what happens',
    access: 'read',
    description:
      'Wait for things to happen in the room and return them: chat lines (dice results included), turns and rounds ' +
      'changing, pieces coming, going and moving (a move comes once, at the square it ended on), the table in view ' +
      'switching, and seats joining and leaving. Pass the cursor this returned last time to carry on from there; ' +
      'without one it starts from now. It returns as soon as anything happens, or empty once the time is up. ' +
      'Call it again and again to follow the session.',
    input: input({
      after: { type: 'string', description: 'The cursor the last call returned.' },
      timeout_seconds: {
        type: 'integer',
        description: 'How long to wait at most, 25 seconds if left out.',
        minimum: 1,
        maximum: 50,
      },
    }),
  },
  {
    name: 'send_chat',
    title: 'Say something in chat',
    access: 'write',
    description:
      'Send a chat line exactly as if it were typed into the chat box: dice commands roll, `:HP-3` changes a ' +
      'resource, `&name` adds a buff, `t:` aims at the targets, turn commands move the turn, `《effect》` fires an ' +
      'effect. A turn command goes on a line of its own. Read the axe://guide/chat-syntax resource for the whole ' +
      'syntax. Returns the line and any dice result; a result slower than 3 seconds comes in wait_for_events.',
    input: input(
      {
        text: { type: 'string', minLength: 1, maxLength: 2000 },
        as: SPEAKER,
        tab: TAB,
        to: {
          type: 'string',
          description:
            'Whisper to one seat only: that seat’s name, or the name of a piece it owns. A piece of this seat’s own is refused.',
          minLength: 1,
        },
      },
      ['text']
    ),
  },
  {
    name: 'roll_dice',
    title: 'Roll dice',
    access: 'write',
    description:
      'Roll a dice command of the dice system in use (for example `2d6+3`, `CC<=60`) and return the result. ' +
      'The roll is shown in chat like any other roll; a secret roll is seen only by the seat that rolled it. ' +
      'A command the dice system does not read as a roll is refused before anything is said.',
    input: input(
      {
        command: { type: 'string', minLength: 1, maxLength: 500 },
        as: SPEAKER,
        tab: TAB,
        secret: { type: 'boolean', description: 'Roll in secret.' },
      },
      ['command']
    ),
  },
  {
    name: 'move_piece',
    title: 'Move a piece',
    access: 'write',
    description:
      'Move a piece to a square, landing on the ground or what stands there as a drag would. Returns where it ended.',
    input: input(
      {
        piece: PIECE,
        col: COL,
        row: ROW,
        altitude: { type: 'number', description: 'How high above what it stands on, in squares.' },
      },
      ['piece', 'col', 'row']
    ),
  },
  {
    name: 'change_resource',
    title: 'Change a resource',
    access: 'write',
    description:
      'Raise, lower or set a resource of a piece (HP, MP and so on). Give either `by` or `to`. The change is written ' +
      'to chat as the controller writes it. Returns the value before and after. Refused for a piece whose sheet ' +
      'this seat may not open.',
    input: input(
      {
        piece: PIECE,
        name: { type: 'string', description: 'The name of the resource on the sheet.', minLength: 1 },
        by: { type: 'number', description: 'How much to add; negative to take away.' },
        to: { type: 'number', description: 'The value to set it to.' },
        part: {
          type: 'string',
          enum: ['current', 'maximum'],
          description: 'Which part of the resource, the current value if left out.',
        },
      },
      ['piece', 'name']
    ),
  },
  {
    name: 'set_sheet_value',
    title: 'Write on a sheet',
    access: 'write',
    description:
      'Write a value into a named item of a piece’s sheet. Numbers are written as text. Refused for a piece whose sheet this seat may not open.',
    input: input(
      {
        piece: PIECE,
        name: { type: 'string', description: 'The name of the item on the sheet.', minLength: 1 },
        value: { type: 'string', maxLength: 10000 },
      },
      ['piece', 'name', 'value']
    ),
  },
  {
    name: 'add_buff',
    title: 'Add a buff',
    access: 'write',
    description:
      'Put a buff on a piece for some rounds, with a short note of what it does. Refused for a piece that keeps its buffs from this seat.',
    input: input(
      {
        piece: PIECE,
        name: { type: 'string', minLength: 1, maxLength: 100 },
        note: { type: 'string', maxLength: 500 },
        rounds: { type: 'integer', description: 'How many rounds it lasts, 3 if left out.', minimum: 0, maximum: 999 },
      },
      ['piece', 'name']
    ),
  },
  {
    name: 'remove_buff',
    title: 'Remove a buff',
    access: 'write',
    description: 'Take a buff off a piece. Refused for a piece that keeps its buffs from this seat.',
    input: input({ piece: PIECE, name: { type: 'string', minLength: 1 } }, ['piece', 'name']),
  },
  {
    name: 'set_targets',
    title: 'Choose the targets',
    access: 'write',
    description:
      'Make these pieces the targets of this seat, in place of any before; an empty list clears them. ' +
      '`t:` in chat and effects aim at the targets.',
    input: input({ pieces: PIECES }, ['pieces']),
  },
  {
    name: 'advance_turn',
    title: 'Move the turn',
    access: 'write',
    description:
      'Move the turn order on: to the next piece or back, to a given piece, to the next round or back, or start over. ' +
      'next_round moves on even where pieces have not acted yet: check get_turn_order first. Returns the turn order.',
    input: input(
      {
        action: {
          type: 'string',
          enum: ['next', 'previous', 'to_piece', 'next_round', 'previous_round', 'reset'],
        },
        piece: { ...PIECE, description: 'For to_piece: the piece whose turn it becomes.' },
      },
      ['action']
    ),
  },
  {
    name: 'create_piece',
    title: 'Put a new piece on the table',
    access: 'write',
    description:
      'Put a new piece on the table in view at a square, with a picture from the images (see list_assets) and ' +
      'values for its sheet. A piece a game master puts is hidden from players until shown, as by hand.',
    input: input(
      {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        col: COL,
        row: ROW,
        image: { type: 'string', description: 'An image, by name or id.' },
        size: { type: 'number', description: 'How many squares wide, 1 if left out.', minimum: 0.5, maximum: 20 },
        npc: { type: 'boolean', description: 'Whether it is a non-player character.' },
        values: {
          type: 'array',
          description: 'Values to write on its sheet, by item name.',
          items: input({ name: { type: 'string', minLength: 1 }, value: { type: 'string' } }, ['name', 'value']),
          maxItems: 100,
        },
      },
      ['name', 'col', 'row']
    ),
  },
  {
    name: 'remove_piece',
    title: 'Take a piece off the table',
    access: 'write',
    destructive: true,
    description: 'Take a piece off the table into the shared inventory, from where it can be put back by hand.',
    input: input({ piece: PIECE }, ['piece']),
  },
  {
    name: 'fire_effect',
    title: 'Fire an effect',
    access: 'gm',
    description:
      'Fire an effect from the effects (see list_assets) for everyone to see: at pieces, or at a square. ' +
      'A caster, if given, is where it starts from.',
    input: input(
      {
        effect: { type: 'string', description: 'The effect, by name or id.', minLength: 1 },
        targets: PIECES,
        at: SQUARE,
        caster: PIECE,
      },
      ['effect']
    ),
  },
  {
    name: 'play_sound',
    title: 'Play a sound',
    access: 'gm',
    description:
      'Play music (bgm, in place of what plays), an ambient sound (alongside others) or a sound effect (once) for everyone.',
    input: input(
      {
        kind: { type: 'string', enum: ['bgm', 'ambient', 'sound_effect'] },
        sound: { type: 'string', description: 'The sound, by name or id.', minLength: 1 },
      },
      ['kind', 'sound']
    ),
  },
  {
    name: 'stop_sound',
    title: 'Stop a sound',
    access: 'gm',
    description: 'Stop the music, an ambient sound (or all of them), or everything.',
    input: input(
      {
        kind: { type: 'string', enum: ['bgm', 'ambient', 'all'] },
        sound: { type: 'string', description: 'For ambient: the one to stop. Leave out to stop them all.' },
      },
      ['kind']
    ),
  },
  {
    name: 'play_cut_in',
    title: 'Show a cut-in',
    access: 'gm',
    description: 'Show a cut-in (see list_assets) to everyone.',
    input: input({ cut_in: { type: 'string', description: 'The cut-in, by name or id.', minLength: 1 } }, ['cut_in']),
  },
  {
    name: 'stop_cut_in',
    title: 'Stop a cut-in',
    access: 'gm',
    description: 'Stop a cut-in that is showing, or every cut-in if none is named.',
    input: input({ cut_in: { type: 'string', description: 'The cut-in, by name or id.' } }),
  },
  {
    name: 'switch_table',
    title: 'Switch the table',
    access: 'gm',
    description:
      "Switch everyone to another table, starting the table's music and cut-in as the game master's switch does.",
    input: input({ table: { type: 'string', description: 'The table, by name or id.', minLength: 1 } }, ['table']),
  },
  {
    name: 'apply_scene',
    title: 'Set a scene',
    access: 'gm',
    description:
      'Set a scene (see list_assets): it switches the table, its look, sounds, cut-in, clock and opening text as the scene was made.',
    input: input({ scene: { type: 'string', description: 'The scene, by name or id.', minLength: 1 } }, ['scene']),
  },
  {
    name: 'send_scenario_text',
    title: 'Send a scenario text',
    access: 'gm',
    description: 'Send one of the scenario texts (see list_assets) to chat as it was written.',
    input: input(
      { text: { type: 'string', description: 'The scenario text, by name or id.', minLength: 1 }, tab: TAB },
      ['text']
    ),
  },
  {
    name: 'place_range',
    title: 'Place a range',
    access: 'gm',
    description:
      'Place a range on the table, flat or standing up as a solid, at a square or following a piece. Lengths are in ' +
      'squares. A column stands up any shape; a sphere needs a circle, a cone solid a cone, a beam a line. Returns its id.',
    input: input(
      {
        shape: {
          type: 'string',
          enum: ['circle', 'square', 'rhombus', 'triangle', 'pentagon', 'hexagon', 'line', 'cone'],
        },
        solid: { type: 'string', enum: ['flat', 'column', 'sphere', 'cone', 'beam'] },
        length: { type: 'number', minimum: 0.5, maximum: 100 },
        width: { type: 'number', description: 'For lines and cones.', minimum: 0.5, maximum: 100 },
        height: { type: 'number', description: 'For columns.', minimum: 0.1, maximum: 100 },
        at: SQUARE,
        follow: { ...PIECE, description: 'A piece the range follows about, starting where it stands.' },
        facing: { type: 'number', description: 'Which way it points, in degrees clockwise from north.' },
        pitch: { type: 'number', description: 'For cone and beam solids: degrees up, negative down.' },
        name: { type: 'string', maxLength: 100 },
        colour: { type: 'string', description: 'A CSS colour, such as #ff4040.' },
      },
      ['shape', 'length']
    ),
  },
  {
    name: 'remove_range',
    title: 'Remove a range',
    access: 'gm',
    destructive: true,
    description: 'Remove a range from the table (see list_assets with kind ranges).',
    input: input({ range: { type: 'string', description: 'The range, by name or id.', minLength: 1 } }, ['range']),
  },
];

/**
 * A short fingerprint of every tool's definition, which the tab and the bridge compare as they meet,
 * so that a tool is never run on a definition the two do not share, even where the version of the
 * talk was left as it was.
 */
export function agentToolsDigest(tools: readonly AgentToolDefinition[] = AGENT_TOOLS): string {
  const text = JSON.stringify(tools);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** A tool by its name, or null for a name no tool has. */
export function agentToolOf(name: string): AgentToolDefinition | null {
  return AGENT_TOOLS.find((tool) => tool.name === name) ?? null;
}

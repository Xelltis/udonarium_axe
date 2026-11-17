/**
 * What an AI is told about the table beside the tools: a few lines when it connects, the way to run a
 * session through the tools, and the chat syntax the chat line understands.
 */

/** The address the chat syntax is read at, as an MCP resource. */
export const CHAT_SYNTAX_GUIDE_URI = 'axe://guide/chat-syntax';

/** The name of the prompt that sets an AI to run a session. */
export const RUN_SESSION_PROMPT_NAME = 'run_session';

/** The address the same guide is read at, as an MCP resource, for a client that cannot open prompts. */
export const RUN_SESSION_GUIDE_URI = 'axe://guide/run-session';

/** Told to an AI as it connects, before it calls anything. */
export const AGENT_INSTRUCTIONS = [
  'Udonarium Axe is a table for tabletop role-playing games, shared by the people in a room.',
  'These tools act through one seat in the room, with what that seat may see and do.',
  'Call get_room first. Then call wait_for_events again and again to follow what the players do,',
  'and answer with send_chat, roll_dice and the other tools. Squares are counted from 1, col to the east and row to the south.',
  `To run a session as the game master, read ${RUN_SESSION_GUIDE_URI}.`,
  `The chat syntax (dice, resources, buffs, turns, effects) is at ${CHAT_SYNTAX_GUIDE_URI}.`,
].join(' ');

/** The prompt that sets an AI to run a session as the game master. */
export const RUN_SESSION_PROMPT = `You are the game master of a tabletop role-playing session held on Udonarium Axe.
The tools act through the seat you are connected to.

1. Call get_room to see the seat, the tables, the round and the dice system, and keep its events_cursor. If the seat may only read, say so and stop.
2. Call list_pieces and get_turn_order to learn who is on the table. Read get_piece for a piece before it acts: its chat palette holds its own dice commands.
3. Read the recent chat with read_chat to catch up.
4. Then loop: call wait_for_events with events_cursor at first and then with the cursor it last returned, read what the
   players said and rolled, and answer. A line with by_ai is your own; seat tells which person said a line.
   - Speak with send_chat, as an NPC by passing its name in "as". Keep each line short, as people at a table speak.
   - Roll with roll_dice, or in a send_chat line with the rest of the syntax.
   - Apply damage and healing with change_resource or ":HP-5" in chat, conditions with add_buff.
   - Move NPCs with move_piece. Move the turn on with advance_turn when a turn is done.
   - As the game master, set the mood with play_sound, play_cut_in, fire_effect and apply_scene.
5. Never decide what the players' characters do. Ask them, and wait for their answer with wait_for_events.

The chat syntax is at ${CHAT_SYNTAX_GUIDE_URI}.`;

/** The chat syntax, as a send_chat line is read. */
export const CHAT_SYNTAX_GUIDE = `# Chat syntax of Udonarium Axe

A send_chat line is read as if it were typed into the chat box. Several commands can share one line.

## Dice
- A command of the dice system in use rolls: \`2d6+1\`, \`1d100<=50\`. get_room tells the system.
- \`S\` in front rolls in secret: \`S2d6\`.

## Resources
Change the speaker's sheet values by name.
- \`:HP-5\` lowers HP by 5, \`:HP+1d6\` raises it by a roll, \`:MP=10\` sets it, \`:状態>毒\` writes text.
- \`:HP-3:MP-1\` does both.
- \`:HP^+10\` changes the maximum.
- \`L\` at the end keeps within the bounds (\`:HP+99L\`), \`Z\` stops at 0 (\`:HP-99Z\`).
- \`t:\` in front applies to the targets instead of the speaker: \`t:HP-8\`. \`s:\` hides the result.
- \`[k10]\` inside an expression rolls a system command first: \`t:HP-([k10]+5)\`.

## Buffs
- \`&猛攻撃\` adds a buff; \`&猛攻撃/攻撃+2/3\` with a note and 3 rounds (3 if left out).
- \`&!猛攻撃/命中/+/2/3\` raises 命中 by 2 for 3 rounds and puts it back after.
- \`&猛攻撃-\` removes it. \`&R+\` / \`&R-\` shifts every buff's rounds.
- \`t&\` in front applies to the targets.

## Turns (a line of their own)
- \`&T\` starts the speaker's turn, \`&TE\` ends the turn and passes it on, \`&TW\` holds, \`&TI\` steps in.
- \`&RS\` starts a round, \`&RB\` goes back a round, \`&RR\` starts over.
- Through send_chat a turn command is a line of its own. To move to the next round, use advance_turn: \`&RN\` may
  ask the person at the seat to confirm first.

## Values
- \`{name}\` is replaced by the speaker's sheet value or palette variable: \`2d6+{武器ボーナス}\`.
- \`{HP^}\` reads a maximum. \`t{防護}\` reads the target's value.

## Effects and cut-ins
- \`《name》\` fires an effect from the speaker at the targets: \`2d6+3 t:HP-10 《爆炎》\`.
- \`《vs》\` with a damage line shows a battle cut-in of the attack.
- A last word matching a cut-in's name shows it (if it may be started from chat); \`@name\` plays its sound only.

## Portraits
- \`@2\` or \`@笑顔\` at the end switches the speaker's portrait; \`@hide\` hides it.
`;

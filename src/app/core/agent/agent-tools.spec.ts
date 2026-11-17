import { AgentSchema, checkAgentInput } from '@axe/core/agent/agent-schema';
import { AGENT_TOOLS, agentToolOf, agentToolsDigest } from '@axe/core/agent/agent-tools';

/** Every schema in a schema, itself included. */
function schemasIn(schema: AgentSchema): AgentSchema[] {
  if (schema.type === 'object') return [schema, ...Object.values(schema.properties).flatMap(schemasIn)];
  if (schema.type === 'array') return [schema, ...schemasIn(schema.items)];
  return [schema];
}

describe('AGENT_TOOLS', () => {
  it('names each tool once, in snake case, with a title and a description', () => {
    const names = AGENT_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of AGENT_TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(tool.title.length).toBeGreaterThan(0);
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });

  it('asks only for what its input knows, and refuses anything else', () => {
    for (const tool of AGENT_TOOLS) {
      expect(tool.input.type).toBe('object');
      for (const name of tool.input.required ?? []) expect(Object.keys(tool.input.properties)).toContain(name);
      for (const schema of schemasIn(tool.input)) {
        if (schema.type === 'object') expect(schema.additionalProperties).toBe(false);
      }
    }
  });

  it('takes no input for the tools that need none, and checks what the others are given', () => {
    expect(checkAgentInput(agentToolOf('get_room')!.input, {})).toEqual([]);
    expect(checkAgentInput(agentToolOf('move_piece')!.input, { piece: 'ゴブリン', col: 3, row: 4 })).toEqual([]);
    expect(checkAgentInput(agentToolOf('move_piece')!.input, { piece: 'ゴブリン', col: 0 })).toEqual([
      'input.row is required',
      'input.col must be at least 1',
    ]);
  });

  it('keeps the tools that change nothing apart from those that change the room, and the master’s apart', () => {
    const reading = AGENT_TOOLS.filter((tool) => tool.access === 'read').map((tool) => tool.name);
    expect(reading).toEqual([
      'get_room',
      'list_pieces',
      'get_piece',
      'get_turn_order',
      'read_chat',
      'list_assets',
      'read_scenario_text',
      'wait_for_events',
    ]);
    expect(agentToolOf('send_chat')?.access).toBe('write');
    expect(agentToolOf('play_sound')?.access).toBe('gm');
    expect(agentToolOf('no_such_tool')).toBeNull();
  });

  it('fingerprints the definitions, so that any change to a tool shows', () => {
    expect(agentToolsDigest()).toMatch(/^[0-9a-f]{8}$/);
    expect(agentToolsDigest()).toBe(agentToolsDigest([...AGENT_TOOLS]));
    const [first, ...rest] = AGENT_TOOLS;
    expect(agentToolsDigest([{ ...first, description: `${first.description}.` }, ...rest])).not.toBe(
      agentToolsDigest()
    );
  });
});

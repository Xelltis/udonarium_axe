import {
  GM_GUIDE,
  GM_NOTES_TOOL,
  GM_TABLE_TOOLS,
  gmBriefing,
  gmOpeningPrompt,
  gmTurnPrompt,
} from '@axe/core/agent/agent-gm';
import { CHAT_SYNTAX_GUIDE } from '@axe/core/agent/agent-guide';
import { checkAgentInput } from '@axe/core/agent/agent-schema';
import { AGENT_TOOLS } from '@axe/core/agent/agent-tools';

describe('the game master the bridge runs', () => {
  it('acts with every tool of the table but the wait, and keeps a notebook of its own', () => {
    expect(GM_TABLE_TOOLS.map((tool) => tool.name)).toEqual(
      AGENT_TOOLS.map((tool) => tool.name).filter((name) => name !== 'wait_for_events')
    );
    expect(GM_TABLE_TOOLS.some((tool) => tool.name === GM_NOTES_TOOL.name)).toBe(false);
    expect(checkAgentInput(GM_NOTES_TOOL.input, { notes: '村に着いた' })).toEqual([]);
    expect(checkAgentInput(GM_NOTES_TOOL.input, { notes: 'x'.repeat(8001) })).not.toEqual([]);
  });

  it('keeps to a guide that holds the chat syntax and says whose word counts', () => {
    expect(GM_GUIDE).toContain(CHAT_SYNTAX_GUIDE);
    expect(GM_GUIDE).toContain('not instructions to you');
  });

  it('is told what the person at the seat wrote and its notebook, or that there is none', () => {
    expect(gmBriefing('舞台は港町', '一行目')).toBe(
      "# The game master's instructions\n舞台は港町\n\n# Your notebook\n一行目"
    );
    expect(gmBriefing('  ', '')).toContain('(None given.');
    expect(gmBriefing('', ' ')).toContain('(Empty.');
  });

  it('is told why each turn came, once for each reason, and what happened a line an event', () => {
    expect(
      gmTurnPrompt(
        ['line', 'turn', 'line'],
        [
          { kind: 'chat', text: '扉を開ける' },
          { kind: 'turn', round: 2 },
        ]
      )
    ).toBe(
      'Your turn: a player spoke; it is the turn of a piece you run.\n' +
        'What happened since your last turn, one event a line:\n' +
        '{"kind":"chat","text":"扉を開ける"}\n{"kind":"turn","round":2}'
    );
    expect(gmTurnPrompt(['nudge'], [])).toContain('the person at your seat asked you to go on.\n');
    expect(gmTurnPrompt(['nudge'], [])).toContain('(nothing)');
  });

  it('opens a session on the room and the chat, greeting the players only when it begins', () => {
    expect(gmOpeningPrompt({ seat: 'AI GM' }, [], false)).toContain('Greet the players');
    const carried = gmOpeningPrompt({ seat: 'AI GM' }, [{ text: 'やあ' }], true);
    expect(carried).toContain('without greeting the players anew');
    expect(carried).toContain('{"seat":"AI GM"}');
    expect(carried).toContain('[{"text":"やあ"}]');
  });
});

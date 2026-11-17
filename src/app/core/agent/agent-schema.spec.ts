import { AgentSchema, checkAgentInput } from '@axe/core/agent/agent-schema';

describe('checkAgentInput', () => {
  const move: AgentSchema = {
    type: 'object',
    properties: {
      piece: { type: 'string', minLength: 1 },
      col: { type: 'integer', minimum: 1 },
      kind: { type: 'string', enum: ['bgm', 'ambient'] },
      pieces: { type: 'array', items: { type: 'string' }, maxItems: 2 },
      secret: { type: 'boolean' },
    },
    required: ['piece', 'col'],
    additionalProperties: false,
  };

  it('finds nothing wrong with a value that fits', () => {
    expect(checkAgentInput(move, { piece: 'ゴブリン', col: 3, kind: 'bgm', pieces: ['a'], secret: false })).toEqual([]);
  });

  it('names what is missing, of the wrong kind, or not known', () => {
    expect(checkAgentInput(move, { col: 2.5, kind: 'loud', extra: 1, secret: 'yes' })).toEqual([
      'input.piece is required',
      'input.col must be a whole number',
      'input.kind must be one of bgm, ambient',
      'input.extra is not known',
      'input.secret must be true or false',
    ]);
  });

  it('checks the bounds of numbers, texts and lists, and each item of a list', () => {
    expect(checkAgentInput(move, { piece: '', col: 0, pieces: ['a', 'b', 'c'] })).toEqual([
      'input.piece must be at least 1 characters long',
      'input.col must be at least 1',
      'input.pieces must hold at most 2 items',
    ]);
    expect(checkAgentInput(move, { piece: 'x', col: 1, pieces: ['a', 2] })).toEqual([
      'input.pieces[1] must be a string',
    ]);
    expect(checkAgentInput({ type: 'number', maximum: 5 }, Number.NaN)).toEqual(['input must be a number']);
    expect(checkAgentInput({ type: 'number', maximum: 5 }, 6)).toEqual(['input must be at most 5']);
    expect(checkAgentInput({ type: 'string', maxLength: 2 }, 'abc')).toEqual([
      'input must be at most 2 characters long',
    ]);
    expect(checkAgentInput({ type: 'array', items: { type: 'string' }, minItems: 1 }, [])).toEqual([
      'input must hold at least 1 items',
    ]);
  });

  it('refuses something that is not an object, or a list, where one is wanted', () => {
    expect(checkAgentInput(move, null)).toEqual(['input must be an object']);
    expect(checkAgentInput(move, [])).toEqual(['input must be an object']);
    expect(checkAgentInput({ type: 'array', items: { type: 'string' } }, 'a')).toEqual(['input must be a list']);
  });
});

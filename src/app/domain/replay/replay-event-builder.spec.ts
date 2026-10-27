import type { ObjectContext } from '@axe/core/sync/game-object';
import { ReplayDetailLevel, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { REPLAY_BASELINE_GRACE_MS, ReplayEventBuilder, type ReplayRoom } from '@axe/domain/replay/replay-event-builder';
import { REPLAY_CAUGHT_UP_FLAG } from '@axe/domain/replay/replay-event-category';

const START = 1_000_000;

function update(identifier: string, attributes: Record<string, unknown>): ObjectContext {
  return {
    identifier,
    aliasName: 'character',
    majorVersion: 1,
    minorVersion: 0.5,
    syncData: { value: '', attributes },
  };
}

function at(x: number) {
  return update('c1', { location: { name: 'table', x, y: 0 }, posZ: 0 });
}

describe('ReplayEventBuilder', () => {
  let detailLevel: ReplayDetailLevel;
  let builder: ReplayEventBuilder;

  beforeEach(() => {
    detailLevel = ReplayDetailLevel.Full;
    const room: ReplayRoom = {
      get: () => null,
      authorityPeerId: () => '@server',
      selfPeerId: () => 'me',
      detailLevel: () => detailLevel,
    };
    builder = new ReplayEventBuilder(room);
    builder.begin(START, []);
  });

  it('leaves the board untouched by a message no recording keeps', () => {
    expect(builder.take('CURSOR_MOVE', {}, 'peer-a', START)).toEqual({ touched: false, step: null });
  });

  it('keeps out the room a peer catches up with in the first moments, but not what this browser brings', () => {
    expect(builder.take('UPDATE_GAME_OBJECT', at(0), 'peer-a', START + 100)).toEqual({ touched: true, step: null });

    const own = builder.take('UPDATE_GAME_OBJECT', update('c2', { posZ: 0 }), 'me', START + 100).step;
    expect(own?.event.kind).toBe(ReplayEventKind.ObjectCreate);
  });

  it('merges a run of moves into the event still being added to, and settles it when a new one begins', () => {
    builder.take('UPDATE_GAME_OBJECT', at(0), 'peer-a', START);
    const later = START + REPLAY_BASELINE_GRACE_MS;

    const first = builder.take('UPDATE_GAME_OBJECT', at(10), 'peer-a', later).step!;
    const second = builder.take('UPDATE_GAME_OBJECT', at(20), 'peer-a', later + 100).step!;
    const removal = builder.take(
      'DELETE_GAME_OBJECT',
      { identifier: 'c9', aliasName: 'character' },
      'peer-a',
      later + 200
    ).step!;

    expect(first).toMatchObject({ merged: false, settled: null });
    expect(second.merged).toBe(true);
    expect(second.event.seq).toBe(first.event.seq);
    expect(removal.merged === false && removal.settled).toBe(second.event);
    expect(builder.settle()).toBe(removal.event);
    expect(builder.settle()).toBeNull();
  });

  it('puts what the room server takes away of its own accord down to the board', () => {
    const step = builder.take('WITHDRAW_GAME_OBJECT', { identifier: 'c1' }, '@server', START).step!;

    expect(step.event.kind).toBe(ReplayEventKind.ObjectRemove);
    expect(step.event.detail[REPLAY_CAUGHT_UP_FLAG]).toBe(true);
  });

  it('adds nothing the detail kept leaves out, though the board was touched', () => {
    detailLevel = ReplayDetailLevel.ChatOnly;

    expect(builder.take('DELETE_GAME_OBJECT', { identifier: 'c1', aliasName: 'character' }, 'peer-a', START)).toEqual({
      touched: true,
      step: null,
    });
  });

  it('names whoever did something by their id when no cursor stands for them', () => {
    builder.take('DELETE_GAME_OBJECT', { identifier: 'c1', aliasName: 'character' }, 'peer-a', START);

    expect(builder.actorNameOf('peer-a')).toBe('peer-a');
    expect(builder.cast().actors.map((actor) => actor.peerId)).toEqual(['peer-a', 'me']);
  });
});

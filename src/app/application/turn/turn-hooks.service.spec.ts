import { TestBed } from '@angular/core/testing';
import { TurnHooksService } from '@axe/application/turn/turn-hooks.service';
import { Logger } from '@axe/core/logging/logger';

describe('TurnHooksService', () => {
  let hooks: TurnHooksService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    hooks = TestBed.inject(TurnHooksService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('runs every hook as a turn ends, until it is taken off', () => {
    const first = vi.fn();
    const second = vi.fn();
    const stop = hooks.onTurnEnd(first);
    hooks.onTurnEnd(second);

    hooks.turnEnded();
    stop();
    hooks.turnEnded();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('runs the rest when one hook throws', () => {
    vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    const after = vi.fn();
    hooks.onTurnEnd(() => {
      throw new Error('broken');
    });
    hooks.onTurnEnd(after);

    hooks.turnEnded();

    expect(after).toHaveBeenCalled();
  });

  it('runs every turn-start hook with the piece whose turn begins', () => {
    const hook = vi.fn();
    const stop = hooks.onTurnStart(hook);

    hooks.turnStarted('piece');
    stop();
    hooks.turnStarted('other');

    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith('piece');
  });
});

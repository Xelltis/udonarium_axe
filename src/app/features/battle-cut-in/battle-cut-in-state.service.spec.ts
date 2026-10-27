import { TestBed } from '@angular/core/testing';
import { BattleScene } from '@axe/domain/battle/battle-scene';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';

function scene(key: string): BattleScene {
  const fighter = (identifier: string) => ({ identifier, name: identifier, image: '', gauges: [], defeated: false });
  return {
    key,
    attackerSide: 'left',
    attacker: fighter('hero'),
    defenders: [fighter('goblin')],
    effect: '',
    defeatEffect: '',
    background: '',
    theme: 'fantasy',
    secret: false,
    seed: 1,
  };
}

describe('BattleCutInStateService', () => {
  let state: BattleCutInStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(BattleCutInStateService);
  });

  it('puts a scene on the stage and takes it off when it ends', () => {
    state.show(scene('a'));
    expect(state.active()).toBe(true);
    expect(state.current()?.scene.key).toBe('a');

    state.next();
    expect(state.active()).toBe(false);
  });

  it('plays a scene sent while another plays once that one ends', () => {
    state.show(scene('a'));
    state.show(scene('b'));

    expect(state.current()?.scene.key).toBe('a');
    state.next();
    expect(state.current()?.scene.key).toBe('b');
  });

  it('plays a scene heard twice once', () => {
    state.show(scene('a'));
    state.next();
    state.show(scene('a'));

    expect(state.active()).toBe(false);
  });

  it('numbers each playing, so the same stage starts over for the next scene', () => {
    state.show(scene('a'));
    const first = state.current()?.serial;
    state.show(scene('b'));
    state.next();

    expect(state.current()?.serial).not.toBe(first);
  });

  it('keeps only a few scenes waiting', () => {
    state.show(scene('playing'));
    for (const key of ['1', '2', '3', '4', '5', '6']) state.show(scene(key));

    const played: string[] = [];
    for (let step = 0; step < 6; step++) {
      state.next();
      const key = state.current()?.scene.key;
      if (key) played.push(key);
    }
    expect(played).toEqual(['1', '2', '3', '4']);
  });

  it('takes everything off at once', () => {
    state.show(scene('a'));
    state.show(scene('b'));
    state.clear();
    state.next();

    expect(state.active()).toBe(false);
  });
});

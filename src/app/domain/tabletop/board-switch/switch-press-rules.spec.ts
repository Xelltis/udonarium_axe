import { PeerRole } from '@axe/domain/peer/peer-role';
import { defaultSwitchDefinition, SwitchDefinition } from '@axe/domain/tabletop/board-switch/switch-definition';
import { pressRefusal, SwitchPressState } from '@axe/domain/tabletop/board-switch/switch-press-rules';

describe('pressRefusal', () => {
  const speaks: SwitchDefinition = {
    ...defaultSwitchDefinition(),
    actions: [{ kind: 'say', text: 'creak', delayMs: 0, extra: {} }],
  };
  const plays: SwitchDefinition = {
    ...defaultSwitchDefinition(),
    actions: [{ kind: 'sound', name: 'bell', delayMs: 0, extra: {} }],
  };
  const openTab = { plCanView: true, plCanSpeak: true, guestCanView: true, guestCanSpeak: true };

  function state(change: Partial<SwitchPressState>): SwitchPressState {
    return { definition: speaks, role: PeerRole.Player, tab: openTab, retired: false, ...change };
  }

  it('lets a player press a switch that speaks into a tab they may speak in', () => {
    expect(pressRefusal(state({}))).toBeNull();
  });

  it('turns away a switch with nothing in it, or one taken off the table', () => {
    expect(pressRefusal(state({ definition: defaultSwitchDefinition() }))).toBe('nothing');
    expect(pressRefusal(state({ retired: true }))).toBe('retired');
  });

  it('turns a watcher away unless the switch is left open to watchers', () => {
    expect(pressRefusal(state({ role: PeerRole.Guest }))).toBe('watching');
    expect(pressRefusal(state({ role: PeerRole.Guest, definition: { ...speaks, guests: true } }))).toBeNull();
  });

  it('holds a switch that speaks to the tab it speaks into', () => {
    expect(pressRefusal(state({ tab: { ...openTab, plCanSpeak: false } }))).toBe('cannotSpeak');
    expect(pressRefusal(state({ tab: null }))).toBe('cannotSpeak');
    expect(pressRefusal(state({ role: PeerRole.GameMaster, tab: { ...openTab, isSystemTab: true } }))).toBe(
      'cannotSpeak'
    );
    expect(
      pressRefusal(
        state({
          role: PeerRole.Guest,
          definition: { ...speaks, guests: true },
          tab: { ...openTab, guestCanSpeak: false },
        })
      )
    ).toBe('cannotSpeak');
  });

  it('turns away a press where the switch has none left for the presser, bar a trial', () => {
    expect(pressRefusal(state({ hasGo: false }))).toBe('spent');
    expect(pressRefusal(state({ hasGo: false, role: PeerRole.GameMaster }))).toBe('spent');
    expect(pressRefusal(state({ hasGo: false, trial: true }))).toBeNull();
  });

  it('holds a player to where the switch has to be reached and seen from, but not the master', () => {
    const reached = { ...speaks, range: 2 };
    expect(pressRefusal(state({ definition: reached, reach: 'near' }))).toBeNull();
    expect(pressRefusal(state({ definition: reached, reach: 'tooFar' }))).toBe('tooFar');
    expect(pressRefusal(state({ definition: reached, reach: 'noPiece' }))).toBe('noPiece');
    expect(pressRefusal(state({ definition: reached, reach: 'tooFar', role: PeerRole.GameMaster }))).toBeNull();

    const seen = { ...speaks, needsSight: true };
    expect(pressRefusal(state({ definition: seen, inSight: false }))).toBe('unseen');
    expect(pressRefusal(state({ definition: seen, inSight: true }))).toBeNull();
    expect(pressRefusal(state({ definition: seen, inSight: false, role: PeerRole.GameMaster }))).toBeNull();
  });

  it('asks nothing of the tab for a switch that only plays something', () => {
    expect(pressRefusal(state({ definition: plays, tab: null }))).toBeNull();
  });
});

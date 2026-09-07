import { ReplayDetailLevel, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  interpretObjectChange,
  interpretObjectRemove,
  interpretSignal,
  isIgnoredReplayEvent,
  isRecordableKind,
  shouldDiffObjectChange,
} from '@axe/domain/replay/replay-interpreter';

describe('isIgnoredReplayEvent()', () => {
  it('throws away the noise of the cursors and the heartbeats', () => {
    expect(isIgnoredReplayEvent('CURSOR_MOVE')).toBe(true);
    expect(isIgnoredReplayEvent('HEART_BEAT')).toBe(true);
    expect(isIgnoredReplayEvent('WRITING_A_MESSAGE')).toBe(true);
  });

  it('throws away the syncing and the file transfers', () => {
    expect(isIgnoredReplayEvent('SYNCHRONIZE_GAME_OBJECT')).toBe(true);
    expect(isIgnoredReplayEvent('FILE_SEND_CHUNK_abc')).toBe(true);
    expect(isIgnoredReplayEvent('CANCEL_TASK_abc')).toBe(true);
  });

  it('throws away nothing worth recording', () => {
    expect(isIgnoredReplayEvent('UPDATE_GAME_OBJECT')).toBe(false);
    expect(isIgnoredReplayEvent('ROLL_DICE_SYMBOL')).toBe(false);
  });
});

describe('isRecordableKind()', () => {
  it('keeps the chat and the markers alone at the narrowest setting', () => {
    expect(isRecordableKind(ReplayEventKind.ChatMessage, ReplayDetailLevel.ChatOnly)).toBe(true);
    expect(isRecordableKind(ReplayEventKind.Marker, ReplayDetailLevel.ChatOnly)).toBe(true);
    expect(isRecordableKind(ReplayEventKind.ObjectMove, ReplayDetailLevel.ChatOnly)).toBe(false);
  });

  it('drops only the smallest changes at the middle one', () => {
    expect(isRecordableKind(ReplayEventKind.ObjectMove, ReplayDetailLevel.Notable)).toBe(true);
    expect(isRecordableKind(ReplayEventKind.ObjectUpdate, ReplayDetailLevel.Notable)).toBe(false);
  });

  it('keeps everything at the widest', () => {
    expect(isRecordableKind(ReplayEventKind.ObjectUpdate, ReplayDetailLevel.Full)).toBe(true);
  });
});

describe('interpretObjectChange()', () => {
  it('returns nothing when nothing changed', () => {
    const data = { location: { name: 'table', x: 0, y: 0 }, posZ: 0 };
    expect(
      interpretObjectChange({ aliasName: 'character', identifier: 'c1', before: data, after: structuredClone(data) })
    ).toBeNull();
  });

  it('reads a change of position as a move', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { location: { name: 'table', x: 0, y: 0 }, posZ: 0 } },
      after: { attributes: { location: { name: 'table', x: 100, y: 50 }, posZ: 30 } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectMove);
    expect(draft?.targetIdentifier).toBe('c1');
    expect(draft?.detail['from']).toEqual({ name: 'table', x: 0, y: 0, z: 0 });
    expect(draft?.detail['to']).toEqual({ name: 'table', x: 100, y: 50, z: 30 });
  });

  it('gives that move a patch holding the values either side', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { location: { name: 'table', x: 0, y: 0 }, posZ: 0 } },
      after: { attributes: { location: { name: 'table', x: 100, y: 0 }, posZ: 0 } },
    });
    expect(draft?.patch).toEqual({
      identifier: 'c1',
      aliasName: 'character',
      before: { 'attributes.location': { name: 'table', x: 0, y: 0 } },
      after: { 'attributes.location': { name: 'table', x: 100, y: 0 } },
    });
  });

  it('keeps the surface through a move across a wall', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { location: { name: 'table', x: 0, y: 0 }, posZ: 0 } },
      after: { attributes: { location: { name: 'table', x: 0, y: 0, surface: 'north-wall' }, posZ: 0 } },
    });
    expect(draft?.detail['to']).toEqual({ name: 'table', x: 0, y: 0, z: 0, surface: 'north-wall' });
  });

  it('reads a change of angle', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { rotate: 0, roll: 0 } },
      after: { attributes: { rotate: 90, roll: 0 } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectRotate);
    expect(draft?.detail['rotate']).toEqual({ from: 0, to: 90 });
    expect(draft?.detail['roll']).toBeUndefined();
  });

  it('reads a card turning over', () => {
    const draft = interpretObjectChange({
      aliasName: 'card',
      identifier: 'k1',
      before: { attributes: { state: 'back' } },
      after: { attributes: { state: 'front' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectFace);
    expect(draft?.detail).toEqual({ from: 'back', to: 'front' });
  });

  it('reads how a coin or a die fell', () => {
    const draft = interpretObjectChange({
      aliasName: 'dice-symbol',
      identifier: 'd1',
      before: { attributes: { face: '1' } },
      after: { attributes: { face: '6' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectFace);
    expect(draft?.detail).toEqual({ from: '1', to: '6' });
  });

  it('reads a change of resource, naming the field', () => {
    const draft = interpretObjectChange({
      aliasName: 'data',
      identifier: 'hp1',
      before: { value: 12, attributes: { name: 'HP', currentValue: 12 } },
      after: { value: 12, attributes: { name: 'HP', currentValue: 7 } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectValue);
    expect(draft?.detail).toEqual({ name: 'HP', current: { from: 12, to: 7 } });
  });

  it('reads a change of owner', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { owner: '' } },
      after: { attributes: { owner: 'alice' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectOwner);
    expect(draft?.detail).toEqual({ from: '', to: 'alice' });
  });

  it('reads a lock and an unlock', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { isLock: false } },
      after: { attributes: { isLock: true } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectLock);
    expect(draft?.detail).toEqual({ locked: true });
  });

  it('reads a new object as a creation', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: null,
      after: { attributes: { location: { name: 'table', x: 0, y: 0 } } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectCreate);
    expect(draft?.detail).toEqual({ aliasName: 'character' });
  });

  it('reads a new chat message as a line', () => {
    const draft = interpretObjectChange({
      aliasName: 'chat',
      identifier: 'm1',
      before: null,
      after: {
        value: 'こんばんは',
        parentIdentifier: 'tab1',
        attributes: {
          name: 'アリス',
          from: 'alice',
          to: '',
          tag: '',
          dicebot: '',
          timestamp: 1700000000000,
          imageIdentifier: 'img-1',
          messColor: '#112233',
        },
      },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ChatMessage);
    expect(draft?.detail).toEqual({
      text: 'こんばんは',
      name: 'アリス',
      from: 'alice',
      to: '',
      tag: '',
      dicebot: '',
      timestamp: 1700000000000,
      tabIdentifier: 'tab1',
      imageIdentifier: 'img-1',
      messColor: '#112233',
    });
  });

  it('reads one from the dice bot as a roll', () => {
    const draft = interpretObjectChange({
      aliasName: 'chat',
      identifier: 'm2',
      before: null,
      after: { value: '(1D100) ＞ 42 ＞ 成功', attributes: { from: 'System-BCDice' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ChatDice);
  });

  it('reads a change with no heading as an ordinary update', () => {
    const draft = interpretObjectChange({
      aliasName: 'character',
      identifier: 'c1',
      before: { attributes: { hideName: false } },
      after: { attributes: { hideName: true } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
    expect(draft?.detail).toEqual({ keys: ['attributes.hideName'] });
  });
});

describe('reading the cut-ins', () => {
  it('reads one starting', () => {
    const draft = interpretObjectChange({
      aliasName: 'cut-in-launcher',
      identifier: 'launcher',
      before: { attributes: { launchTimeStamp: 3, launchCutInIdentifier: 'cut-a', launchIsStart: true } },
      after: { attributes: { launchTimeStamp: 4, launchCutInIdentifier: 'cut-b', launchIsStart: true } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.MediaCutIn);
    expect(draft?.targetIdentifier).toBe('cut-b');
    expect(draft?.detail).toEqual({ soundOnly: false, isStart: true });
  });

  it('reads one stopping', () => {
    const draft = interpretObjectChange({
      aliasName: 'cut-in-launcher',
      identifier: 'launcher',
      before: { attributes: { launchTimeStamp: 4, launchCutInIdentifier: 'cut-b', launchIsStart: true } },
      after: { attributes: { launchTimeStamp: 5, launchCutInIdentifier: 'cut-b', launchIsStart: false } },
    });
    expect(draft?.detail['isStart']).toBe(false);
  });

  it('reads a sound-only one', () => {
    const draft = interpretObjectChange({
      aliasName: 'cut-in-launcher',
      identifier: 'launcher',
      before: { attributes: { soundOnlyTimeStamp: 1, soundOnlyCutInIdentifier: 'se-a' } },
      after: { attributes: { soundOnlyTimeStamp: 2, soundOnlyCutInIdentifier: 'se-b' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.MediaCutIn);
    expect(draft?.targetIdentifier).toBe('se-b');
    expect(draft?.detail['soundOnly']).toBe(true);
  });

  it('keeps them at the middle setting', () => {
    expect(isRecordableKind(ReplayEventKind.MediaCutIn, ReplayDetailLevel.Notable)).toBe(true);
  });

  it('reads no unrelated change as one', () => {
    const draft = interpretObjectChange({
      aliasName: 'cut-in-launcher',
      identifier: 'launcher',
      before: { attributes: { sendTo: '' } },
      after: { attributes: { sendTo: 'alice' } },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });
});

describe('reading the music', () => {
  it('reads a change of track', () => {
    const draft = interpretObjectChange({
      aliasName: 'jukebox',
      identifier: 'jukebox',
      before: { audioIdentifier: 'bgm-a', isPlaying: true, startTime: 0 },
      after: { audioIdentifier: 'bgm-b', isPlaying: true, startTime: 0 },
    });
    expect(draft?.kind).toBe(ReplayEventKind.MediaBgm);
    expect(draft?.targetIdentifier).toBe('bgm-b');
    expect(draft?.detail['isPlaying']).toBe(true);
  });

  it('reads it stopping', () => {
    const draft = interpretObjectChange({
      aliasName: 'jukebox',
      identifier: 'jukebox',
      before: { audioIdentifier: 'bgm-a', isPlaying: true },
      after: { audioIdentifier: 'bgm-a', isPlaying: false },
    });
    expect(draft?.kind).toBe(ReplayEventKind.MediaBgm);
    expect(draft?.detail['isPlaying']).toBe(false);
  });

  it('keeps it at the middle setting', () => {
    expect(isRecordableKind(ReplayEventKind.MediaBgm, ReplayDetailLevel.Notable)).toBe(true);
  });

  it('reads a sound effect from the jukebox as one', () => {
    const draft = interpretObjectChange({
      aliasName: 'jukebox',
      identifier: 'jukebox',
      before: { seIdentifier: 'se-a', seTrigger: 1 },
      after: { seIdentifier: 'se-b', seTrigger: 2 },
    });
    expect(draft?.kind).toBe(ReplayEventKind.MediaSoundEffect);
    expect(draft?.detail['identifier']).toBe('se-b');
  });

  it('reads no unrelated change as music', () => {
    const draft = interpretObjectChange({
      aliasName: 'jukebox',
      identifier: 'jukebox',
      before: { isSeekLocked: true },
      after: { isSeekLocked: false },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });
});

describe('reading the novel mode', () => {
  it('reads a change of scene', () => {
    const draft = interpretObjectChange({
      aliasName: 'vn-stage',
      identifier: 'VnStage',
      before: { backgroundImageIdentifier: 'bg-a', transition: 'fade', transitionTrigger: 1 },
      after: { backgroundImageIdentifier: 'bg-b', transition: 'wipe', transitionTrigger: 2 },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VnScene);
    expect(draft?.targetIdentifier).toBe('bg-b');
    expect(draft?.detail['transition']).toBe('wipe');
  });

  it('reads a transition that changes no backdrop', () => {
    const draft = interpretObjectChange({
      aliasName: 'vn-stage',
      identifier: 'VnStage',
      before: { backgroundImageIdentifier: 'bg-a', transitionTrigger: 1 },
      after: { backgroundImageIdentifier: 'bg-a', transitionTrigger: 2 },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VnScene);
  });

  it('reads the reader advancing the text', () => {
    const draft = interpretObjectChange({
      aliasName: 'vn-stage',
      identifier: 'VnStage',
      before: { playheadIdentifier: 'm1', playheadTabIdentifier: 'tab1' },
      after: { playheadIdentifier: 'm2', playheadTabIdentifier: 'tab1' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VnPlayhead);
    expect(draft?.targetIdentifier).toBe('m2');
    expect(draft?.detail['tabIdentifier']).toBe('tab1');
  });

  it('reads the reader changing', () => {
    const draft = interpretObjectChange({
      aliasName: 'vn-stage',
      identifier: 'VnStage',
      before: { isDirected: false, directorPeerId: '' },
      after: { isDirected: true, directorPeerId: 'p1' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VnDirect);
    expect(draft?.detail['isDirected']).toBe(true);
  });

  it('keeps the run of it at the middle setting', () => {
    for (const kind of [ReplayEventKind.VnScene, ReplayEventKind.VnPlayhead, ReplayEventKind.VnDirect]) {
      expect(isRecordableKind(kind, ReplayDetailLevel.Notable)).toBe(true);
    }
  });

  it('reads no unrelated change as part of it', () => {
    const draft = interpretObjectChange({
      aliasName: 'vn-stage',
      identifier: 'VnStage',
      before: { directorPeerId: 'p1' },
      after: { directorPeerId: 'p2' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });
});

describe('reading the turns, the votes, the look of the table and the roles', () => {
  it('reads a round and a turn passing', () => {
    const draft = interpretObjectChange({
      aliasName: 'TurnState',
      identifier: 'TurnState',
      before: { round: 1, phase: 'acting', currentIdentifier: 'c1' },
      after: { round: 2, phase: 'roundStart', currentIdentifier: 'c2' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.TurnChange);
    expect(draft?.targetIdentifier).toBe('c2');
    expect(draft?.detail).toEqual({ round: 2, phase: 'roundStart', side: '' });
  });

  it('reads a side taking over the phase, with nobody up yet', () => {
    const draft = interpretObjectChange({
      aliasName: 'TurnState',
      identifier: 'TurnState',
      before: { round: 2, phase: 'acting', currentIdentifier: '', currentSide: 'p-heroes' },
      after: { round: 2, phase: 'acting', currentIdentifier: '', currentSide: 'p-monsters' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.TurnChange);
    expect(draft?.detail).toEqual({ round: 2, phase: 'acting', side: 'p-monsters' });
  });

  it('passes over a change that touches neither', () => {
    const draft = interpretObjectChange({
      aliasName: 'TurnState',
      identifier: 'TurnState',
      before: { round: 1, buffDecay: true },
      after: { round: 1, buffDecay: false },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });

  it('reads a vote starting', () => {
    const draft = interpretObjectChange({
      aliasName: 'Vote',
      identifier: 'Vote',
      before: { voteId: 1, voteTitle: '前の投票', isRollCall: false, isFinish: true, choices: [] },
      after: { voteId: 2, voteTitle: '進むか戻るか', isRollCall: false, isFinish: false, choices: ['進む', '戻る'] },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VoteStart);
    expect(draft?.detail).toEqual({ title: '進むか戻るか', isRollCall: false, choices: ['進む', '戻る'] });
  });

  it('reads a roll call apart from a vote', () => {
    const draft = interpretObjectChange({
      aliasName: 'Vote',
      identifier: 'Vote',
      before: { voteId: 1, isRollCall: false },
      after: { voteId: 2, voteTitle: '点呼', isRollCall: true },
    });
    expect(draft?.detail['isRollCall']).toBe(true);
  });

  it('reads a vote closing', () => {
    const draft = interpretObjectChange({
      aliasName: 'Vote',
      identifier: 'Vote',
      before: { voteId: 2, voteTitle: '進むか戻るか', isFinish: false },
      after: { voteId: 2, voteTitle: '進むか戻るか', isFinish: true },
    });
    expect(draft?.kind).toBe(ReplayEventKind.VoteFinish);
    expect(draft?.detail['title']).toBe('進むか戻るか');
  });

  it('reads a change to the look of the table', () => {
    const draft = interpretObjectChange({
      aliasName: 'game-table',
      identifier: 't1',
      before: { backgroundImageIdentifier: 'bg-a', darknessEnabled: false },
      after: { backgroundImageIdentifier: 'bg-b', darknessEnabled: true },
    });
    expect(draft?.kind).toBe(ReplayEventKind.TableScene);
  });

  it('reads which table is chosen as no part of that look', () => {
    const draft = interpretObjectChange({
      aliasName: 'game-table',
      identifier: 't1',
      before: { selected: false },
      after: { selected: true },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });

  it('reads a change of role', () => {
    const draft = interpretObjectChange({
      aliasName: 'PeerCursor',
      identifier: 'cursor-a',
      before: { role: 'pl', name: 'アリス' },
      after: { role: 'gm', name: 'アリス' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.PeerRoleChange);
    expect(draft?.detail['role']).toBe('gm');
  });

  it('makes no row about a role from the record of the last piece touched', () => {
    const draft = interpretObjectChange({
      aliasName: 'PeerCursor',
      identifier: 'cursor-a',
      before: { role: 'pl', lastControlCharacterName: '' },
      after: { role: 'pl', lastControlCharacterName: '盗賊' },
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectUpdate);
  });

  it('keeps all of these at the middle setting', () => {
    for (const kind of [
      ReplayEventKind.TurnChange,
      ReplayEventKind.VoteStart,
      ReplayEventKind.VoteFinish,
      ReplayEventKind.TableScene,
      ReplayEventKind.PeerRoleChange,
    ]) {
      expect(isRecordableKind(kind, ReplayDetailLevel.Notable)).toBe(true);
    }
  });
});

describe('interpretObjectRemove()', () => {
  it('reads it as a deletion', () => {
    const draft = interpretObjectRemove('c1', 'character');
    expect(draft.kind).toBe(ReplayEventKind.ObjectRemove);
    expect(draft.targetIdentifier).toBe('c1');
    expect(draft.detail).toEqual({ aliasName: 'character' });
  });
});

describe('interpretSignal()', () => {
  it('reads a die being rolled', () => {
    const draft = interpretSignal('ROLL_DICE_SYMBOL', { identifier: 'd1' });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectDiceRoll);
    expect(draft?.targetIdentifier).toBe('d1');
  });

  it('gives a signal that can be sounded again the event behind it', () => {
    expect(interpretSignal('SOUND_EFFECT', 'se-dice')?.signal).toEqual({ name: 'SOUND_EFFECT', data: 'se-dice' });
    expect(interpretSignal('ROLL_DICE_SYMBOL', { identifier: 'd1' })?.signal?.name).toBe('ROLL_DICE_SYMBOL');
    expect(interpretSignal('SHUFFLE_CARD_STACK', { identifier: 's1' })?.signal?.name).toBe('SHUFFLE_CARD_STACK');
    expect(interpretSignal('FLIP_COIN', { identifier: 'c1', face: 'back' })?.signal?.name).toBe('FLIP_COIN');
    expect(interpretSignal('EFFECT_CAST', {})?.signal?.name).toBe('EFFECT_CAST');
    expect(interpretSignal('SELECT_GAME_TABLE', { identifier: 't1' })?.signal?.name).toBe('SELECT_GAME_TABLE');
  });

  it('gives none to a signal that must not be', () => {
    expect(interpretSignal('CONNECT_PEER', { peerId: 'p1' })?.signal).toBeUndefined();
    expect(interpretSignal('DISCONNECT_PEER', { peerId: 'p1' })?.signal).toBeUndefined();
    expect(interpretSignal('RESOURCE_CHANGE', { characterIdentifier: 'c1' })?.signal).toBeUndefined();
  });

  it('reads a coin being flipped', () => {
    const draft = interpretSignal('FLIP_COIN', { identifier: 'co1', face: 'back' });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectFace);
    expect(draft?.detail).toEqual({ to: 'back' });
  });

  it('reads a deck being shuffled', () => {
    expect(interpretSignal('SHUFFLE_CARD_STACK', { identifier: 's1' })?.kind).toBe(ReplayEventKind.ObjectShuffle);
  });

  it('reads a sound effect', () => {
    const draft = interpretSignal('SOUND_EFFECT', 'se-dice');
    expect(draft?.kind).toBe(ReplayEventKind.MediaSoundEffect);
    expect(draft?.detail).toEqual({ identifier: 'se-dice' });
  });

  it('reads the table changing', () => {
    const draft = interpretSignal('SELECT_GAME_TABLE', { identifier: 't1' });
    expect(draft?.kind).toBe(ReplayEventKind.TableChange);
    expect(draft?.targetIdentifier).toBe('t1');
  });

  it('reads word of a resource change piece by piece', () => {
    const draft = interpretSignal('RESOURCE_CHANGE', {
      characterIdentifier: 'c1',
      changes: [{ name: 'HP', diff: -5 }],
    });
    expect(draft?.kind).toBe(ReplayEventKind.ObjectValue);
    expect(draft?.targetIdentifier).toBe('c1');
    expect(draft?.detail['changes']).toEqual([{ name: 'HP', diff: -5 }]);
  });

  it('reads an effect firing, with its name, its caster and its targets', () => {
    const draft = interpretSignal('EFFECT_CAST', {
      presetIdentifier: 'preset-fire',
      casterIdentifier: 'c1',
      targets: [
        { identifier: 'c2', x: 0, y: 0, z: 0 },
        { identifier: 'c3', x: 0, y: 0, z: 0 },
      ],
      seed: 42,
    });
    expect(draft?.kind).toBe(ReplayEventKind.EffectCast);
    expect(draft?.targetIdentifier).toBe('preset-fire');
    expect(draft?.detail).toEqual({ caster: 'c1', targets: ['c2', 'c3'] });
    expect(draft?.relatedIdentifiers).toEqual(['c1', 'c2', 'c3']);
    expect(draft?.signal?.name).toBe('EFFECT_CAST');
  });

  it('reads one with no caster too', () => {
    const draft = interpretSignal('EFFECT_CAST', {
      presetIdentifier: 'preset-heal',
      casterIdentifier: '',
      targets: [{ identifier: 'c1', x: 0, y: 0, z: 0 }],
    });
    expect(draft?.detail).toEqual({ caster: '', targets: ['c1'] });
    expect(draft?.relatedIdentifiers).toEqual(['c1']);
  });

  it('does not fall over on a broken one', () => {
    const draft = interpretSignal('EFFECT_CAST', { presetIdentifier: 'p', targets: 'not-an-array' });
    expect(draft?.detail).toEqual({ caster: '', targets: [] });
  });

  it('reads the novel mode being turned on and off', () => {
    const on = interpretSignal('VN_MODE', { active: true });
    expect(on?.kind).toBe(ReplayEventKind.VnMode);
    expect(on?.detail['active']).toBe(true);
    expect(on?.signal).toEqual({ name: 'VN_MODE', data: { active: true } });

    expect(interpretSignal('VN_MODE', { active: false })?.detail['active']).toBe(false);
  });

  it('reads an arrival and a departure', () => {
    expect(interpretSignal('CONNECT_PEER', { peerId: 'p1' })?.kind).toBe(ReplayEventKind.PeerJoin);
    expect(interpretSignal('DISCONNECT_PEER', { peerId: 'p1' })?.kind).toBe(ReplayEventKind.PeerLeave);
  });

  it('returns nothing for an event it does not know', () => {
    expect(interpretSignal('SOMETHING_ELSE', {})).toBeNull();
  });
});

describe('shouldDiffObjectChange()', () => {
  it('takes the difference of anything at the widest setting', () => {
    expect(shouldDiffObjectChange(ReplayDetailLevel.Full, 'character', false)).toBe(true);
    expect(shouldDiffObjectChange(ReplayDetailLevel.Notable, 'character', false)).toBe(true);
  });

  it('looks at nothing but a new line at the narrowest', () => {
    expect(shouldDiffObjectChange(ReplayDetailLevel.ChatOnly, 'chat', true)).toBe(true);
    expect(shouldDiffObjectChange(ReplayDetailLevel.ChatOnly, 'chat', false)).toBe(false);
    expect(shouldDiffObjectChange(ReplayDetailLevel.ChatOnly, 'character', true)).toBe(false);
  });

  it('never disagrees with what each kind keeps and drops', () => {
    const fromObjects = [
      ReplayEventKind.ObjectCreate,
      ReplayEventKind.ObjectUpdate,
      ReplayEventKind.ObjectImage,
      ReplayEventKind.ObjectLock,
      ReplayEventKind.ObjectOwner,
      ReplayEventKind.ObjectRemove,
      ReplayEventKind.PeerRoleChange,
      ReplayEventKind.TableScene,
    ];
    for (const kind of fromObjects) {
      expect(isRecordableKind(kind, ReplayDetailLevel.ChatOnly)).toBe(false);
    }
  });
});

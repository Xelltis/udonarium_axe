import { VN_EMOTE_DEFAULT, VnEmote, VnMessageKind } from '@axe/domain/visual-novel/vn-emote';
import {
  buildVnStage,
  leftOfSlot,
  messageSlotOf,
  slotBandLeft,
  slotBandWidth,
  slotLabelLeftInBand,
  spreadStagePositions,
  stageCutFor,
  VN_STAGE_MAX,
  VN_STAGE_MIN_GAP,
  VN_STAGE_SLOT_COUNT,
  VnStageSource,
} from '@axe/domain/visual-novel/vn-stage-cast';

function emote(overrides: Partial<VnEmote> = {}): VnEmote {
  return { ...VN_EMOTE_DEFAULT, ...overrides };
}

/** A different name means a different piece unless the caller says otherwise, as in a room. */
function source(overrides: Partial<VnStageSource> = {}): VnStageSource {
  const name = overrides.name ?? 'アリス';
  return {
    name,
    placedAt: 0,
    sendFrom: `id-${name}`,
    imageIdentifier: 'image-alice',
    imagePos: 0,
    vnPortraitPos: -1,
    isSystemMessage: false,
    isDicebot: false,
    isGameCharacter: true,
    isDiceCommand: false,
    emote: emote(),
    ...overrides,
  };
}

const resolveUrl = (imageIdentifier: string) => `url://${imageIdentifier}`;

describe('buildVnStage()', () => {
  it('puts nobody on stage for an empty history', () => {
    expect(buildVnStage([], resolveUrl)).toEqual([]);
  });

  it('puts the recent speakers on stage and marks only the one speaking now', () => {
    const stage = buildVnStage(
      [
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
        source({ name: 'アリス', imageIdentifier: 'image-alice', imagePos: 0 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.name)).toEqual(['アリス', 'ボブ']);
    expect(stage.map((chara) => chara.isActive)).toEqual([true, false]);
    expect(stage[0].url).toBe('url://image-alice');
  });

  it('orders them by their place and keeps only the latest line of a name', () => {
    const stage = buildVnStage(
      [
        source({ name: 'アリス', imagePos: 11 }),
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 5 }),
        source({ name: 'アリス', imagePos: 2 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => [chara.name, chara.slot])).toEqual([
      ['アリス', 2],
      ['ボブ', 5],
    ]);
  });

  it('shifts two sharing a place apart by one slot, no further', () => {
    const stage = buildVnStage(
      [source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 3 }), source({ name: 'アリス', imagePos: 3 })],
      resolveUrl
    );

    expect(stage[0].left).toBeCloseTo(leftOfSlot(3));
    expect(stage[1].left - stage[0].left).toBeCloseTo(VN_STAGE_MIN_GAP);
  });

  it('stands slot 0 and slot 11 on the same edges the chat portraits use', () => {
    const stage = buildVnStage(
      [source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 0 }), source({ name: 'アリス', imagePos: 11 })],
      resolveUrl
    );

    expect(stage[0].left).toBeCloseTo(8);
    expect(stage[1].left).toBeCloseTo(92);
  });

  it('leaves neighbouring slots where they were asked to stand', () => {
    const stage = buildVnStage(
      [source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 3 }), source({ name: 'アリス', imagePos: 4 })],
      resolveUrl
    );

    expect(stage[0].left).toBeCloseTo(leftOfSlot(3));
    expect(stage[1].left).toBeCloseTo(leftOfSlot(4));
  });

  it('leaves a cast that was deliberately put in one place where it was put', () => {
    const window = Array.from({ length: 3 }, (_, index) =>
      source({ name: `キャラ${index}`, imageIdentifier: `image-${index}`, imagePos: 5 })
    );

    const stage = buildVnStage(window, resolveUrl);

    expect(stage[0].left).toBeCloseTo(leftOfSlot(5));
  });

  it('spreads a cast nobody ever placed over the whole stage', () => {
    const window = Array.from({ length: 4 }, (_, index) =>
      source({ name: `キャラ${index}`, imageIdentifier: `image-${index}`, imagePos: 0 })
    );

    const stage = buildVnStage(window, resolveUrl);

    expect(stage[0].left).toBeGreaterThan(8);
    expect(stage[3].left).toBeLessThan(92);
    for (let i = 1; i < stage.length; i++) {
      expect(stage[i].left - stage[i - 1].left).toBeGreaterThanOrEqual(VN_STAGE_MIN_GAP);
    }
  });

  it('prefers what a line says over where the character stands in chat', () => {
    const stage = buildVnStage([source({ imagePos: 2, vnPortraitPos: 9 })], resolveUrl);

    expect(stage[0].slot).toBe(9);
  });

  it('does not read a missing place as the left edge', () => {
    const stage = buildVnStage([source({ imagePos: 9, vnPortraitPos: '' as unknown as number })], resolveUrl);

    expect(stage[0].slot).toBe(9);
  });

  it('reads the string older saved data holds as a place', () => {
    const stage = buildVnStage([source({ imagePos: '7' })], resolveUrl);

    expect(stage[0].slot).toBe(7);
  });

  it('asks whoever built it where a speaker stands', () => {
    const stage = buildVnStage([source({ sendFrom: 'alice' })], resolveUrl, (candidate) =>
      candidate.sendFrom === 'alice' ? 10 : 0
    );

    expect(stage[0].slot).toBe(10);
  });

  it('puts no more than six on stage', () => {
    const window = Array.from({ length: 10 }, (_, index) =>
      source({ name: `キャラ${index}`, imageIdentifier: `image-${index}`, imagePos: index })
    );

    expect(buildVnStage(window, resolveUrl)).toHaveLength(VN_STAGE_MAX);
  });

  it.each<VnMessageKind>(['location', 'scene'])('現在の発言が %s なら立ち絵を隠すこと', (kind) => {
    const stage = buildVnStage([source(), source({ emote: emote({ kind }) })], resolveUrl);

    expect(stage).toEqual([]);
  });

  it('carries nobody across a change of scene', () => {
    const stage = buildVnStage(
      [
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
        source({ name: 'ナレーター', imageIdentifier: '', emote: emote({ kind: 'scene' }) }),
        source({ name: 'アリス', imagePos: 0 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.name)).toEqual(['アリス']);
  });

  it('puts neither the system, the dice bot nor a dice command on stage', () => {
    const stage = buildVnStage(
      [
        source({ name: 'システム', isSystemMessage: true }),
        source({ name: 'ダイスボット', isDicebot: true }),
        source({ name: 'コマンド', isDiceCommand: true }),
        source({ name: 'アリス' }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.name)).toEqual(['アリス']);
  });

  it('leaves out anything but a character, anything without a picture and any picture it cannot resolve', () => {
    const stage = buildVnStage(
      [
        source({ name: 'プレイヤー', isGameCharacter: false }),
        source({ name: '画像なし', imageIdentifier: '' }),
        source({ name: '欠番', imageIdentifier: 'missing' }),
        source({ name: 'アリス' }),
      ],
      (imageIdentifier) => (imageIdentifier === 'missing' ? '' : `url://${imageIdentifier}`)
    );

    expect(stage.map((chara) => chara.name)).toEqual(['アリス']);
  });

  it('marks nobody while the current line is a dice command', () => {
    const stage = buildVnStage([source({ name: 'アリス' }), source({ name: 'ボブ', isDiceCommand: true })], resolveUrl);

    expect(stage.every((chara) => !chara.isActive)).toBe(true);
  });

  it('keeps a portrait off stage once its line says it leaves', () => {
    const stage = buildVnStage(
      [
        source({ name: 'アリス', imagePos: 0 }),
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
        source({ name: 'アリス', imagePos: 0, emote: emote({ exited: true }) }),
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.name)).toEqual(['ボブ']);
  });

  it('leaves a portrait standing on the very line it takes its leave with', () => {
    const stage = buildVnStage(
      [
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
        source({ name: 'アリス', imagePos: 0, emote: emote({ exited: true }) }),
      ],
      resolveUrl
    );

    // They are still there to say goodbye with; the fade carries them off as it is read.
    expect(stage.map((chara) => chara.name)).toEqual(['アリス', 'ボブ']);
    expect(stage.find((chara) => chara.name === 'アリス')?.isLeaving).toBe(true);
    expect(stage.find((chara) => chara.name === 'ボブ')?.isLeaving).toBe(false);
  });

  it('brings it back once it speaks again', () => {
    const stage = buildVnStage(
      [
        source({ name: 'アリス', emote: emote({ exited: true }) }),
        source({ name: 'ボブ', imageIdentifier: 'image-bob', imagePos: 6 }),
        source({ name: 'アリス', imagePos: 0 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.name)).toEqual(['アリス', 'ボブ']);
  });

  it('stands a character once, whatever name the line was said under', () => {
    // A whisper is recorded as "speaker > listener", and a piece can be renamed mid-session.
    const stage = buildVnStage(
      [
        source({ name: 'アリス', sendFrom: 'alice', imagePos: 0 }),
        source({ name: 'アリス > ボブ', sendFrom: 'alice', imagePos: 0 }),
      ],
      resolveUrl
    );

    expect(stage).toHaveLength(1);
    expect(stage[0].name).toBe('アリス > ボブ');
  });

  it('tells two pieces of the same name apart', () => {
    const stage = buildVnStage(
      [
        source({ name: 'ゴブリン', sendFrom: 'goblin-1', imagePos: 2 }),
        source({ name: 'ゴブリン', sendFrom: 'goblin-2', imagePos: 6 }),
      ],
      resolveUrl
    );

    expect(stage.map((chara) => chara.id)).toEqual(['goblin-1', 'goblin-2']);
  });

  it('carries a flip onto the portrait', () => {
    const stage = buildVnStage([source({ emote: emote({ flipped: true }) })], resolveUrl);

    expect(stage[0].isFlipped).toBe(true);
  });

  it('pulls a place outside the stage back to the first', () => {
    expect(buildVnStage([source({ imagePos: 99 })], resolveUrl)[0].slot).toBe(0);
    expect(buildVnStage([source({ imagePos: null })], resolveUrl)[0].slot).toBe(0);
  });
});

describe('spreadStagePositions()', () => {
  it('places nobody from nothing', () => {
    expect(spreadStagePositions([], 10, 8, 92)).toEqual([]);
  });

  it('leaves one alone but keeps it on the stage', () => {
    expect(spreadStagePositions([50], 10, 8, 92)).toEqual([50]);
    expect(spreadStagePositions([200], 10, 8, 92)).toEqual([92]);
  });

  it('leaves alone what already stands far enough apart', () => {
    expect(spreadStagePositions([20, 40, 60], 10, 8, 92)).toEqual([20, 40, 60]);
  });

  it('pushes apart what stands on the same spot', () => {
    expect(spreadStagePositions([20, 20, 20], 10, 8, 92)).toEqual([20, 30, 40]);
  });

  it('holds the last one on the stage and pushes the rest back', () => {
    expect(spreadStagePositions([88, 88, 88], 10, 8, 92)).toEqual([72, 82, 92]);
  });

  it('narrows the gap rather than walking off the stage', () => {
    const spread = spreadStagePositions([8, 8, 8, 8, 8, 8, 8, 8, 8, 8], 40, 8, 92);

    expect(spread[0]).toBeCloseTo(8);
    expect(spread[spread.length - 1]).toBeLessThanOrEqual(92);
  });

  it('pushes rather than reorders, so it wants them in order', () => {
    expect(spreadStagePositions([50, 20], 10, 8, 92)).toEqual([50, 60]);
  });
});

describe('the bands of the slot guide', () => {
  it('leaves no ground between one band and the next', () => {
    for (let slot = 0; slot < VN_STAGE_SLOT_COUNT - 1; slot++) {
      const right = slotBandLeft(slot) + slotBandWidth(slot);
      expect(right).toBeCloseTo(slotBandLeft(slot + 1), 6);
    }
  });

  it('runs out to both edges of the guide', () => {
    const last = VN_STAGE_SLOT_COUNT - 1;

    expect(slotBandLeft(0)).toBe(0);
    expect(slotBandLeft(last) + slotBandWidth(last)).toBeCloseTo(100, 6);
  });

  it('keeps the number standing over its slot', () => {
    for (const slot of [0, 5, VN_STAGE_SLOT_COUNT - 1]) {
      const label = slotBandLeft(slot) + (slotBandWidth(slot) * slotLabelLeftInBand(slot)) / 100;
      expect(label).toBeCloseTo(leftOfSlot(slot), 6);
    }
  });
});

describe('stageCutFor()', () => {
  it('cuts nothing where the stage was never cleared', () => {
    expect(stageCutFor(0, 30, true)).toBe(0);
  });

  it('holds while the line being read came after the clearing', () => {
    expect(stageCutFor(20, 30, false)).toBe(20);
  });

  it('lets go while the reader is back before the clearing', () => {
    expect(stageCutFor(20, 15, false)).toBe(0);
  });

  it('holds at the latest line even where nothing has been said since', () => {
    // The notice is kept out of the script, so the last line said is still where "now" is.
    expect(stageCutFor(20, 15, true)).toBe(20);
  });
});

describe('clearing the stage', () => {
  const alice = (placedAt: number) => source({ name: 'アリス', sendFrom: 'alice', placedAt });
  const bob = (placedAt: number) => source({ name: 'ボブ', sendFrom: 'bob', imageIdentifier: 'image-bob', placedAt });

  it('leaves the stage alone when nothing is cut', () => {
    const stage = buildVnStage([alice(10), bob(20)], () => 'url', messageSlotOf, 0);
    expect(stage.map((character) => character.name)).toEqual(['アリス', 'ボブ']);
  });

  it('drops anybody who last spoke before the cut', () => {
    const stage = buildVnStage([alice(10), bob(30)], () => 'url', messageSlotOf, 20);
    expect(stage.map((character) => character.name)).toEqual(['ボブ']);
  });

  it('empties the stage where the whole window is behind the cut', () => {
    expect(buildVnStage([alice(10), bob(15)], () => 'url', messageSlotOf, 20)).toEqual([]);
  });

  it('brings a character back who speaks again after the cut', () => {
    const stage = buildVnStage([alice(10), bob(15), alice(30)], () => 'url', messageSlotOf, 20);
    expect(stage.map((character) => character.name)).toEqual(['アリス']);
  });

  it('leaves the window it was given untouched', () => {
    const window = [alice(10), bob(15), alice(30)];
    buildVnStage(window, () => 'url', messageSlotOf, 20);
    expect(window).toHaveLength(3);
  });
});

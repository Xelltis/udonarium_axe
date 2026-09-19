import { replayVideoFontFamily, ReplayVideoProduction } from '@axe/application/replay/replay-video-production';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import { recorder } from '@axe/testing/canvas-recorder';

const base: ReplayObjectSnapshot[] = [
  { identifier: 't1', aliasName: 'game-table', syncData: { attributes: { width: 40, height: 20, gridSize: 50 } } },
  {
    identifier: 'c1',
    aliasName: 'character',
    syncData: { attributes: { location: { name: 'table', x: 0, y: 0 }, posZ: 0 } },
  },
  {
    identifier: 'd1',
    aliasName: 'data',
    syncData: { value: '', parentIdentifier: 'c1', attributes: { name: 'common' } },
  },
  {
    identifier: 'd2',
    aliasName: 'data',
    syncData: { value: '勇者', parentIdentifier: 'd1', attributes: { name: 'name' } },
  },
];

function moved(seq: number, x: number): ReplayEvent {
  return {
    seq,
    at: seq * 10,
    t: seq * 10,
    kind: ReplayEventKind.ObjectMove,
    actorId: 'alice',
    targetId: 'c1',
    detail: { from: { name: 'table', x: x - 1, y: 0, z: 0 }, to: { name: 'table', x, y: 0, z: 0 } },
    patch: {
      identifier: 'c1',
      aliasName: 'character',
      before: {},
      after: { 'attributes.location': { name: 'table', x, y: 0 } },
    },
    visibility: PUBLIC_VISIBILITY,
  };
}

function said(seq: number, text: string): ReplayEvent {
  return {
    seq,
    at: seq * 10,
    t: seq * 10,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text, name: 'アリス', from: 'alice', tabIdentifier: 'main' },
    visibility: PUBLIC_VISIBILITY,
  };
}

function productionOf(
  events: readonly ReplayEvent[],
  overrides: Partial<ConstructorParameters<typeof ReplayVideoProduction>[0]> = {}
): ReplayVideoProduction {
  return new ReplayVideoProduction({
    events,
    manifest: null,
    base,
    viewer: { userId: '', role: PeerRole.Guest },
    text: { lang: 'ja', decode: (text) => text, t: (key) => key },
    width: 1280,
    height: 720,
    style: ReplayVideoStyle.Tabletop,
    pacing: ReplayVideoPacing.Reading,
    readingSpeed: 1,
    tabs: null,
    opening: null,
    images: { get: () => null },
    measureWith: () => (text) => [...text].length * 30,
    ...overrides,
  });
}

/** Where the name under the piece is written, which is where the piece stands on screen. */
function nameAt(production: ReplayVideoProduction, atMs: number): { x: number; y: number } {
  const canvas = recorder();
  production.paint(canvas.ctx, atMs);
  const label = canvas.texts.find((text) => text.text === '勇者')!;
  return { x: label.x, y: label.y };
}

describe('ReplayVideoProduction', () => {
  const events = [
    said(1, 'はじめ'),
    ...Array.from({ length: 900 }, (_, index) => moved(index + 2, index + 1)),
    said(902, 'おわり'),
  ];

  it('shows the same board at a moment however it got there', () => {
    const straight = productionOf(events);
    const end = straight.durationMs - 1;
    const jumped = nameAt(straight, end);

    const walked = productionOf(events);
    for (let at = 0; at < end; at += 997) walked.paint(recorder().ctx, at);

    expect(nameAt(walked, end)).toEqual(jumped);
  });

  it('shows the board as the events left it', () => {
    const production = productionOf(events);

    expect(nameAt(production, production.durationMs - 1).x).not.toBe(nameAt(production, 500).x);
  });

  it('finds when the video reaches an event and which event a moment shows', () => {
    const production = productionOf(events);
    const at = production.timeOf(902)!;

    expect(at).toBeGreaterThan(0);
    expect(production.seqAt(at + 10)).toBe(902);
  });

  it('draws the same frames when made again from what it shares, as a worker makes it', () => {
    const original = productionOf([said(1, '長い前置き。'.repeat(40)), ...events.slice(1, 40), said(902, 'おわり')]);
    const copy = ReplayVideoProduction.fromShared(structuredClone(original.share()), { get: () => null });

    expect(copy.durationMs).toBe(original.durationMs);
    for (const at of [0, original.durationMs / 2, original.durationMs - 1]) {
      const [a, b] = [recorder(), recorder()];
      original.paint(a.ctx, at);
      copy.paint(b.ctx, at);
      expect(b.texts).toEqual(a.texts);
    }
  });

  it('tells a worker whether the text was laid out in the bundled fonts', () => {
    expect(productionOf(events.slice(0, 3)).share().bundledFonts).toBe(true);

    expect(productionOf(events.slice(0, 3), { bundledFonts: false }).share().bundledFonts).toBe(false);
  });

  it('is ready at once for a moment with no pictures to wait for', async () => {
    const production = productionOf(events);

    expect(production.isReady(0)).toBe(true);
    await expect(production.prepare(0)).resolves.toBeUndefined();
  });
});

describe('the font of a replay video', () => {
  it('sets the words in both bundled faces before any the device has', () => {
    expect(replayVideoFontFamily('ja').startsWith("'Axe Replay JP', 'Axe Replay KR', ")).toBe(true);
    expect(replayVideoFontFamily('ko').startsWith("'Axe Replay KR', 'Axe Replay JP', ")).toBe(true);
  });

  it('falls back to the device faces of the language first', () => {
    const korean = replayVideoFontFamily('ko');
    expect(korean.indexOf('Malgun Gothic')).toBeLessThan(korean.indexOf('Yu Gothic'));
    const japanese = replayVideoFontFamily('ja');
    expect(japanese.indexOf('Yu Gothic')).toBeLessThan(japanese.indexOf('Malgun Gothic'));
  });
});

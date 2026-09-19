import { PeerRole } from '@axe/domain/peer/peer-role';
import type { ReplayBoardPiece, ReplayBoardScene } from '@axe/domain/replay/replay-board-view';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import type { ReplayCameraFrame } from '@axe/domain/replay/video/replay-video-camera';
import { replayVideoLayout } from '@axe/domain/replay/video/replay-video-layout';
import {
  buildReplayVideoTimeline,
  type ReplayDiceSegment,
  type ReplayLineSegment,
  type ReplayVideoSegment,
  ReplayVideoStyle,
} from '@axe/domain/replay/video/replay-video-timeline';
import type { ReplayFrameAssets } from '@axe/infrastructure/replay/replay-canvas';
import { ReplayVideoRenderer } from '@axe/infrastructure/replay/video/replay-video-renderer';
import { image, recorder } from '@axe/testing/canvas-recorder';

let seq = 0;

function event(kind: ReplayEventKind, detail: Record<string, unknown>, extra: Partial<ReplayEvent> = {}): ReplayEvent {
  seq += 1;
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind,
    actorId: 'alice',
    detail,
    visibility: PUBLIC_VISIBILITY,
    ...extra,
  };
}

function say(text: string, name = 'アリス', imageIdentifier = ''): ReplayEvent {
  return event(
    ReplayEventKind.ChatMessage,
    { text, name, from: 'alice', tabIdentifier: 'main', imageIdentifier },
    { patch: { identifier: 'm', aliasName: 'chat', before: {}, after: { 'attributes.sendFrom': `c-${name}` } } }
  );
}

const noPictures: ReplayFrameAssets = { imageOf: () => null };

function rendererOf(
  events: ReplayEvent[],
  style: ReplayVideoStyle = ReplayVideoStyle.Novel,
  assets: ReplayFrameAssets = noPictures,
  board: ReplayBoardScene | null = null
) {
  const layout = replayVideoLayout(1920, 1080, style);
  const timeline = buildReplayVideoTimeline(events, {
    viewer: { userId: '', role: PeerRole.Guest },
    text: { lang: 'ja', decode: (text) => text, t: (key) => key },
    subtitle: {
      measure: (text) => [...text].length * layout.text.fontSize,
      maxWidth: layout.text.maxWidth,
      maxLines: layout.text.maxLines,
    },
    isCharacter: () => true,
  });
  const renderer = new ReplayVideoRenderer({
    timeline,
    layout,
    boardAt: () => board,
    assets,
    fontFamily: 'sans-serif',
  });
  return { renderer, timeline, layout };
}

function textsAt(renderer: ReplayVideoRenderer, atMs: number): string[] {
  const canvas = recorder();
  renderer.paint(canvas.ctx, atMs);
  return canvas.texts.map((text) => text.text);
}

beforeEach(() => {
  seq = 0;
});

describe('drawing a replay video', () => {
  it('writes who is speaking and what they said once it is typed out', () => {
    const { renderer, timeline } = rendererOf([say('こんにちは')]);
    const line = timeline.segments[0] as ReplayLineSegment;

    expect(textsAt(renderer, line.startMs + line.durationMs - 100)).toEqual(
      expect.arrayContaining(['アリス', 'こんにちは'])
    );
  });

  it('types a line out a few characters at a time', () => {
    const { renderer } = rendererOf([say('こんにちは')]);

    const typed = textsAt(renderer, 60).find((text) => text.startsWith('こ'));
    expect(typed).toBeDefined();
    expect(typed!.length).toBeLessThan('こんにちは'.length);
  });

  it('turns over to the next page once the first has been read', () => {
    const { renderer, timeline, layout } = rendererOf([say('あ'.repeat(200))]);
    const line = timeline.segments[0] as ReplayLineSegment;
    const second = line.pages[1];

    const texts = textsAt(renderer, line.startMs + second.startMs + second.durationMs - 50);
    const perLine = Math.floor(layout.text.maxWidth / layout.text.fontSize);
    expect(texts).toContain('あ'.repeat(perLine));
    expect(line.pages.length).toBeGreaterThan(1);
  });

  it('shows the title of a chapter on a card of its own', () => {
    const { renderer, timeline } = rendererOf([event(ReplayEventKind.Marker, { label: '第一章' })]);
    const card = timeline.segments[0];

    expect(textsAt(renderer, card.startMs + card.durationMs / 2)).toContain('第一章');
  });

  it('shows what a roll came to once the dice have tumbled', () => {
    const { renderer, timeline } = rendererOf([
      event(ReplayEventKind.ChatDice, {
        text: '(2D6) ＞ 7',
        name: '<BCDice：アリス>',
        from: 'System-BCDice',
        tabIdentifier: 'main',
      }),
    ]);
    const roll = timeline.segments[0] as ReplayDiceSegment;

    expect(textsAt(renderer, roll.startMs + 200)).not.toContain('7');
    expect(textsAt(renderer, roll.startMs + 1500)).toContain('7');
  });

  it('stands the speakers on the novel stage, the one speaking larger', () => {
    const assets: ReplayFrameAssets = {
      imageOf: (identifier) => (identifier.startsWith('face') ? image(300, 600) : null),
    };
    const { renderer, timeline } = rendererOf(
      [say('やあ', 'アリス', 'face-a'), say('どうも', 'ボブ', 'face-b')],
      ReplayVideoStyle.Novel,
      assets
    );
    const second = timeline.segments[1];
    const canvas = recorder();

    renderer.paint(canvas.ctx, second.startMs + second.durationMs - 100);

    const portraits = canvas.images.filter((drawn) => drawn.height > 300);
    expect(portraits).toHaveLength(2);
    expect(portraits[1].height).toBeGreaterThan(portraits[0].height);
  });

  it("sets a subtitle beside the speaker's face in the tabletop style", () => {
    const assets: ReplayFrameAssets = { imageOf: (identifier) => (identifier === 'face-a' ? image(200, 400) : null) };
    const { renderer, timeline, layout } = rendererOf(
      [say('やあ', 'アリス', 'face-a')],
      ReplayVideoStyle.Tabletop,
      assets
    );
    const line = timeline.segments[0];
    const canvas = recorder();

    renderer.paint(canvas.ctx, line.startMs + line.durationMs - 100);

    expect(canvas.images.map((drawn) => drawn.x)).toContain(layout.face!.x);
  });

  it('draws the board behind what is said', () => {
    const board: ReplayBoardScene = {
      width: 10,
      height: 10,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: 'table',
      backgroundImageIdentifier: '',
      pieces: [],
      overlay: null,
    };
    const surface = image(500, 500);
    const assets: ReplayFrameAssets = { imageOf: (identifier) => (identifier === 'table' ? surface : null) };
    const { renderer } = rendererOf([say('やあ')], ReplayVideoStyle.Tabletop, assets, board);
    const canvas = recorder();

    renderer.paint(canvas.ctx, 1000);

    expect(canvas.images.some((drawn) => drawn.image === surface)).toBe(true);
  });

  it('carries the camera on from the frame it last drew, however short the segments before', () => {
    const standing = (identifier: string, x: number, y: number) =>
      ({
        identifier,
        aliasName: 'character',
        x,
        y,
        z: 0,
        size: 1,
        rotate: 0,
        name: '',
        imageIdentifier: '',
        shape: 'figure',
        width: 1,
        height: 1,
        showsName: false,
        isConcealed: false,
        color: '',
        title: '',
        text: '',
        count: 0,
        openCells: [],
        tiled: false,
        elevation: 0,
        view: 3,
        door: null,
        sideImageIdentifier: '',
      }) as ReplayBoardPiece;
    const board: ReplayBoardScene = {
      width: 40,
      height: 40,
      gridSize: 50,
      gridType: 0,
      gridShow: false,
      gridColor: '',
      imageIdentifier: '',
      backgroundImageIdentifier: '',
      pieces: [standing('a', 100, 100), standing('b', 1800, 100), standing('c', 100, 1800)],
      overlay: null,
    };
    const shot = (startMs: number, durationMs: number, focus: string) =>
      ({ kind: 'line', startMs, durationMs, focus: [focus], boardTo: 0 }) as unknown as ReplayVideoSegment;
    const segments = [shot(0, 3000, 'a'), shot(3000, 300, 'b'), shot(3300, 300, 'c'), shot(3600, 3000, 'a')];
    const renderer = new ReplayVideoRenderer({
      timeline: { segments, totalMs: 6600, timeOfSeq: new Map(), imageIdentifiers: [] },
      layout: replayVideoLayout(1920, 1080, ReplayVideoStyle.Tabletop),
      boardAt: () => board,
      assets: noPictures,
      fontFamily: 'sans-serif',
    });
    const camera = renderer as unknown as { cameraAt(index: number, localMs: number): ReplayCameraFrame };

    for (const index of [1, 2, 3]) {
      expect(camera.cameraAt(index, 0)).toEqual(camera.cameraAt(index - 1, segments[index - 1].durationMs));
    }
  });

  it('opens from black and closes to it', () => {
    const { renderer, layout } = rendererOf([say('やあ')]);
    const blackOver = (atMs: number) => {
      const canvas = recorder();
      renderer.paint(canvas.ctx, atMs);
      const last = canvas.fills[canvas.fills.length - 1];
      return last.color === '#000000' && last.width === layout.width;
    };

    expect(blackOver(0)).toBe(true);
    expect(blackOver(renderer.durationMs / 2)).toBe(false);
    expect(blackOver(renderer.durationMs)).toBe(true);
  });

  it('finds the moment on screen at any time', () => {
    const { renderer, timeline } = rendererOf([say('やあ'), say('どうも')]);

    expect(renderer.segmentIndexAt(0)).toBe(0);
    expect(renderer.segmentIndexAt(timeline.segments[1].startMs + 1)).toBe(1);
    expect(renderer.segmentIndexAt(timeline.totalMs + 10_000)).toBe(1);
  });
});

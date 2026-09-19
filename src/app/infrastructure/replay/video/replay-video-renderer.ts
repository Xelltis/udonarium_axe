import type { ReplayBoardScene } from '@axe/domain/replay/replay-board-view';
import { containRect, coverRect } from '@axe/domain/replay/replay-picture-fit';
import { easeInOut } from '@axe/domain/replay/replay-route';
import {
  blendReplayCamera,
  easeInOutCubic,
  type ReplayCameraFrame,
  type ReplayCameraShot,
  replayCameraTarget,
} from '@axe/domain/replay/video/replay-video-camera';
import type { ReplayVideoLayout } from '@axe/domain/replay/video/replay-video-layout';
import {
  type ReplayCutInSegment,
  type ReplayDiceSegment,
  type ReplayLineSegment,
  type ReplayStageFigure,
  type ReplayTimedPage,
  type ReplayVideoSegment,
  ReplayVideoStyle,
  type ReplayVideoTimeline,
} from '@axe/domain/replay/video/replay-video-timeline';
import {
  type ReplayFrameAssets,
  type ReplayFrameCanvas,
  type ReplayFrameImage,
  roundedRectPath,
} from '@axe/infrastructure/replay/replay-canvas';
import { paintReplayCutInScene } from '@axe/infrastructure/replay/replay-cut-in-painter';
import { paintReplayBoard } from '@axe/infrastructure/replay/video/replay-board-painter';

/** Everything a replay video is drawn from. */
export interface ReplayVideoSource {
  timeline: ReplayVideoTimeline;
  layout: ReplayVideoLayout;
  /** The board as it stood once this many events had been applied. Null for a recording with no table. */
  boardAt(applied: number): ReplayBoardScene | null;
  assets: ReplayFrameAssets;
  fontFamily: string;
}

const CAMERA_MS = 1_100;
const STAGE_FADE_MS = 350;
const BOX_FADE_MS = 260;
const BACKDROP_FADE_MS = 500;
const OPEN_FADE_MS = 600;
const CLOSE_FADE_MS = 900;
const CHAPTER_FADE_MS = 550;
const PAGE_FADE_MS = 160;
const TYPE_MS_PER_CHAR = 30;
const NAME_PLATE_DEFAULT = '#3b4a7a';
/** How far a portrait is ever blown up past its own size, so a small picture stays sharp enough to look at. */
const PORTRAIT_MAX_GROWTH = 2.4;

const OUTCOME_COLOR: Readonly<Record<string, string>> = {
  critical: '#ffd166',
  success: '#7cc7ff',
  failure: '#c7ccd6',
  fumble: '#ff6b6b',
  '': '#ffffff',
};

type Backdrop = { kind: 'board' } | { kind: 'image'; identifier: string } | { kind: 'black' };

/**
 * Draws the frames of a replay video from its timeline.
 *
 * The same renderer draws the preview in the editor and the frames of the export, so what is seen
 * while editing is what the video holds. Any moment can be drawn on its own, in any order: the
 * camera, the portraits and the dialogue box each work out from the timeline where they were
 * coming from, and glide from there.
 */
export class ReplayVideoRenderer {
  private readonly cameras = new Map<number, ReplayCameraFrame>();
  private readonly cameraEnds = new Map<number, ReplayCameraFrame>();
  private readonly scenes = new Map<number, ReplayBoardScene | null>();
  private layer: OffscreenCanvas | null = null;

  constructor(private readonly source: ReplayVideoSource) {}

  get durationMs(): number {
    return this.source.timeline.totalMs;
  }

  /** The segment on screen at a moment, as its place in the timeline. -1 for an empty timeline. */
  segmentIndexAt(atMs: number): number {
    const segments = this.source.timeline.segments;
    if (segments.length < 1) return -1;
    let low = 0;
    let high = segments.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (segments[middle].startMs <= atMs) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /** Draws the frame at a moment of the video. */
  paint(ctx: ReplayFrameCanvas, atMs: number): void {
    const { layout } = this.source;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, layout.width, layout.height);

    const index = this.segmentIndexAt(atMs);
    if (index < 0) {
      ctx.restore();
      return;
    }
    const segment = this.source.timeline.segments[index];
    const localMs = Math.max(0, atMs - segment.startMs);

    this.paintBackdrop(ctx, index, localMs);
    if (layout.style === ReplayVideoStyle.Novel) this.paintStage(ctx, index, localMs);
    this.paintWords(ctx, index, localMs);
    if (segment.kind === 'dice') this.paintDice(ctx, segment, localMs);
    if (segment.kind === 'banner') this.paintBanner(ctx, segment.text, localMs, segment.durationMs);
    if (segment.kind === 'cut-in') this.paintCutIn(ctx, segment, localMs);
    if (segment.kind === 'chapter') this.paintChapter(ctx, segment, localMs, index);

    const opening = Math.min(1, atMs / OPEN_FADE_MS);
    const closing = Math.min(1, Math.max(0, (this.durationMs - atMs) / CLOSE_FADE_MS));
    const shade = 1 - Math.min(opening, closing);
    if (shade > 0) {
      ctx.globalAlpha = shade;
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, layout.width, layout.height);
    }
    ctx.restore();
  }

  // Backdrop ------------------------------------------------------------------------------------

  private backdropOf(index: number): Backdrop {
    const segment = this.source.timeline.segments[index];
    if (!segment) return { kind: 'black' };
    if (segment.kind === 'chapter') return { kind: 'black' };
    if (this.source.layout.style === ReplayVideoStyle.Novel && segment.kind !== 'board') {
      if (segment.background.length > 0 && this.source.assets.imageOf(segment.background)) {
        return { kind: 'image', identifier: segment.background };
      }
    }
    return this.sceneAt(segment.boardTo) ? { kind: 'board' } : { kind: 'black' };
  }

  private paintBackdrop(ctx: ReplayFrameCanvas, index: number, localMs: number): void {
    const now = this.backdropOf(index);
    const before = index > 0 ? this.backdropOf(index - 1) : now;
    const changed = !sameBackdrop(now, before);
    const blend = changed ? easeInOut(localMs / BACKDROP_FADE_MS) : 1;

    if (blend < 1) {
      const previous = this.source.timeline.segments[index - 1];
      this.paintBackdropOf(ctx, before, index - 1, previous.durationMs);
      const layer = this.layerContext();
      if (layer) {
        layer.clearRect(0, 0, this.source.layout.width, this.source.layout.height);
        this.paintBackdropOf(layer, now, index, localMs);
        ctx.save();
        ctx.globalAlpha = blend;
        ctx.drawImage(layer.canvas, 0, 0);
        ctx.restore();
        return;
      }
    }
    this.paintBackdropOf(ctx, now, index, localMs);
  }

  private paintBackdropOf(ctx: ReplayFrameCanvas, backdrop: Backdrop, index: number, localMs: number): void {
    const { layout } = this.source;
    if (backdrop.kind === 'black') {
      const glow = ctx.createRadialGradient(
        layout.width / 2,
        layout.height / 2,
        0,
        layout.width / 2,
        layout.height / 2,
        layout.width * 0.7
      );
      glow.addColorStop(0, '#1b2030');
      glow.addColorStop(1, '#05060a');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, layout.width, layout.height);
      return;
    }
    if (backdrop.kind === 'image') {
      const picture = this.source.assets.imageOf(backdrop.identifier);
      if (!picture) return;
      const rect = coverRect(picture, layout);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(picture, rect.x, rect.y, rect.width, rect.height);
      return;
    }
    const segment = this.source.timeline.segments[index];
    const scene = this.sceneAt(segment.boardTo);
    if (!scene) return;
    const beat = segment.kind === 'board' ? { segment, localMs } : null;
    const speaking = this.speakingPiece(segment);
    const novelLine = layout.style === ReplayVideoStyle.Novel && segment.kind !== 'board';
    paintReplayBoard(
      ctx,
      {
        scene,
        before: beat ? this.sceneAt(segment.boardFrom) : null,
        camera: this.cameraAt(index, localMs),
        area: layout.board,
        beat,
        highlight: speaking ? { identifier: speaking.identifier, color: speaking.color, localMs } : null,
        dim: novelLine ? 0.28 : 0,
        labelSize: layout.label.fontSize,
        popSize: layout.label.popSize,
        fontFamily: this.source.fontFamily,
      },
      this.source.assets
    );
  }

  private speakingPiece(segment: ReplayVideoSegment): { identifier: string; color: string } | null {
    if (segment.kind !== 'line' && segment.kind !== 'dice') return null;
    const identifier = segment.focus[0];
    return identifier ? { identifier, color: ringColor(segment.color) } : null;
  }

  // Camera --------------------------------------------------------------------------------------

  private cameraAt(index: number, localMs: number): ReplayCameraFrame {
    const target = this.cameraTarget(index);
    if (index < 1) return target;
    const from = this.cameraAtEndOf(index - 1);
    return blendReplayCamera(from, target, easeInOutCubic(localMs / CAMERA_MS));
  }

  /**
   * Where the camera stands on the last frame of a segment.
   *
   * A segment long enough for the camera to arrive ends on its target. A shorter one ends partway,
   * and partway from wherever the segment before it ended, which is the same frame the video
   * actually showed; blending from the earlier target instead would jump whenever two short
   * segments came together.
   */
  private cameraAtEndOf(index: number): ReplayCameraFrame {
    const segments = this.source.timeline.segments;
    let first = index;
    while (!this.cameraEnds.has(first) && first > 0 && segments[first].durationMs < CAMERA_MS) first -= 1;
    let from = this.cameraEnds.get(first) ?? this.cameraTarget(first);
    this.cameraEnds.set(first, from);
    for (let at = first + 1; at <= index; at++) {
      const blend = easeInOutCubic(segments[at].durationMs / CAMERA_MS);
      from = blendReplayCamera(from, this.cameraTarget(at), blend);
      this.cameraEnds.set(at, from);
    }
    return from;
  }

  private cameraTarget(index: number): ReplayCameraFrame {
    const cached = this.cameras.get(index);
    if (cached) return cached;
    const segment = this.source.timeline.segments[index];
    const scene = this.sceneAt(segment.boardTo);
    const { layout } = this.source;
    const aspect = layout.board.width / layout.board.height;
    let frame: ReplayCameraFrame;
    if (!scene) {
      frame = { x: 0, y: 0, width: layout.board.width, height: layout.board.height };
    } else {
      const shot: ReplayCameraShot =
        segment.kind === 'board' ? 'action' : segment.focus.length > 0 ? 'speaker' : 'wide';
      const points = segment.kind === 'board' ? segment.motions.flatMap((motion) => [...motion.route.slice(0, 1)]) : [];
      frame = replayCameraTarget(scene, segment.focus, aspect, shot, points);
    }
    this.cameras.set(index, frame);
    return frame;
  }

  private sceneAt(applied: number): ReplayBoardScene | null {
    if (this.scenes.has(applied)) return this.scenes.get(applied) ?? null;
    const scene = this.source.boardAt(applied);
    if (this.scenes.size > 8) this.scenes.delete(this.scenes.keys().next().value as number);
    this.scenes.set(applied, scene);
    return scene;
  }

  // Novel stage ---------------------------------------------------------------------------------

  private stageOf(index: number): readonly ReplayStageFigure[] {
    const segment = this.source.timeline.segments[index];
    if (!segment) return [];
    if (segment.kind === 'line' || segment.kind === 'dice') return segment.stage;
    if ((segment.kind === 'banner' || segment.kind === 'cut-in') && index > 0) {
      const previous = this.source.timeline.segments[index - 1];
      if (previous.kind === 'line' || previous.kind === 'dice') {
        return previous.stage.map((figure) => ({ ...figure, isActive: false, isLeaving: false }));
      }
    }
    return [];
  }

  private paintStage(ctx: ReplayFrameCanvas, index: number, localMs: number): void {
    const segment = this.source.timeline.segments[index];
    const now = this.stageOf(index);
    const before = index > 0 ? this.stageOf(index - 1) : [];
    const beforeById = new Map(before.map((figure) => [figure.id, figure]));
    const nowIds = new Set(now.map((figure) => figure.id));
    const settle = easeInOut(localMs / STAGE_FADE_MS);

    for (const figure of before) {
      if (nowIds.has(figure.id) || figure.isLeaving) continue;
      this.paintFigure(ctx, figure, figure.left, 1 - settle, figure.isActive ? 1 : 0, 0);
    }
    const ordered = [...now].sort((a, b) => Number(a.isActive) - Number(b.isActive));
    for (const figure of ordered) {
      const earlier = beforeById.get(figure.id);
      const left = earlier ? earlier.left + (figure.left - earlier.left) * settle : figure.left;
      const wasActive = earlier ? (earlier.isActive ? 1 : 0) : figure.isActive ? 1 : 0;
      const active = wasActive + ((figure.isActive ? 1 : 0) - wasActive) * settle;
      let alpha = earlier ? 1 : settle;
      if (figure.isLeaving) {
        const through = segment.durationMs > 0 ? localMs / segment.durationMs : 1;
        alpha *= 1 - easeInOut((through - 0.4) / 0.6);
      }
      this.paintFigure(ctx, figure, left, alpha, active, earlier ? 0 : 1 - settle);
    }
  }

  private paintFigure(
    ctx: ReplayFrameCanvas,
    figure: ReplayStageFigure,
    leftPercent: number,
    alpha: number,
    active: number,
    rise: number
  ): void {
    if (alpha <= 0.001) return;
    const picture = this.source.assets.imageOf(figure.imageIdentifier);
    if (!picture || picture.width < 1 || picture.height < 1) return;
    const { layout } = this.source;
    const most = Math.min(layout.portraitHeight, picture.height * PORTRAIT_MAX_GROWTH);
    const size = containRect(picture, layout.width * 0.36, most, true);
    const grow = 0.95 + 0.05 * active;
    const width = size.width * grow;
    const height = size.height * grow;
    const centreX = (leftPercent / 100) * layout.width;
    const bottom = layout.height + height * 0.02 + rise * layout.height * 0.04;

    ctx.save();
    ctx.globalAlpha *= alpha;
    const brightness = 0.52 + 0.48 * active;
    if (brightness < 0.999) ctx.filter = `brightness(${brightness.toFixed(3)})`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 24 * layout.scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(centreX, bottom - height);
    if (figure.isFlipped) ctx.scale(-1, 1);
    ctx.drawImage(picture, -width / 2, 0, width, height);
    ctx.restore();
  }

  // Dialogue and subtitles ----------------------------------------------------------------------

  private paintWords(ctx: ReplayFrameCanvas, index: number, localMs: number): void {
    const segments = this.source.timeline.segments;
    const segment = segments[index];
    const previous = index > 0 ? segments[index - 1] : null;
    const next = segments[index + 1] ?? null;
    const hasBox = (one: ReplayVideoSegment | null) => one?.kind === 'line' && one.mode !== 'location';

    if (segment.kind === 'line' && segment.mode === 'location') {
      this.paintLocation(ctx, segment, localMs);
    }
    if (!hasBox(segment)) {
      if (previous && hasBox(previous) && localMs < BOX_FADE_MS) {
        this.paintBox(ctx, previous as ReplayLineSegment, previous.durationMs, 1 - localMs / BOX_FADE_MS);
      }
      return;
    }
    const line = segment as ReplayLineSegment;
    const appear = hasBox(previous) ? 1 : easeInOut(localMs / BOX_FADE_MS);
    const vanish = hasBox(next) ? 1 : Math.min(1, (line.durationMs - localMs) / BOX_FADE_MS + 0.0001);
    this.paintBox(ctx, line, localMs, Math.min(appear, Math.max(0, vanish)));
  }

  private paintBox(ctx: ReplayFrameCanvas, line: ReplayLineSegment, localMs: number, alpha: number): void {
    if (alpha <= 0.001) return;
    const { layout } = this.source;
    const { box, text } = layout;
    const tabletop = layout.style === ReplayVideoStyle.Tabletop;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 30 * layout.scale;
    const fill = ctx.createLinearGradient(0, box.y, 0, box.y + box.height);
    fill.addColorStop(0, tabletop ? 'rgba(8, 10, 16, 0.72)' : 'rgba(14, 17, 28, 0.9)');
    fill.addColorStop(1, tabletop ? 'rgba(8, 10, 16, 0.62)' : 'rgba(8, 10, 18, 0.82)');
    ctx.fillStyle = fill;
    if (roundedRectPath(ctx, box.x, box.y, box.width, box.height, box.radius)) ctx.fill();
    else ctx.fillRect(box.x, box.y, box.width, box.height);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = Math.max(1, 2 * layout.scale);
    if (roundedRectPath(ctx, box.x, box.y, box.width, box.height, box.radius)) ctx.stroke();

    if (layout.face && line.mode === 'speech') this.paintFace(ctx, line, layout.face);
    if (line.mode === 'speech' && line.speaker.length > 0) this.paintPlate(ctx, line.speaker, line.color);

    const page = pageAt(line.pages, localMs);
    if (page) {
      const into = localMs - page.startMs;
      const reveal = revealCount(page, into);
      const fadeIn = page.startMs > 0 ? Math.min(1, into / PAGE_FADE_MS) : 1;
      ctx.globalAlpha *= fadeIn;
      ctx.font = `500 ${text.fontSize}px ${this.source.fontFamily}`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = line.mode === 'narration' ? '#efe6c8' : '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6 * layout.scale;
      ctx.shadowOffsetY = 2 * layout.scale;
      const centred = line.mode === 'narration';
      ctx.textAlign = centred ? 'center' : 'left';
      const x = centred ? box.x + box.width / 2 : text.x;
      const spare = (text.maxLines - page.lines.length) * text.lineHeight;
      const top = text.y + (tabletop || centred ? spare / 2 : 0);
      let left = reveal;
      for (const [row, content] of page.lines.entries()) {
        if (left <= 0) break;
        const chars = [...content];
        const shown = chars.slice(0, left).join('');
        left -= chars.length;
        ctx.fillText(shown, x, top + row * text.lineHeight + (text.lineHeight - text.fontSize) / 2);
      }
      if (!tabletop && reveal >= page.charCount) this.paintNextMark(ctx, into);
    }
    ctx.restore();
  }

  private paintPlate(ctx: ReplayFrameCanvas, speaker: string, color: string): void {
    const { plate, scale } = this.source.layout;
    ctx.save();
    ctx.font = `700 ${plate.fontSize}px ${this.source.fontFamily}`;
    const width = ctx.measureText(speaker).width + plate.padding * 2;
    ctx.fillStyle = plateColor(color);
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12 * scale;
    if (roundedRectPath(ctx, plate.x, plate.y, width, plate.height, plate.height / 2)) ctx.fill();
    else ctx.fillRect(plate.x, plate.y, width, plate.height);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, 2 * scale);
    if (roundedRectPath(ctx, plate.x, plate.y, width, plate.height, plate.height / 2)) ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(speaker, plate.x + plate.padding, plate.y + plate.height / 2 + scale);
    ctx.restore();
  }

  private paintFace(
    ctx: ReplayFrameCanvas,
    line: { portrait: string; color: string; speaker: string },
    face: NonNullable<ReplayVideoLayout['face']>
  ): void {
    const picture = this.source.assets.imageOf(line.portrait);
    const radius = face.width / 2;
    const centreX = face.x + radius;
    const centreY = face.y + radius;
    ctx.save();
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
    ctx.fillStyle = plateColor(line.color);
    ctx.fill();
    if (picture && picture.width > 0) {
      ctx.clip();
      const scale = face.width / picture.width;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(picture, face.x, face.y, face.width, picture.height * scale);
    } else if (line.speaker.length > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${face.width * 0.45}px ${this.source.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText([...line.speaker][0], centreX, centreY);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = Math.max(2, 3 * this.source.layout.scale);
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private paintNextMark(ctx: ReplayFrameCanvas, into: number): void {
    const { box, scale } = this.source.layout;
    const bob = Math.sin(into / 180) * 4 * scale;
    const size = 14 * scale;
    const x = box.x + box.width - 44 * scale;
    const y = box.y + box.height - 38 * scale + bob;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(x - size, y - size * 0.6);
    ctx.lineTo(x + size, y - size * 0.6);
    ctx.lineTo(x, y + size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private paintLocation(ctx: ReplayFrameCanvas, line: ReplayLineSegment, localMs: number): void {
    const { layout } = this.source;
    const alpha = fadeInOut(localMs, line.durationMs, 500);
    const words = line.pages.flatMap((page) => page.lines).join(' ');
    ctx.save();
    ctx.globalAlpha *= alpha;
    const band = ctx.createLinearGradient(0, 0, layout.width, 0);
    band.addColorStop(0, 'rgba(0, 0, 0, 0)');
    band.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
    band.addColorStop(1, 'rgba(0, 0, 0, 0)');
    const y = layout.height * 0.36;
    const height = layout.chapter.titleSize * 1.9;
    ctx.fillStyle = band;
    ctx.fillRect(0, y - height / 2, layout.width, height);
    ctx.font = `600 ${Math.round(layout.chapter.titleSize * 0.62)}px ${this.source.fontFamily}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 10 * layout.scale;
    ctx.fillText(words, layout.width / 2, y, layout.width * 0.85);
    ctx.restore();
  }

  // Dice ----------------------------------------------------------------------------------------

  private paintDice(ctx: ReplayFrameCanvas, dice: ReplayDiceSegment, localMs: number): void {
    const { layout } = this.source;
    const panel = layout.dice;
    const enter = easeInOut(localMs / 280);
    const leave = Math.min(1, Math.max(0, (dice.durationMs - localMs) / 280));
    const alpha = Math.min(enter, leave);
    const colour = OUTCOME_COLOR[dice.outcome] ?? '#ffffff';
    const s = layout.scale;

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(0, (1 - enter) * -30 * s);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 36 * s;
    ctx.fillStyle = 'rgba(10, 12, 20, 0.88)';
    if (roundedRectPath(ctx, panel.x, panel.y, panel.width, panel.height, panel.radius)) ctx.fill();
    ctx.restore();
    ctx.strokeStyle = colour;
    ctx.globalAlpha *= 0.9;
    ctx.lineWidth = 3 * s;
    if (roundedRectPath(ctx, panel.x, panel.y, panel.width, panel.height, panel.radius)) ctx.stroke();
    ctx.globalAlpha /= 0.9;

    const centreX = panel.x + panel.width / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${Math.round(34 * s)}px ${this.source.fontFamily}`;
    const heading = dice.comment.length > 0 ? `${dice.speaker}　${dice.comment}` : dice.speaker;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(heading, centreX, panel.y + panel.height * 0.17, panel.width - 60 * s);

    ctx.font = `500 ${Math.round(28 * s)}px ${this.source.fontFamily}`;
    ctx.fillStyle = 'rgba(220, 226, 240, 0.8)';
    ctx.fillText(dice.steps.join('  →  '), centreX, panel.y + panel.height * 0.34, panel.width - 60 * s);

    const shown = localMs - 550;
    if (shown > 0) {
      const pop = shown < 160 ? 0.7 + (shown / 160) * 0.45 : shown < 300 ? 1.15 - ((shown - 160) / 140) * 0.15 : 1;
      ctx.save();
      ctx.translate(centreX, panel.y + panel.height * 0.68);
      ctx.scale(pop, pop);
      ctx.font = `900 ${Math.round(96 * s)}px ${this.source.fontFamily}`;
      ctx.shadowColor = colour;
      ctx.shadowBlur = 24 * s;
      ctx.fillStyle = colour;
      ctx.fillText(dice.result, 0, 0, panel.width - 80 * s);
      ctx.restore();
    } else {
      this.paintRolling(ctx, centreX, panel.y + panel.height * 0.68, localMs);
    }
    ctx.restore();
  }

  /** Three dice tumbling while the result is awaited. */
  private paintRolling(ctx: ReplayFrameCanvas, x: number, y: number, localMs: number): void {
    const s = this.source.layout.scale;
    const size = 44 * s;
    for (let die = -1; die <= 1; die += 1) {
      ctx.save();
      ctx.translate(x + die * size * 1.5, y + Math.sin(localMs / 70 + die) * 6 * s);
      ctx.rotate(localMs / 90 + die);
      ctx.fillStyle = '#fbfbf7';
      if (roundedRectPath(ctx, -size / 2, -size / 2, size, size, size * 0.2)) ctx.fill();
      ctx.fillStyle = '#1d2230';
      ctx.beginPath();
      ctx.arc(0, 0, size * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Banners, chapters, cut-ins ------------------------------------------------------------------

  private paintBanner(ctx: ReplayFrameCanvas, text: string, localMs: number, durationMs: number): void {
    const { layout } = this.source;
    const { banner } = layout;
    const enter = easeInOut(localMs / 320);
    const alpha = fadeInOut(localMs, durationMs, 320);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate((1 - enter) * -layout.width * 0.08, 0);
    const band = ctx.createLinearGradient(0, 0, layout.width, 0);
    band.addColorStop(0, 'rgba(10, 14, 26, 0)');
    band.addColorStop(0.2, 'rgba(10, 14, 26, 0.82)');
    band.addColorStop(0.8, 'rgba(10, 14, 26, 0.82)');
    band.addColorStop(1, 'rgba(10, 14, 26, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(0, banner.y, layout.width, banner.height);
    ctx.fillStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.fillRect(layout.width * 0.2, banner.y, layout.width * 0.6, Math.max(2, 3 * layout.scale));
    ctx.fillRect(
      layout.width * 0.2,
      banner.y + banner.height - Math.max(2, 3 * layout.scale),
      layout.width * 0.6,
      Math.max(2, 3 * layout.scale)
    );
    ctx.font = `700 ${banner.fontSize}px ${this.source.fontFamily}`;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, layout.width / 2, banner.y + banner.height / 2, layout.width * 0.56);
    ctx.restore();
  }

  private paintChapter(
    ctx: ReplayFrameCanvas,
    chapter: { title: string; subtitle: string; durationMs: number },
    localMs: number,
    index: number
  ): void {
    const { layout } = this.source;
    const next = this.source.timeline.segments[index + 1];
    const alpha =
      next?.kind === 'chapter'
        ? Math.min(1, localMs / CHAPTER_FADE_MS)
        : fadeInOut(localMs, chapter.durationMs, CHAPTER_FADE_MS);
    const s = layout.scale;
    const centreY = layout.height / 2 - (chapter.subtitle ? 24 * s : 0);

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grow = 1.04 - 0.04 * easeInOut(localMs / 1200);
    ctx.save();
    ctx.translate(layout.width / 2, centreY);
    ctx.scale(grow, grow);
    ctx.font = `700 ${layout.chapter.titleSize}px ${this.source.fontFamily}`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(122, 162, 255, 0.45)';
    ctx.shadowBlur = 30 * s;
    ctx.fillText(chapter.title, 0, 0, layout.width * 0.86);
    ctx.restore();

    const lineWidth = layout.width * 0.36 * easeInOut((localMs - 200) / 700);
    if (lineWidth > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.fillRect(
        (layout.width - lineWidth) / 2,
        centreY + layout.chapter.titleSize * 0.72,
        lineWidth,
        Math.max(1, 2 * s)
      );
    }
    if (chapter.subtitle.length > 0) {
      ctx.font = `400 ${layout.chapter.subtitleSize}px ${this.source.fontFamily}`;
      ctx.fillStyle = 'rgba(230, 234, 245, 0.85)';
      ctx.fillText(chapter.subtitle, layout.width / 2, centreY + layout.chapter.titleSize * 1.25, layout.width * 0.8);
    }
    ctx.restore();
  }

  private paintCutIn(ctx: ReplayFrameCanvas, segment: ReplayCutInSegment, localMs: number): void {
    const { layout } = this.source;
    const alpha = fadeInOut(localMs, segment.durationMs, 260);
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, layout.width, layout.height);
    if (segment.scene) {
      paintReplayCutInScene(
        ctx,
        { x: 0, y: 0, width: layout.width, height: layout.height },
        segment.scene,
        this.source.assets,
        localMs,
        this.source.fontFamily
      );
    } else {
      const picture = this.source.assets.imageOf(segment.imageIdentifier);
      if (picture) this.paintCutInPicture(ctx, picture, localMs);
    }
    ctx.restore();
  }

  private paintCutInPicture(ctx: ReplayFrameCanvas, picture: ReplayFrameImage, localMs: number): void {
    const { layout } = this.source;
    const size = containRect(picture, layout.width * 0.84, layout.height * 0.84, true);
    const grow = 1.06 - 0.06 * easeInOut(localMs / 500);
    const width = size.width * grow;
    const height = size.height * grow;
    ctx.imageSmoothingQuality = 'high';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 40 * layout.scale;
    ctx.drawImage(picture, (layout.width - width) / 2, (layout.height - height) / 2, width, height);
  }

  private layerContext(): OffscreenCanvasRenderingContext2D | null {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const { width, height } = this.source.layout;
    if (!this.layer || this.layer.width !== width || this.layer.height !== height) {
      this.layer = new OffscreenCanvas(width, height);
    }
    return this.layer.getContext('2d');
  }
}

function sameBackdrop(a: Backdrop, b: Backdrop): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'image' || a.identifier === (b as { identifier: string }).identifier;
}

/** The page of a line on screen at a moment of it, the last page staying once its time is up. */
function pageAt(pages: readonly ReplayTimedPage[], localMs: number): ReplayTimedPage | null {
  let found: ReplayTimedPage | null = null;
  for (const page of pages) {
    if (page.startMs <= localMs) found = page;
    else break;
  }
  return found;
}

/** How many characters of a page have been typed out, fast enough to be done well before it is read. */
function revealCount(page: ReplayTimedPage, into: number): number {
  if (page.charCount < 1) return 0;
  const perChar = Math.min(TYPE_MS_PER_CHAR, (page.durationMs * 0.4) / page.charCount);
  return Math.min(page.charCount, Math.floor(into / Math.max(1, perChar)) + 1);
}

function fadeInOut(localMs: number, durationMs: number, fadeMs: number): number {
  const enter = Math.min(1, localMs / fadeMs);
  const leave = Math.min(1, Math.max(0, (durationMs - localMs) / fadeMs));
  return easeInOut(Math.min(enter, leave));
}

/**
 * The colour of a name plate: the speaker's own, deepened so white reads on it. A colour too dark
 * or too pale to tell anyone apart by (black is what most rooms leave it at) gives the usual one.
 */
function plateColor(color: string): string {
  const match = /^#([0-9a-f]{6})/i.exec(color.trim());
  if (!match) return NAME_PLATE_DEFAULT;
  const value = parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const light = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  if (light < 40 || light > 235) return NAME_PLATE_DEFAULT;
  const deepen = (channel: number) => Math.round(channel * 0.62);
  return `rgb(${deepen(r)}, ${deepen(g)}, ${deepen(b)})`;
}

/** The colour a speaker is ringed in on the board: their own, or gold where theirs would not show. */
export function ringColor(color: string): string {
  return plateColor(color) === NAME_PLATE_DEFAULT ? '#ffd166' : color;
}

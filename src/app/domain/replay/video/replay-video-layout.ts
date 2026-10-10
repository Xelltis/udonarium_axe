import { ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';

export interface ReplayVideoRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where each part of a replay video frame goes, in pixels of the frame. */
export interface ReplayVideoLayout {
  width: number;
  height: number;
  /** How much larger than 1920 by 1080 the frame is laid out. */
  scale: number;
  style: ReplayVideoStyle;
  /** The part of the frame the board is framed in. */
  board: ReplayVideoRect;
  /** The box a line is set in. */
  box: ReplayVideoRect & { radius: number; padding: number };
  /** The plate the speaker's name sits on, over the top edge of the box. */
  plate: { x: number; y: number; height: number; padding: number; fontSize: number };
  /** The subtitle itself: how large, how far apart, how wide and how many lines to a page. */
  text: { x: number; y: number; fontSize: number; lineHeight: number; maxWidth: number; maxLines: number };
  /** The speaker's face beside a subtitle, in the tabletop style. None in the novel style. */
  face: ReplayVideoRect | null;
  /** How tall the tallest portrait stands on the novel stage, feet on the bottom of the frame. */
  portraitHeight: number;
  /** The panel a roll is shown in. */
  dice: ReplayVideoRect & { radius: number };
  chapter: { titleSize: number; subtitleSize: number };
  banner: { y: number; height: number; fontSize: number };
  /** The size of the names under the pieces and of the values rising over them. */
  label: { fontSize: number; popSize: number };
}

const REFERENCE_WIDTH = 1920;
const REFERENCE_HEIGHT = 1080;

/**
 * Lays a replay video frame out for a style at a size, as if it were 1920 by 1080 scaled by
 * whichever side fits tighter.
 *
 * The novel style sets lines three to a page in a wide box at the foot of the frame, with the
 * speaker's name on a plate over its top edge and portraits standing behind it. The tabletop style
 * keeps the board clear and sets two lines to a page low down, like the subtitles of a film,
 * with the speaker's face beside them.
 */
export function replayVideoLayout(width: number, height: number, style: ReplayVideoStyle): ReplayVideoLayout {
  const scale = Math.min(width / REFERENCE_WIDTH, height / REFERENCE_HEIGHT);
  const at = (value: number): number => Math.round(value * scale);
  const common = {
    width,
    height,
    scale,
    style,
    board: { x: 0, y: 0, width, height },
    chapter: { titleSize: at(92), subtitleSize: at(40) },
    banner: { y: at(150), height: at(120), fontSize: at(56) },
    label: { fontSize: at(26), popSize: at(52) },
  };

  if (style === ReplayVideoStyle.Tabletop) {
    const fontSize = at(46);
    const lineHeight = at(66);
    const faceSize = at(132);
    const boxWidth = Math.min(width - at(160), at(1500));
    const padding = at(28);
    const boxHeight = lineHeight * 2 + padding * 2;
    const boxX = Math.round((width - boxWidth) / 2);
    const boxY = height - boxHeight - at(56);
    const textX = boxX + padding + faceSize + at(28);
    return {
      ...common,
      box: { x: boxX, y: boxY, width: boxWidth, height: boxHeight, radius: at(18), padding },
      plate: { x: textX, y: boxY - at(46), height: at(46), padding: at(18), fontSize: at(30) },
      text: {
        x: textX,
        y: boxY + padding,
        fontSize,
        lineHeight,
        maxWidth: boxX + boxWidth - padding - textX,
        maxLines: 2,
      },
      face: { x: boxX + padding, y: boxY + Math.round((boxHeight - faceSize) / 2), width: faceSize, height: faceSize },
      portraitHeight: 0,
      dice: { x: Math.round((width - at(980)) / 2), y: boxY - at(40), width: at(980), height: at(270), radius: at(24) },
    };
  }

  const fontSize = at(46);
  const lineHeight = at(70);
  const padding = at(44);
  const margin = at(56);
  const boxHeight = lineHeight * 3 + padding * 2;
  const boxY = height - boxHeight - margin;
  const boxWidth = width - margin * 2;
  return {
    ...common,
    box: { x: margin, y: boxY, width: boxWidth, height: boxHeight, radius: at(22), padding },
    plate: { x: margin + at(36), y: boxY - at(58), height: at(64), padding: at(28), fontSize: at(38) },
    text: {
      x: margin + padding,
      y: boxY + padding,
      fontSize,
      lineHeight,
      maxWidth: boxWidth - padding * 2,
      maxLines: 3,
    },
    face: null,
    portraitHeight: Math.round(height * 0.86),
    dice: {
      x: Math.round((width - at(1000)) / 2),
      y: boxY + boxHeight - at(290),
      width: at(1000),
      height: at(290),
      radius: at(24),
    },
  };
}

/** The font the subtitles of a layout are set in, for measuring them the way they will be drawn. */
export function replaySubtitleFont(layout: ReplayVideoLayout, fontFamily: string): string {
  return `500 ${layout.text.fontSize}px ${fontFamily}`;
}

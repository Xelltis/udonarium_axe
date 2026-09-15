import type { ReplayStoryboard } from '@axe/domain/replay/replay-storyboard';

/**
 * Writes a recording out as something to read.
 *
 * It works from the same storyboard as the video; that one draws to a canvas and this one to text.
 * Built apart, the chapter breaks and the handling of narration would drift between them.
 */

export enum ReplayScriptFormat {
  /** A script, with the speaker at the head of the line. */
  Script = 'script',
  /** Prose, set with narration and quotation marks. */
  Novel = 'novel',
}

export interface ReplayScriptOptions {
  format: ReplayScriptFormat;
  /** The title. Empty for no heading. */
  title: string;
  /** The elapsed time at the head of each chapter. */
  withTime: boolean;
}

export const DEFAULT_REPLAY_SCRIPT_OPTIONS: ReplayScriptOptions = {
  format: ReplayScriptFormat.Novel,
  title: '',
  withTime: false,
};

/** Continued shots are put back into one line: the video splits them to stay readable, and in something to read the breaks get in the way. */
export interface ReplayScriptLine {
  /** The original line. Every shot split from it carries its number. */
  seq: number;
  chapter: string;
  speaker: string;
  text: string;
  isNarration: boolean;
  startMs: number;
}

/**
 * The lines of a storyboard as text to read.
 *
 * Chapter headings and empty shots are left out, and shots split from one line are joined back up.
 */
export function buildReplayScriptLines(storyboard: ReplayStoryboard): ReplayScriptLine[] {
  const lines: ReplayScriptLine[] = [];

  for (const shot of storyboard.shots) {
    if (shot.isChapterStart) continue;

    const text = shot.text.trim();
    if (text.length < 1) continue;

    // The split shots share that number; going by the speaker would join two separate lines by one person.
    const previous = lines[lines.length - 1];
    if (previous && previous.seq === shot.seq) {
      previous.text += text;
      continue;
    }

    lines.push({
      seq: shot.seq,
      chapter: shot.chapter,
      speaker: shot.speaker,
      text,
      isNarration: shot.isNarration,
      startMs: shot.startMs,
    });
  }

  return lines;
}

/**
 * Writes a recording out as a Markdown script or story.
 *
 * The title, when given, is the top heading, and each chapter gets a heading of its own, with
 * the elapsed time as a comment when asked for. Spoken lines are set as a script or as prose
 * according to the format, and narration stands as plain paragraphs.
 */
export function buildReplayScriptMarkdown(
  storyboard: ReplayStoryboard,
  options: ReplayScriptOptions = DEFAULT_REPLAY_SCRIPT_OPTIONS
): string {
  const lines = buildReplayScriptLines(storyboard);
  const parts: string[] = [];
  if (options.title.trim().length > 0) parts.push(`# ${options.title.trim()}`);

  let chapter: string | null = null;
  for (const line of lines) {
    if (line.chapter !== chapter) {
      chapter = line.chapter;
      if (chapter.length > 0) {
        const at = options.withTime ? ` <!-- ${replayScriptElapsed(line.startMs)} -->` : '';
        parts.push(`## ${chapter}${at}`);
      }
    }
    parts.push(sentenceOf(line, options.format));
  }

  return parts.join('\n\n') + (parts.length > 0 ? '\n' : '');
}

/** How one line is worded. */
function sentenceOf(line: ReplayScriptLine, format: ReplayScriptFormat): string {
  if (line.isNarration || line.speaker.length < 1) return line.text;
  if (format === ReplayScriptFormat.Script) return `**${line.speaker}**　${line.text}`;
  return `${line.speaker}「${line.text}」`;
}

/** How the elapsed time is written. In something to read it appears at the head of a chapter alone. */
export function replayScriptElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`;
}

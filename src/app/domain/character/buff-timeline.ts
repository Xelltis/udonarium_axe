import { clamp } from '@axe/core/util/clamp';
import { buffColorOf, buffIconOf, buffIconUrlOf, parseBuffStrength } from '@axe/domain/character/buff-badge';
import { readBuffModifier } from '@axe/domain/character/buff-modifier';
import {
  BuffEffectTiming,
  buffEffectTimingOf,
  BuffTiming,
  buffTimingOf,
  buffTriggerOf,
} from '@axe/domain/character/buff-timing';
import { DataElement } from '@axe/domain/data/data-element';

export interface BuffTimelineBar {
  identifier: string;
  name: string;
  effect: string;
  strength: string;
  icon: string;
  /** Where the picture is, for an icon naming one that was brought in. Empty for a mark. */
  iconUrl: string;
  color: string;
  /** Rounds left, which is how many columns the bar covers. */
  rounds: number;
  timing: BuffTiming;
  trigger: string;
  /** The status this buff moves, empty where it moves none. */
  modifierTarget: string;
  /** Whether the buff moves its status again at every count, so that when it does can be chosen. */
  movesAtCounts: boolean;
  /** The moment the buff's effect moves at, where it has one of its own; null where it has none. */
  effectTiming: BuffEffectTiming | null;
}

export interface BuffTimelineRow {
  characterIdentifier: string;
  characterName: string;
  imageUrl: string;
  bars: BuffTimelineBar[];
}

/** What a character has to show on the timeline, longest first so the eye finds the tail. */
export function toTimelineBars(buffRoot: DataElement | null): BuffTimelineBar[] {
  if (!buffRoot) return [];

  const bars: BuffTimelineBar[] = [];
  const walk = (element: DataElement) => {
    for (const child of element.children) {
      const data = child as DataElement;
      if (data.children.length > 0) {
        walk(data);
        continue;
      }
      if (!data.isNumberResource) continue;

      const rounds = Number(data.value);
      const effect = `${data.currentValue ?? ''}`;
      const modifier = readBuffModifier(data);
      bars.push({
        identifier: data.identifier,
        name: data.name,
        effect,
        strength: parseBuffStrength(effect),
        icon: buffIconOf(data),
        iconUrl: buffIconUrlOf(buffIconOf(data)),
        color: buffColorOf(data),
        rounds: Number.isFinite(rounds) ? rounds : 0,
        timing: buffTimingOf(data),
        trigger: buffTriggerOf(data),
        modifierTarget: modifier?.target ?? '',
        movesAtCounts: modifier?.step !== undefined,
        effectTiming: buffEffectTimingOf(data),
      });
    }
  };
  walk(buffRoot);
  return bars.sort((a, b) => b.rounds - a.rounds || a.name.localeCompare(b.name));
}

/**
 * How many columns the chart needs: the longest buff on the table, held between a floor
 * that keeps a nearly empty chart from looking broken and a ceiling that stops a nonsense
 * number of rounds from drawing a column apiece. The chart scrolls, so the span is not
 * cut down to whatever happens to fit on screen.
 */
export function timelineSpan(rows: readonly BuffTimelineRow[], min = 4, max = 60): number {
  const longest = rows.reduce((total, row) => Math.max(total, ...row.bars.map((bar) => bar.rounds), 0), 0);
  return clamp(longest, min, max);
}

/** The round each column stands for, counting from the one being played. */
export function timelineColumns(currentRound: number, span: number): number[] {
  const start = Math.max(1, currentRound);
  return Array.from({ length: span }, (_, i) => start + i);
}

/** Columns a bar covers. Every buff starts at the round being played, so it only needs a width. */
export function barColumns(rounds: number, span: number): number {
  return clamp(rounds, 1, span);
}

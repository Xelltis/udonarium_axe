import { effectFamilyRank } from '@axe/domain/effect/effect-families';
import { EffectPreset, presetsShownTo } from '@axe/domain/effect/effect-preset';
import { matchesSearch } from '@axe/features/effect/effect-library-panel/effect-search';

/** Sorting and narrowing the list, kept apart from the panel so the specs can pin it. */

export interface EffectLibraryGroup {
  tag: string;
  presets: EffectPreset[];
}

/** One family in the index beside the list: how many of its effects the list shows now, of how many it has. */
export interface EffectFamilyEntry {
  readonly tag: string;
  readonly count: number;
  readonly total: number;
}

/** Whom an effect reaches: its caster, one piece, several picked one at a time, or everything within a radius. */
export type EffectReach = 'self' | 'single' | 'multi' | 'area';

/** The reaches the list can be narrowed to. One cast on its caster counts with those that take one piece. */
export type ReachFilter = 'single' | 'multi' | 'area';

/** What the list is narrowed by; a null grade or reach lets everything through, as a blank search does. */
export interface EffectListFilter {
  readonly query: string;
  readonly grade: number | null;
  readonly reach: ReachFilter | null;
  /** Whether the reader is the game master, who alone is shown the effects kept for the game master. */
  readonly isGameMaster: boolean;
  /** The text a search is compared with for an effect, as `searchTextOf` makes it. */
  readonly searchText: (preset: EffectPreset) => string;
}

/** Whether an effect preset can be cast on more than one target. */
export function isMultiTarget(preset: EffectPreset): boolean {
  return preset.targetLimit > 1;
}

/** Whom an effect reaches. One with a radius reaches an area, however many pieces it may take in. */
export function reachOf(preset: EffectPreset): EffectReach {
  if (preset.effectTargeting === 'self') return 'self';
  if (preset.areaRadiusCells > 0) return 'area';
  return isMultiTarget(preset) ? 'multi' : 'single';
}

function matchesReach(preset: EffectPreset, reach: ReachFilter | null): boolean {
  if (reach == null) return true;
  const own = reachOf(preset);
  return reach === 'single' ? own === 'single' || own === 'self' : own === reach;
}

/**
 * The effect presets matching the library's search, grade and reach, of those the reader's role is
 * shown.
 */
export function filterPresets(presets: readonly EffectPreset[], filter: EffectListFilter): EffectPreset[] {
  return presetsShownTo(presets, filter.isGameMaster).filter(
    (preset) =>
      (filter.grade == null || preset.gradeLevel === filter.grade) &&
      matchesReach(preset, filter.reach) &&
      matchesSearch(filter.searchText(preset), filter.query)
  );
}

/**
 * Gathers them by family, ordering each family by grade and then by name, as names sort in the
 * reader's language.
 */
export function groupPresets(presets: readonly EffectPreset[], language: string): EffectLibraryGroup[] {
  const groups = new Map<string, EffectPreset[]>();
  for (const preset of presets) {
    const tag = preset.tagName.trim();
    const bucket = groups.get(tag);
    if (bucket) bucket.push(preset);
    else groups.set(tag, [preset]);
  }

  return [...groups.entries()]
    .map(([tag, list]) => ({
      tag,
      presets: [...list].sort(
        (left, right) => left.gradeLevel - right.gradeLevel || left.name.localeCompare(right.name, language)
      ),
    }))
    .sort(
      (left, right) => effectFamilyRank(left.tag) - effectFamilyRank(right.tag) || left.tag.localeCompare(right.tag)
    );
}

/**
 * The index of families beside the list: every family the reader is shown an effect of, in the
 * order the list has them, each with how many of its effects the list shows now. A family the list
 * is narrowed out of stays in the index with none, so the index keeps its rows.
 */
export function familyIndex(
  shownToReader: readonly EffectPreset[],
  listed: readonly EffectLibraryGroup[],
  language: string
): EffectFamilyEntry[] {
  const counts = new Map(listed.map((group) => [group.tag, group.presets.length]));
  return groupPresets(shownToReader, language).map((group) => ({
    tag: group.tag,
    count: counts.get(group.tag) ?? 0,
    total: group.presets.length,
  }));
}

/** Which family the list stands at: the last whose heading has reached the top of what is shown, or the first. */
export function familyAtScroll(tops: readonly { tag: string; top: number }[], scrollTop: number): string | null {
  let current: string | null = tops[0]?.tag ?? null;
  for (const entry of tops) {
    if (entry.top <= scrollTop + 1) current = entry.tag;
  }
  return current;
}

/**
 * How much blank is left under the list for a family's heading to be brought to the top of it: what
 * the list is short of a full view below that heading, and nothing where it has that much already.
 */
export function tailSpaceFor(contentHeight: number, viewHeight: number, headingTop: number): number {
  return Math.max(0, Math.ceil(viewHeight - (contentHeight - headingTop)));
}

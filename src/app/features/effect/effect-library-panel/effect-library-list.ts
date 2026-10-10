import { EffectPreset } from '@axe/domain/effect/effect-preset';

/** Sorting and narrowing the list, kept apart from the panel so the specs can pin it. */

export interface EffectLibraryGroup {
  tag: string;
  presets: EffectPreset[];
}

/** The families of the presets that come with the tool. They are ordered as listed here, and anything else goes to the back. */
const TAG_ORDER: readonly string[] = [
  '物理',
  '打撃',
  '射撃',
  '炎',
  '雷',
  '氷',
  '土',
  '風',
  '闇',
  '時空',
  '回復',
  '状態異常',
  '防御',
  '強化',
  '撃破',
  '範囲',
];

/**
 * Whether an effect preset's name or family contains the search text, ignoring case; an empty
 * search matches everything.
 */
export function matchesQuery(preset: EffectPreset, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length < 1) return true;
  return `${preset.name} ${preset.tagName}`.toLowerCase().includes(needle);
}

/** Whether it takes one target or several. */
export type TargetingFilter = 'single' | 'multi';

/** Whether an effect preset can be cast on more than one target. */
export function isMultiTarget(preset: EffectPreset): boolean {
  return preset.targetLimit > 1;
}

/**
 * The effect presets matching the library's search text, family, grade and targeting filters, where
 * a null filter lets everything through.
 *
 * Presets marked for the game master only are left out unless the viewer is the game master.
 */
export function filterPresets(
  presets: readonly EffectPreset[],
  query: string,
  tag: string | null,
  grade: number | null,
  targeting: TargetingFilter | null = null,
  isGameMaster = true
): EffectPreset[] {
  return presets.filter(
    (preset) =>
      // What belongs to the game master is part of the preparation, so its name stays off the players' list.
      (isGameMaster || !preset.gmOnly) &&
      matchesQuery(preset, query) &&
      (tag == null || preset.tagName === tag) &&
      (grade == null || preset.gradeLevel === grade) &&
      (targeting == null || isMultiTarget(preset) === (targeting === 'multi'))
  );
}

/** Gathers them by family, ordering each family by grade and then by name. */
export function groupPresets(presets: readonly EffectPreset[]): EffectLibraryGroup[] {
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
      presets: [...list].sort((left, right) => left.gradeLevel - right.gradeLevel || compareName(left, right)),
    }))
    .sort((left, right) => tagRank(left.tag) - tagRank(right.tag) || left.tag.localeCompare(right.tag));
}

/**
 * The families used by the presets, without blanks or repeats, in the library's fixed family order
 * with anything else sorted by name after.
 */
export function collectTags(presets: readonly EffectPreset[]): string[] {
  const tags = new Set<string>();
  for (const preset of presets) {
    const tag = preset.tagName.trim();
    if (tag.length > 0) tags.add(tag);
  }
  return [...tags].sort((left, right) => tagRank(left) - tagRank(right) || left.localeCompare(right));
}

function tagRank(tag: string): number {
  if (tag.length < 1) return TAG_ORDER.length + 1;
  const index = TAG_ORDER.indexOf(tag);
  return index < 0 ? TAG_ORDER.length : index;
}

function compareName(left: EffectPreset, right: EffectPreset): number {
  return left.name.localeCompare(right.name, 'ja');
}

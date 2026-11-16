/*
 * The families the effects that come with the tool are sorted into: the order they are listed in,
 * and the colour each is marked with on the list, so that a family is found by the same colour in
 * the index, on its heading and wherever else it is named.
 */

/** A family's colour on each ground: one bright enough for the dark theme, one deep enough for the light. */
export interface EffectFamilyColor {
  readonly dark: string;
  readonly light: string;
}

/** The families of the effects that come with the tool, in the order they are listed. Anything else goes after them. */
export const EFFECT_FAMILY_ORDER: readonly string[] = [
  '物理',
  '打撃',
  '射撃',
  '炎',
  '雷',
  '氷',
  '土',
  '風',
  '闇',
  '聖',
  '時空',
  '回復',
  '状態異常',
  '防御',
  '強化',
  '撃破',
  '組み立て',
];

const FAMILY_COLORS: Readonly<Record<string, EffectFamilyColor>> = {
  物理: { dark: '#c9d1d9', light: '#5c6470' },
  打撃: { dark: '#e0a36a', light: '#9a5a1f' },
  射撃: { dark: '#e3b341', light: '#806000' },
  炎: { dark: '#ff6a3d', light: '#c2410c' },
  雷: { dark: '#f5e04a', light: '#6f6400' },
  氷: { dark: '#79d2ff', light: '#0b6a9e' },
  土: { dark: '#b08968', light: '#75563a' },
  風: { dark: '#7ee0b0', light: '#17734e' },
  闇: { dark: '#a371f7', light: '#7c3aed' },
  聖: { dark: '#fff3b0', light: '#8a6d00' },
  時空: { dark: '#8f9bff', light: '#4a55cf' },
  回復: { dark: '#56d364', light: '#1a7431' },
  状態異常: { dark: '#d18ad6', light: '#9c36a3' },
  防御: { dark: '#58a6ff', light: '#1e5fd6' },
  強化: { dark: '#ffa657', light: '#b0500a' },
  撃破: { dark: '#f85149', light: '#c4202b' },
  組み立て: { dark: '#9aa5b1', light: '#4f5964' },
};

/** The colour of a family the tool has none for: one a table named itself, or no family at all. */
export const OTHER_FAMILY_COLOR: EffectFamilyColor = { dark: '#8b949e', light: '#655c7a' };

/** The colour a family is marked with, a neutral one for a family that did not come with the tool. */
export function effectFamilyColor(family: string): EffectFamilyColor {
  const own = FAMILY_COLORS[family.trim()];
  return own ?? OTHER_FAMILY_COLOR;
}

/**
 * Where a family stands in the list: the families that come with the tool in their own order, then
 * every other family, then the effects of no family.
 */
export function effectFamilyRank(family: string): number {
  if (family.length < 1) return EFFECT_FAMILY_ORDER.length + 1;
  const index = EFFECT_FAMILY_ORDER.indexOf(family);
  return index < 0 ? EFFECT_FAMILY_ORDER.length : index;
}

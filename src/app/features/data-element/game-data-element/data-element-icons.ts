/** A group of marks a heading can wear, under the name the picker shows it by. */
export interface HeadingIconGroup {
  labelKey: string;
  icons: string[];
}

/**
 * The marks offered for a group or section heading, gathered by what they suit. Any mark the
 * bundled font draws can be worn; these are the ones close to hand.
 */
export const HEADING_ICON_GROUPS: readonly HeadingIconGroup[] = [
  {
    labelKey: 'feature.dataElement.iconGroup.character',
    icons: [
      'person',
      'face',
      'account_circle',
      'groups',
      'man',
      'woman',
      'child_care',
      'elderly',
      'back_hand',
      'accessibility',
      'roller_skating',
    ],
  },
  {
    labelKey: 'feature.dataElement.iconGroup.combat',
    icons: [
      'shield',
      'security',
      'gavel',
      'sports_martial_arts',
      'local_fire_department',
      'bolt',
      'whatshot',
      'flash_on',
    ],
  },
  {
    labelKey: 'feature.dataElement.iconGroup.status',
    icons: ['favorite', 'health_and_safety', 'star', 'grade', 'bar_chart', 'trending_up', 'speed', 'military_tech'],
  },
  {
    labelKey: 'feature.dataElement.iconGroup.item',
    icons: ['inventory_2', 'backpack', 'category', 'sell', 'local_pharmacy', 'build', 'key', 'lock'],
  },
  {
    labelKey: 'feature.dataElement.iconGroup.magic',
    icons: ['auto_awesome', 'flare', 'nights_stay', 'wb_sunny', 'blur_on', 'casino', 'psychology', 'emoji_events'],
  },
  {
    labelKey: 'feature.dataElement.iconGroup.memo',
    icons: ['info', 'note', 'description', 'edit_note', 'comment', 'chat', 'sticky_note_2', 'assignment'],
  },
];

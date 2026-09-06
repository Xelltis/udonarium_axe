/** How this reader is looking at the table: along it, or straight down on it. */
export const VIEW_MODES = ['perspective', 'flat'] as const;

export type ViewMode = (typeof VIEW_MODES)[number];

/** How the table stands until a reader says otherwise. */
export const DEFAULT_VIEW_MODE: ViewMode = 'perspective';

export function asViewMode(value: unknown): ViewMode | null {
  return typeof value === 'string' && (VIEW_MODES as readonly string[]).includes(value) ? (value as ViewMode) : null;
}

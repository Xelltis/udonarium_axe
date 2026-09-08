/**
 * The names Tailwind's utilities actually read, and the theme token each one stands for.
 *
 * `styles.css` defines `--color-ui-*: var(--ui-*)` on the root, and a custom property is
 * inherited as the value it resolved to there. Overriding `--ui-elevated` deeper in the tree
 * therefore changes nothing a `bg-ui-elevated` reads: a preview scoped to one element has to
 * set both names. The spec beside this file reads the stylesheet and holds the list in step.
 */
export const TOKEN_ALIASES: Readonly<Record<string, string>> = {
  '--ui-bg': '--color-ui-bg',
  '--ui-surface': '--color-ui-surface',
  '--ui-elevated': '--color-ui-elevated',
  '--ui-panel-bg': '--color-ui-panel',
  '--ui-titlebar-bg': '--color-ui-titlebar',
  '--ui-hover': '--color-ui-hover',
  '--ui-selected': '--color-ui-selected',
  '--ui-menu-bg': '--color-ui-menu',
  '--ui-menu-hover': '--color-ui-menu-hover',
  '--ui-input-bg': '--color-ui-input',
  '--ui-ghost-bg': '--color-ui-ghost',
  '--ui-ghost-header-bg': '--color-ui-ghost-header',
  '--ui-text': '--color-ui-text',
  '--ui-text-muted': '--color-ui-muted',
  '--ui-text-dim': '--color-ui-dim',
  '--ui-accent': '--color-ui-accent',
  '--ui-accent-hover': '--color-ui-accent-hover',
  '--ui-accent-glow': '--color-ui-accent-glow',
  '--ui-accent-bg': '--color-ui-accent-bg',
  '--ui-danger': '--color-ui-danger',
  '--ui-danger-hover': '--color-ui-danger-hover',
  '--ui-danger-glow': '--color-ui-danger-glow',
  '--ui-danger-bg': '--color-ui-danger-bg',
  '--ui-success': '--color-ui-success',
  '--ui-suit-black': '--color-ui-suit-black',
  '--ui-panel-border': '--color-ui-border-panel',
  '--ui-menu-border': '--color-ui-border-menu',
  '--ui-titlebar-border': '--color-ui-border-titlebar',
  '--ui-input-border': '--color-ui-border-input',
  '--ui-menu-separator': '--color-ui-border-separator',
  '--ui-bubble-caret-border': '--color-ui-border-bubble-caret',
};

/** The same colours under both names, for a preview that lives inside the page. */
export function scopedTokens(tokens: Readonly<Record<string, string>>): Record<string, string> {
  const scoped: Record<string, string> = { ...tokens };
  for (const [token, alias] of Object.entries(TOKEN_ALIASES)) {
    const value = tokens[token];
    if (value !== undefined) scoped[alias] = value;
  }
  return scoped;
}

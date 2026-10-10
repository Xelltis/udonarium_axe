import { PanelService } from '@axe/application/ui/panel.service';

/**
 * The windows novel mode opens, by name.
 *
 * Named so that pressing the button that opened one closes it again, and so that they can all
 * be shut when novel mode is left: the panels outlive the screen that opened them, since they
 * are put up outside it.
 */
export const VN_BACKLOG_PANEL = 'vn-backlog';
export const VN_EMOTE_PANEL = 'vn-emote';
export const VN_DISPLAY_PANEL = 'vn-display';
export const VN_DIRECTION_PANEL = 'vn-direction';

export const VISUAL_NOVEL_PANELS: readonly string[] = [
  VN_BACKLOG_PANEL,
  VN_EMOTE_PANEL,
  VN_DISPLAY_PANEL,
  VN_DIRECTION_PANEL,
];

/** Closes every panel novel mode opened, as when novel mode is left; panels not open are skipped. */
export function closeVisualNovelPanels(panelService: PanelService): void {
  for (const name of VISUAL_NOVEL_PANELS) panelService.closeSingle(name);
}

/**
 * Every key the app keeps a value under in this browser's local storage.
 *
 * Kept in one list so that no two settings share a key by accident. A key is never renamed, since
 * what every browser already keeps under the old name would be lost; the names stay as they were
 * first written, whatever pattern later ones follow.
 */
export const STORAGE_KEYS = {
  ambienceFrameStep: 'ui-ambience-frame-step',
  audioAnalyses: 'audio-analyses',
  battleCutIn: 'axe.battle.cutIn',
  battleCutInRemote: 'axe.battle.remote',
  battleCutInWindow: 'axe.battle.window',
  beatLightOff: 'beat-light-off',
  buffIconScale: 'ui-buff-icon-scale',
  buffView: 'ui-buff-view',
  chatAutoFollow: 'chat-auto-follow-scroll',
  chatLogOmitDeleted: 'chat-log-omit-deleted',
  chatLogStyle: 'chat-log-style',
  chatPersonalBookmarks: 'chat-personal-bookmarks',
  chatPreferences: 'chat-preferences',
  compassFace: 'axe.compass.face',
  djDeckOpen: 'mini-jukebox-dj-deck',
  effectAutoPlay: 'axe.effect.autoPlay',
  firstPersonPiece: 'ui-first-person-piece',
  hotbar: 'ui-hotbar',
  hotbarOwner: 'ui-hotbar-owner',
  iconChosenByHand: 'axe.icon.chosenByHand',
  imageEditFirst: 'ui-image-edit-first',
  inventoryCompact: 'ui-inventory-compact',
  inventoryFolded: 'ui-inventory-folded',
  inventoryParts: 'ui-inventory-parts',
  inventoryRoundInPlay: 'ui-inventory-round-in-play',
  inventorySearchBar: 'ui-inventory-search-bar',
  inventoryView: 'ui-inventory-view',
  language: 'ui-lang',
  localMode: 'ui-local-mode',
  mobileLayout: 'ui-mobile-layout',
  motion: 'ui-motion',
  myDice: 'my-dice',
  overviewMemo: 'ui-overview-memo',
  ownerKey: 'udonarium-axe.owner-key',
  panelTransparency: 'ui-panel-transparency',
  personalVolumes: 'audio-personal-volumes',
  pieceOverlay: 'ui-piece-overlay',
  recentEffects: 'axe.effect.recent',
  recentStamps: 'ui-stamp-recent',
  renderLite: 'ui-render-lite',
  replayPreference: 'axe-replay-preference',
  roomSnapshotStopped: 'room-snapshot-stopped',
  serverLogin: 'udonarium-axe.server-login',
  sheetFolded: 'ui-sheet-folded',
  skinDark: 'ui-skin-dark',
  skinLayersDark: 'ui-skin-layers-dark',
  skinLayersLight: 'ui-skin-layers-light',
  skinLight: 'ui-skin-light',
  skinMatDark: 'ui-skin-mat-dark',
  skinMatLight: 'ui-skin-mat-light',
  skinRecipeDark: 'ui-skin-recipe-dark',
  skinRecipeLight: 'ui-skin-recipe-light',
  tabletopDisplay: 'ui-tabletop-display',
  theme: 'ui-theme',
  toolbars: 'ui-toolbars',
  viewMode: 'ui-view-mode',
  visualNovelSettings: 'vn-settings',
  widgetLayout: 'ui-widget-layout',
  widgets: 'ui-widgets',
} as const;

/**
 * The keys made of a prefix, a dot and something of the setting's own, such as the room or the
 * menu it is for. The prefix alone is a key as well where the setting is kept for no room.
 */
export const STORAGE_KEY_PREFIXES = {
  menuLayout: 'axe.menu',
  personalFolders: 'axe.inventory.personal-folders',
} as const;

/** The key a setting kept per room, menu or the like is kept under, the prefix alone for an empty part. */
export function storageKeyFor(prefix: string, part: string): string {
  return part.length > 0 ? `${prefix}.${part}` : prefix;
}

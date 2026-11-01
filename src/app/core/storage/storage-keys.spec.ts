import { STORAGE_KEY_PREFIXES, STORAGE_KEYS, storageKeyFor } from '@axe/core/storage/storage-keys';

describe('the keys the app keeps settings under in the browser', () => {
  it('stays as every browser already keeps them, letter for letter', () => {
    expect(STORAGE_KEYS).toEqual({
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
      foregroundSeeThrough: 'axe.foreground.seeThrough',
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
    });
    expect(STORAGE_KEY_PREFIXES).toEqual({
      menuLayout: 'axe.menu',
      personalFolders: 'axe.inventory.personal-folders',
    });
  });

  it('gives no two settings the same key', () => {
    const keys = Object.values(STORAGE_KEYS);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps no setting under a key a prefix could also make', () => {
    const keys: string[] = Object.values(STORAGE_KEYS);
    for (const prefix of Object.values(STORAGE_KEY_PREFIXES)) {
      for (const key of keys) {
        expect(key === prefix || key.startsWith(`${prefix}.`)).toBe(false);
      }
    }
  });

  it('joins a prefix to the part of its own, or keeps the prefix alone for an empty part', () => {
    expect(storageKeyFor(STORAGE_KEY_PREFIXES.menuLayout, 'fab')).toBe('axe.menu.fab');
    expect(storageKeyFor(STORAGE_KEY_PREFIXES.personalFolders, '')).toBe('axe.inventory.personal-folders');
  });
});

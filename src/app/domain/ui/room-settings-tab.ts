/** The parts the room's settings are read in. */
export const ROOM_SETTINGS_TABS = ['general', 'battle', 'move', 'ui', 'archive', 'utility'] as const;

export type RoomSettingsTab = (typeof ROOM_SETTINGS_TABS)[number];

/**
 * The parts the UI settings are read in.
 *
 * They answer to different people and describe different things: what the room shows
 * everyone, the colours this screen is dressed in, and what a screen laid on a table wants.
 * Read down one list they were hard to tell apart.
 */
export const ROOM_SETTINGS_UI_TABS = ['shared', 'skin', 'tabletop'] as const;

export type RoomSettingsUiTab = (typeof ROOM_SETTINGS_UI_TABS)[number];

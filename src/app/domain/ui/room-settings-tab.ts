/** The parts the room's settings are read in. */
export const ROOM_SETTINGS_TABS = ['general', 'battle', 'move', 'display', 'archive', 'utility'] as const;

export type RoomSettingsTab = (typeof ROOM_SETTINGS_TABS)[number];

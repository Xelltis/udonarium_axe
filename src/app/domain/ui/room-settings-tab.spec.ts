import { ROOM_SETTINGS_TABS, ROOM_SETTINGS_UI_TABS } from '@axe/domain/ui/room-settings-tab';

describe('the parts the room settings are read in', () => {
  it('names each part once', () => {
    expect(new Set(ROOM_SETTINGS_TABS).size).toBe(ROOM_SETTINGS_TABS.length);
    expect(new Set(ROOM_SETTINGS_UI_TABS).size).toBe(ROOM_SETTINGS_UI_TABS.length);
  });

  it('opens the UI settings on what the room shows everyone', () => {
    expect(ROOM_SETTINGS_UI_TABS[0]).toBe('shared');
  });
});

import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  isMenuCommandOffered,
  MENU_COMMANDS,
  MENU_SURFACES,
  menuCommandFits,
  menuCommandOf,
  menuCommandsFor,
  MenuSurface,
} from '@axe/domain/ui/menu-command';
import { ROOM_PANELS } from '@axe/domain/ui/room-panel';

describe('the table of what a menu can do', () => {
  it('gives every command a name of its own', () => {
    const keys = MENU_COMMANDS.map((command) => command.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every command a mark and a name to show', () => {
    for (const command of MENU_COMMANDS) {
      expect(command.icon.length).toBeGreaterThan(0);
      expect(command.labelKey.length).toBeGreaterThan(0);
    }
  });

  it('only opens panels the room has', () => {
    for (const command of MENU_COMMANDS) {
      if (command.action.kind !== 'panel') continue;
      expect(ROOM_PANELS).toContain(command.action.panel);
    }
  });

  it('puts every command on at least one menu, and names no menu twice', () => {
    for (const command of MENU_COMMANDS) {
      expect(command.surfaces.length).toBeGreaterThan(0);
      expect(new Set(command.surfaces).size).toBe(command.surfaces.length);
      for (const surface of command.surfaces) expect(MENU_SURFACES).toContain(surface);
    }
  });

  describe('menuCommandOf', () => {
    it('finds a command by name', () => {
      expect(menuCommandOf('chat')?.action).toEqual({ kind: 'panel', panel: 'chatWindow' });
    });

    it('answers nothing for a name this version does not know', () => {
      expect(menuCommandOf('somethingAVersionToComeWillHave')).toBeNull();
    });
  });

  describe('who a command is offered to', () => {
    function commandFor(key: string) {
      const command = menuCommandOf(key);
      expect(command).toBeTruthy();
      return command!;
    }

    it('offers what anyone may have to all three roles', () => {
      const chat = commandFor('chat');
      expect(isMenuCommandOffered(chat, PeerRole.GameMaster)).toBe(true);
      expect(isMenuCommandOffered(chat, PeerRole.Player)).toBe(true);
      expect(isMenuCommandOffered(chat, PeerRole.Guest)).toBe(true);
    });

    it("keeps the master's own from everybody else", () => {
      const editor = commandFor('mapEditor');
      expect(isMenuCommandOffered(editor, PeerRole.GameMaster)).toBe(true);
      expect(isMenuCommandOffered(editor, PeerRole.Player)).toBe(false);
      expect(isMenuCommandOffered(editor, PeerRole.Guest)).toBe(false);
    });

    it('keeps what is played with from those only watching', () => {
      const hand = commandFor('handRail');
      expect(isMenuCommandOffered(hand, PeerRole.GameMaster)).toBe(true);
      expect(isMenuCommandOffered(hand, PeerRole.Player)).toBe(true);
      expect(isMenuCommandOffered(hand, PeerRole.Guest)).toBe(false);
    });

    it("offers a player's own bar to the players alone", () => {
      const bar = commandFor('widgetPlToolbar');
      expect(isMenuCommandOffered(bar, PeerRole.Player)).toBe(true);
      expect(isMenuCommandOffered(bar, PeerRole.GameMaster)).toBe(false);
      expect(isMenuCommandOffered(bar, PeerRole.Guest)).toBe(false);
    });
  });

  describe('where a command may be put', () => {
    it('keeps what draws itself to the menu it was drawn for', () => {
      const persona = menuCommandOf('persona')!;
      expect(menuCommandFits(persona, 'gmToolbar')).toBe(true);
      expect(menuCommandFits(persona, 'plToolbar')).toBe(false);
      expect(menuCommandFits(persona, 'fab')).toBe(false);
    });

    it('offers a menu only what fits it and what the role may have', () => {
      const offered = menuCommandsFor('plToolbar', PeerRole.Player).map((command) => command.key);
      expect(offered).toContain('activeCharacter');
      expect(offered).not.toContain('persona');
      expect(offered).not.toContain('mapEditor');
    });

    it('offers a guest nothing that acts on the table', () => {
      const offered = menuCommandsFor('fab', PeerRole.Guest).map((command) => command.key);
      expect(offered).toContain('chat');
      expect(offered).not.toContain('zipLoad');
      expect(offered).not.toContain('darkness');
    });

    it('leaves a small menu open behind a switch of this seat, and closes it behind anything else', () => {
      const stays = (key: string) => MENU_COMMANDS.find((command) => command.key === key)?.stays === true;

      expect(['theme', 'language', 'motion', 'renderLite', 'viewMode'].every(stays)).toBe(true);
      expect(['widgetClock', 'widgetMiniPlayer', 'widgetPlToolbar'].every(stays)).toBe(true);
      expect(['skin', 'inventory', 'zipLoad', 'handRail', 'visualNovel', 'useMobileLayout'].some(stays)).toBe(false);
    });

    it('keeps the names the tests reached the drawer by before it was arranged', () => {
      const testIdOf = (key: string) => MENU_COMMANDS.find((command) => command.key === key)?.testId;

      expect(testIdOf('handRail')).toBe('fab-entry-hand');
      expect(testIdOf('theme')).toBe('seat-theme');
      expect(testIdOf('zipLoad')).toBe('save-load-load');
    });

    it('offers every menu something', () => {
      for (const surface of MENU_SURFACES as readonly MenuSurface[]) {
        expect(menuCommandsFor(surface, PeerRole.GameMaster).length).toBeGreaterThan(0);
      }
    });
  });
});

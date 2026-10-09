import { TestBed } from '@angular/core/testing';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { MenuCommand, menuCommandOf } from '@axe/domain/ui/menu-command';
import { MenuCommandService } from '@axe/features/menu/menu-command.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MenuCommandService', () => {
  let commands: MenuCommandService;

  function commandOf(key: string): MenuCommand {
    const command = menuCommandOf(key);
    expect(command).toBeTruthy();
    return command!;
  }

  function seatAs(role: PeerRole): void {
    const cursor = PeerCursor.createMyCursor();
    cursor.role = role;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    commands = TestBed.inject(MenuCommandService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
  });

  describe('the entries of an arrangement', () => {
    const WITH_A_GROUP = {
      nodes: [
        { id: 'chat', command: 'chat' },
        { id: 'table', icon: 'folder', label: '卓', items: [{ id: 'tableSetting', command: 'tableSetting' }] },
      ],
    };

    it('keeps a small menu whole for a menu that can open one', () => {
      seatAs(PeerRole.Player);

      expect(commands.viewOf(WITH_A_GROUP).map((node) => node.id)).toEqual(['chat', 'table']);
    });

    it('gives up what a small menu holds to a bar that has nowhere to open one', () => {
      seatAs(PeerRole.Player);

      expect(commands.entriesOf(WITH_A_GROUP).map((entry) => entry.command.key)).toEqual(['chat', 'tableSetting']);
    });
  });

  describe('what it will do', () => {
    it('opens a panel for a command anybody may have', () => {
      seatAs(PeerRole.Player);
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});

      expect(commands.run(commandOf('chat'))).toBe('done');
      expect(open).toHaveBeenCalledWith('chatWindow');
    });

    it('switches a widget on and off', () => {
      seatAs(PeerRole.Player);
      const widgets = TestBed.inject(WidgetVisibilityService);
      const before = widgets.clock();

      expect(commands.run(commandOf('widgetClock'))).toBe('done');

      expect(widgets.clock()).toBe(!before);
    });

    it('leaves what draws itself to whoever draws it', () => {
      seatAs(PeerRole.GameMaster);

      expect(commands.run(commandOf('persona'))).toBe('drawsItself');
    });

    it('says so rather than saving when no screen has offered to', () => {
      seatAs(PeerRole.Player);

      expect(commands.run(commandOf('save'))).toBe('noHost');
    });

    it('saves through the screen once one has offered to', () => {
      seatAs(PeerRole.Player);
      const save = vi.fn();
      commands.registerHost({ save, chooseFilesToLoad: () => {}, isSaving: () => false });

      expect(commands.run(commandOf('save'))).toBe('done');
      expect(save).toHaveBeenCalled();
    });

    it('brings out the guide to the buttons for anybody, watchers among them', () => {
      seatAs(PeerRole.Guest);
      const guide = TestBed.inject(ButtonGuideService);

      expect(commands.run(commandOf('buttonGuide'))).toBe('done');
      expect(guide.shown()).toBe(true);

      commands.run(commandOf('buttonGuide'));
      expect(guide.shown()).toBe(true);
    });

    it('puts the guide away once anything else is pressed', () => {
      seatAs(PeerRole.Player);
      vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});
      const guide = TestBed.inject(ButtonGuideService);
      guide.show();

      commands.run(commandOf('inventory'));

      expect(guide.shown()).toBe(false);
    });
  });

  describe('who it will do it for', () => {
    it("refuses a watcher the master's own command, panel and all", () => {
      seatAs(PeerRole.Guest);
      const open = vi.spyOn(TestBed.inject(RoomPanelService), 'open').mockImplementation(() => {});

      expect(commands.run(commandOf('mapEditor'))).toBe('notOffered');
      expect(open).not.toHaveBeenCalled();
    });

    it('refuses a player a command the master alone has, however it was asked for', () => {
      seatAs(PeerRole.Player);
      const overlay = TestBed.inject(PieceOverlayPreferenceService);
      const before = overlay.resourceBars();

      // The darkness is the master's; asking for it directly must not go round the drawing.
      expect(commands.run(commandOf('darkness'))).toBe('notOffered');
      expect(overlay.resourceBars()).toBe(before);
    });

    it('offers a watcher what harms nothing', () => {
      seatAs(PeerRole.Guest);

      expect(commands.offers(commandOf('chat'))).toBe(true);
      expect(commands.offers(commandOf('zipLoad'))).toBe(false);
    });
  });

  describe('how it reads now', () => {
    it('says which way a switch stands', () => {
      seatAs(PeerRole.Player);
      const widgets = TestBed.inject(WidgetVisibilityService);
      const clock = commandOf('widgetClock');

      const before = commands.litOf(clock);
      commands.run(clock);

      expect(commands.litOf(clock)).toBe(!before);
      expect(widgets.clock()).toBe(!before);
    });

    it('has nothing to say about the way a panel stands', () => {
      seatAs(PeerRole.Player);

      expect(commands.litOf(commandOf('chat'))).toBeNull();
    });

    it('names the buffs by whether they are drawn', () => {
      seatAs(PeerRole.Player);
      const overlay = TestBed.inject(PieceOverlayPreferenceService);
      const buffs = commandOf('buffs');
      const shown = overlay.buffs();

      expect(commands.labelKeyOf(buffs)).toBe(shown ? 'app.fab.buffsShown' : 'app.fab.buffsHidden');
      expect(commands.iconOf(buffs)).toBe(shown ? 'auto_fix_high' : 'auto_fix_off');
    });

    it('switches what the characters say over their pieces, and names it by whether it is drawn', () => {
      seatAs(PeerRole.Guest);
      const overlay = TestBed.inject(PieceOverlayPreferenceService);
      const speech = commandOf('speechBubbles');
      const shown = overlay.speech();

      expect(commands.labelKeyOf(speech)).toBe(shown ? 'app.fab.speechShown' : 'app.fab.speechHidden');
      commands.run(speech);
      expect(overlay.speech()).toBe(!shown);
      expect(commands.litOf(speech)).toBe(!shown);
      expect(commands.iconOf(speech)).toBe(shown ? 'speaker_notes_off' : 'chat_bubble');
      commands.run(speech);
    });

    it('writes the language out rather than drawing a mark for it', () => {
      seatAs(PeerRole.Player);

      expect(commands.textOf(commandOf('language'))?.length).toBeGreaterThan(0);
      expect(commands.textOf(commandOf('chat'))).toBeNull();
    });

    it('keeps the small-screen switch out of the way on a wide screen', () => {
      seatAs(PeerRole.Player);

      expect(commands.isAvailable(commandOf('useMobileLayout'))).toBe(false);
      expect(commands.isAvailable(commandOf('chat'))).toBe(true);
    });
  });
});

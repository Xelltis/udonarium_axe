import { TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { GameCharacterSheetComponent } from '@axe/features/character/game-character-sheet/game-character-sheet.component';
import { ChatPaletteComponent } from '@axe/features/chat/chat-palette/chat-palette.component';
import { RemoteControllerComponent } from '@axe/features/controller/remote-controller/remote-controller.component';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ObjectPanelService', () => {
  let service: ObjectPanelService;
  let openLazy: ReturnType<typeof vi.fn>;
  let selectObject: ReturnType<typeof vi.spyOn>;

  const character = { identifier: 'c1', aliasName: 'character', name: 'Alice' } as GameCharacter;
  const terrain = { identifier: 't1', aliasName: 'terrain', name: 'Hill' } as Terrain;

  beforeEach(() => {
    openLazy = vi.fn();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(PanelService, { useValue: { openLazy } });
    TestBed.overrideProvider(PointerDeviceService, { useValue: { pointers: [{ x: 1000, y: 700 }] } });
    selectObject = vi.spyOn(TestBed.inject(SelectionSignalService), 'selectObject');
    service = TestBed.inject(ObjectPanelService);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('centres a sheet on the pointer and selects what it shows', async () => {
    service.openSheet(terrain, 'Terrain - Hill', { width: 600, height: 300 });

    expect(selectObject).toHaveBeenCalledWith('t1', 'terrain');
    const [load, option, setup] = openLazy.mock.calls[0];
    expect(option).toEqual(
      expect.objectContaining({ title: 'Terrain - Hill', width: 600, height: 300, left: 700, top: 550 })
    );
    await expect(load()).resolves.toBe(GameCharacterSheetComponent);
    const sheet = { tabletopObject: null } as unknown as GameCharacterSheetComponent;
    setup(sheet);
    expect(sheet.tabletopObject).toBe(terrain);
  });

  it('offers to send the panel to a window of its own', () => {
    service.openSheet(terrain, 'Terrain - Hill', { width: 600, height: 300 });

    const [, option] = openLazy.mock.calls[0];
    expect(option.controls?.map((control: { icon: string }) => control.icon)).toEqual(['open_in_new']);
  });

  it('takes a point and an offset of its own', () => {
    service.openSheet(
      terrain,
      'Terrain',
      { width: 600, height: 600 },
      { at: { x: 40, y: 50 }, offset: { x: -20, y: -30 } }
    );

    expect(openLazy.mock.calls[0][1]).toEqual(expect.objectContaining({ left: 60, top: 80 }));
  });

  it('names the character sheet after its character and hangs it to the left', () => {
    service.openCharacterSheet(character, { single: 'sheet:c1' });

    const option = openLazy.mock.calls[0][1];
    expect(option.title).toContain('Alice');
    expect(option).toEqual(
      expect.objectContaining({ width: 800, height: 600, left: 200, top: 400, single: 'sheet:c1' })
    );
  });

  it('opens the chat palette centred and the remote controller near the pointer', async () => {
    service.openChatPalette(character);
    service.openRemoteController(character);

    const [paletteLoad, palette] = openLazy.mock.calls[0];
    const [remoteLoad, remote] = openLazy.mock.calls[1];
    expect(palette).toEqual(expect.objectContaining({ width: 760, height: 500, left: 620, top: 450 }));
    expect(palette.single).toBeUndefined();
    expect(remote).toEqual(expect.objectContaining({ width: 700, height: 600, left: 750, top: 525 }));
    await expect(paletteLoad()).resolves.toBe(ChatPaletteComponent);
    await expect(remoteLoad()).resolves.toBe(RemoteControllerComponent);
  });
});

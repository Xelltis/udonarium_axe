import { TestBed } from '@angular/core/testing';
import { DoorService } from '@axe/application/tabletop/door.service';
import { TablePiecesService } from '@axe/application/tabletop/table-pieces.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('DoorService', () => {
  let doors: DoorService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;
    doors = TestBed.inject(DoorService);
    vi.spyOn(SoundEffect, 'play').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function doorAt(col: number, row: number, pictured = true): Terrain {
    const door = Terrain.create('扉', 1, 1, 2, pictured ? 'wall.png' : '', pictured ? 'floor.png' : '');
    door.doorStyle = DoorStyle.SWING;
    door.location = { name: 'table', x: col * 50, y: row * 50 };
    table.appendChild(door);
    return door;
  }

  it('opens and shuts a door a player is shown, with the sound of it', () => {
    PeerCursor.createMyCursor().role = PeerRole.Player;
    const door = doorAt(2, 2);

    expect(doors.toggle(door)).toBe(true);
    expect(door.isDoorOpen).toBe(true);
    expect(SoundEffect.play).toHaveBeenLastCalledWith(PresetSound.unlock);

    expect(doors.setOpen(door, false)).toBe(true);
    expect(door.isDoorOpen).toBe(false);
    expect(SoundEffect.play).toHaveBeenLastCalledWith(PresetSound.lock);
  });

  it('leaves alone, without a sound, a door of glass a player is not shown, and opens it for the master', () => {
    PeerCursor.createMyCursor().role = PeerRole.Player;
    const glass = doorAt(2, 2, false);

    expect(doors.mayWork(glass)).toBe(false);
    expect(doors.toggle(glass)).toBe(false);
    expect(glass.isDoorOpen).toBe(false);
    expect(SoundEffect.play).not.toHaveBeenCalled();

    PeerCursor.myCursor.role = PeerRole.GameMaster;
    expect(doors.toggle(glass)).toBe(true);
    expect(glass.isDoorOpen).toBe(true);
  });

  it('opens no block this seat is not shown, whatever keeps it from the seat', () => {
    PeerCursor.createMyCursor().role = PeerRole.GameMaster;
    const door = doorAt(2, 2);
    vi.spyOn(TestBed.inject(TablePiecesService), 'isBlockShown').mockReturnValue(false);

    expect(doors.toggle(door)).toBe(false);
    expect(door.isDoorOpen).toBe(false);
  });

  it('opens nothing for a guest, nor a block that is no door', () => {
    PeerCursor.createMyCursor().role = PeerRole.Guest;
    const door = doorAt(2, 2);
    expect(doors.toggle(door)).toBe(false);

    PeerCursor.myCursor.role = PeerRole.Player;
    door.setDoor(DoorStyle.NONE);
    expect(doors.toggle(door)).toBe(false);
    expect(door.isDoorOpen).toBe(false);
    expect(SoundEffect.play).not.toHaveBeenCalled();
  });
});

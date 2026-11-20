import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { TestBed } from '@angular/core/testing';
import { ResourceSliderService } from '@axe/application/character/resource-slider.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** The sources under a folder, their specs left out. */
function sourcesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourcesIn(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('RoomSettingsAccessService', () => {
  let access: RoomSettingsAccessService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    table = new GameTable();
    table.initialize();
    access = TestBed.inject(RoomSettingsAccessService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    Config.forget();
  });

  describe('a rule of play', () => {
    it('reads as the table rules it until the room answers, and writing it is the room answering', () => {
      table.zocRange = 3;
      const reach = access.setting('zocRange');

      expect(reach.value).toBe(3);

      reach.value = 4.6;

      expect(Config.instance.zocRange).toBe(4);
      expect(reach.value).toBe(4);
      expect(table.zocRange).toBe(3);
    });

    it('is written by a player as well as the master', () => {
      PeerCursor.myCursor.role = PeerRole.Player;

      access.setting('zocEngages').value = true;

      expect(Config.instance.zocEngages).toBe(true);
    });

    it('is told of at once as it is written, so a part reading it reads it anew in the same turn', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      const sliders = TestBed.inject(ResourceSliderService);
      expect(sliders.roomDefault()).toBe(false);

      access.setting('resourceSliderByDefault').value = true;

      expect(sliders.roomDefault()).toBe(true);
      access.setting('resourceSliderByDefault').value = false;
    });

    it('is not written by somebody watching', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;

      access.setting('zocEngages').value = true;

      expect(Config.instance.zocEngages).toBeNull();
    });

    it('is written by the master alone where it is what every screen shows', () => {
      PeerCursor.myCursor.role = PeerRole.Player;

      access.setting('pieceImageInCell').value = true;

      expect(Config.instance.pieceImageInCell).toBeNull();
    });
  });

  describe('an answer the room writes', () => {
    it('trims a word, and takes an empty one as no answer', () => {
      const kinds = access.setting('moveKinds');

      kinds.value = '  全力:3:  ';
      expect(Config.instance.moveKinds).toBe('全力:3:');
      expect(kinds.value).toBe('全力:3:');

      kinds.value = '   ';
      expect(Config.instance.moveKinds).toBeNull();
      expect(kinds.value).toBe('');
    });

    it('takes a number the rule does not take, or none at all, as no answer', () => {
      const fall = access.setting('fallMinM');

      fall.value = 0;
      expect(Config.instance.fallMinM).toBe(0);

      fall.value = -1;
      expect(Config.instance.fallMinM).toBeNull();

      fall.value = Number.NaN;
      expect(fall.value).toBe(2);
    });

    it('takes a no as no answer', () => {
      const zones = access.setting('zoneEnabled');

      zones.value = true;
      expect(Config.instance.zoneEnabled).toBe(true);

      zones.value = false;
      expect(Config.instance.zoneEnabled).toBeNull();
      expect(zones.value).toBe(false);
    });
  });

  it('writes a setting the master keeps for every screen only for the master', () => {
    const bubbles = access.setting('speechBubblesEnabled');

    PeerCursor.myCursor.role = PeerRole.Player;
    bubbles.value = false;

    expect(Config.instance.speechBubblesEnabled).toBe(true);
  });

  it("leaves who may write a setting of the room's config, and how it is kept, to the one table: no part writes the config itself", () => {
    const written = /(?:Config\.instance|\.config\(\))(?:\.\w+|\[[^\]]+\])\s*=(?!=)/;
    const parts = sourcesIn('src/app/features/room-settings').filter((path) =>
      written.test(readFileSync(path, 'utf-8'))
    );

    expect(parts).toEqual([]);
  });

  it('writes what this screen alone shows whoever is reading', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    const ticker = access.displayField('multiAngleTickerPixelsPerSecond', Number);

    ticker.value = '90' as never;

    expect(ticker.value).toBe(90);
  });
});

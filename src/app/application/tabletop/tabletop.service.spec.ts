import { inject, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import {
  TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY,
  TabletopDisplaySettingsService,
} from '@axe/application/ui/tabletop-display-settings.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TabletopService', () => {
  beforeEach(() => {
    localStorage.removeItem('ui-view-mode');
    localStorage.removeItem(TABLETOP_DISPLAY_SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [...TEST_PROVIDERS, TabletopService],
    });
  });

  it('should be created', inject([TabletopService], (service: TabletopService) => {
    expect(service).toBeTruthy();
  }));

  describe('lightSources', () => {
    it('brings the lights of the table being looked at, and leaves the other table its own', async () => {
      const service = TestBed.inject(TabletopService);
      const here = new GameTable();
      here.initialize();
      const there = new GameTable();
      there.initialize();
      const lamp = LightSource.create('lamp');
      lamp.location = { name: 'table', x: 0, y: 0 };
      there.appendChild(lamp);
      TableSelecter.instance.viewTableIdentifier = here.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.lightSources).toEqual([]);

      TableSelecter.instance.viewTableIdentifier = there.identifier;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.lightSources.map((light) => light.identifier)).toEqual([lamp.identifier]);

      here.destroy();
      there.destroy();
    });
  });

  describe('currentTableVersion', () => {
    let table: GameTable;

    beforeEach(() => {
      table = new GameTable();
      table.initialize();
      TableSelecter.instance.viewTableIdentifier = table.identifier;
    });

    afterEach(() => {
      ObjectStore.instance.remove(table);
    });

    /**
     * It hands back the same table every time, so under the default equality a new version never reaches anything downstream.
     * It shows up as an edit that never appears on screen.
     */
    it('carries a change to the table through to everything derived from it', async () => {
      const service = TestBed.inject(TabletopService);
      expect(service.gridSize()).toBe(table.gridSize);
      expect(service.mode2d()).toBe(false);
      expect(service.orthographicProjection()).toBe(false);

      table.gridSize = 77;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.gridSize()).toBe(77);
    });

    it('lies flat only where this reader asked for that, whatever table is out', () => {
      const service = TestBed.inject(TabletopService);
      expect(service.mode2d()).toBe(false);

      TestBed.inject(ViewModePreferenceService).choose('flat');

      expect(service.mode2d()).toBe(true);
      // Perspective is dropped for a screen laid flat, which only the device knows it is.
      expect(service.orthographicProjection()).toBe(false);
    });

    it.each([
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ])('combines shared 2D %s and local tabletop display %s into effective 2D %s', async (shared, local, effective) => {
      const service = TestBed.inject(TabletopService);
      table.mode2d = shared;
      TestBed.inject(TabletopDisplaySettingsService).patch({ enabled: local });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.sharedMode2d()).toBe(shared);
      expect(service.tabletopDisplayMode()).toBe(local);
      expect(service.mode2d()).toBe(effective);
    });
  });
});

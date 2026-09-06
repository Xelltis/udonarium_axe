import { inject, TestBed } from '@angular/core/testing';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { SeatDisplayPreferenceService } from '@axe/application/ui/seat-display-preference.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TabletopService', () => {
  beforeEach(() => {
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

    it('lies flat where this reader asked for that, whatever the table recommends', () => {
      const service = TestBed.inject(TabletopService);
      expect(service.mode2d()).toBe(false);

      TestBed.inject(ViewModePreferenceService).choose('flat');

      expect(service.mode2d()).toBe(true);
    });

    it.each([
      ['auto', false, false],
      ['auto', true, true],
      ['perspective', false, false],
      ['perspective', true, false],
      ['flat', false, true],
      ['flat', true, true],
    ] as const)(
      'gives a seat asking for %s over a table recommending flat %s an effective 2D of %s',
      async (seat, recommendsFlat, effective) => {
        const service = TestBed.inject(TabletopService);
        table.mode2d = recommendsFlat;
        TestBed.inject(ViewModePreferenceService).choose(seat);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(service.recommendsFlat()).toBe(recommendsFlat);
        expect(service.seatViewMode()).toBe(seat);
        expect(service.mode2d()).toBe(effective);
      }
    );

    it('drops the perspective the table asks to be drawn without, but only while it is seen flat', async () => {
      const service = TestBed.inject(TabletopService);
      table.orthographicProjection = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.orthographicProjection()).toBe(false);

      table.mode2d = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.orthographicProjection()).toBe(true);
    });

    it('answers with what this screen was told, and with the table for the rest', async () => {
      const service = TestBed.inject(TabletopService);
      table.multiAngleEnabled = true;
      table.multiAngleTickerEnabled = true;
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(service.display().multiAngleEnabled).toBe(true);

      TestBed.inject(SeatDisplayPreferenceService).set({ multiAngleEnabled: false });

      expect(service.display().multiAngleEnabled).toBe(false);
      expect(service.display().multiAngleTickerEnabled).toBe(true);

      TestBed.inject(SeatDisplayPreferenceService).forget();

      expect(service.display().multiAngleEnabled).toBe(true);
    });
  });
});

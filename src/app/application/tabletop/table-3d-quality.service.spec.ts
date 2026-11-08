import { TestBed } from '@angular/core/testing';
import { Table3dQualityService } from '@axe/application/tabletop/table-3d-quality.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { TABLE_3D_QUALITY } from '@axe/infrastructure/table-3d/table-3d-quality';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('Table3dQualityService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEYS.tableQuality);
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => localStorage.removeItem(STORAGE_KEYS.tableQuality));

  it('is left to the screen until the seat chooses, and draws at standard where nothing asks for less', () => {
    TestBed.inject(RenderLiteService).setting.set('off');
    const quality = TestBed.inject(Table3dQualityService);

    expect(quality.setting()).toBe('auto');
    expect(quality.quality()).toBe('standard');
    expect(quality.plan()).toBe(TABLE_3D_QUALITY.standard);
  });

  it('left to the screen, draws at its best once a graphics card is found to draw it, and lightly still where asked', () => {
    const lite = TestBed.inject(RenderLiteService);
    lite.setting.set('off');
    const quality = TestBed.inject(Table3dQualityService);

    quality.knowGraphicsCard(true);
    expect(quality.quality()).toBe('high');

    lite.setting.set('on');
    expect(quality.quality()).toBe('light');
  });

  it('left to the screen, draws lightly where the seat asked for the table to be drawn lightly', () => {
    TestBed.inject(RenderLiteService).setting.set('on');

    expect(TestBed.inject(Table3dQualityService).quality()).toBe('light');
  });

  it('remembers a choice in this browser, and takes it up again on the next visit', () => {
    TestBed.inject(Table3dQualityService).set('high');
    expect(localStorage.getItem(STORAGE_KEYS.tableQuality)).toBe('high');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    expect(TestBed.inject(Table3dQualityService).quality()).toBe('high');
  });

  it('leaves a choice it does not know to the screen', () => {
    localStorage.setItem(STORAGE_KEYS.tableQuality, 'ultra');

    expect(TestBed.inject(Table3dQualityService).setting()).toBe('auto');
  });
});

import { TestBed } from '@angular/core/testing';
import { parseWidgetVisibility, WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { refuseLocalStorage } from '@axe/testing/refused-storage';
import { beforeEach, describe, expect, it } from 'vitest';

describe('parseWidgetVisibility', () => {
  it('shows the mini player and the game clock with nothing saved', () => {
    expect(parseWidgetVisibility(null)).toEqual({
      clock: false,
      gameClock: true,
      compass: false,
      miniPlayer: true,
      connectionQuality: false,
      recording: true,
      renderStats: false,
      hotbar: false,
      plToolbar: true,
      gmToolbar: true,
    });
  });

  it('reads the saved state', () => {
    expect(
      parseWidgetVisibility(
        '{"clock":true,"gameClock":false,"miniPlayer":false,"connectionQuality":true,"recording":false,"review":1}'
      )
    ).toEqual({
      clock: true,
      gameClock: false,
      compass: false,
      miniPlayer: false,
      connectionQuality: true,
      recording: false,
      renderStats: false,
      hotbar: false,
      plToolbar: true,
      gmToolbar: true,
    });
  });

  it('falls back to the defaults for a broken value', () => {
    expect(parseWidgetVisibility('{')).toEqual({
      clock: false,
      gameClock: true,
      compass: false,
      miniPlayer: true,
      connectionQuality: false,
      recording: true,
      renderStats: false,
      hotbar: false,
      plToolbar: true,
      gmToolbar: true,
    });
    expect(parseWidgetVisibility('null')).toEqual({
      clock: false,
      gameClock: true,
      compass: false,
      miniPlayer: true,
      connectionQuality: false,
      recording: true,
      renderStats: false,
      hotbar: false,
      plToolbar: true,
      gmToolbar: true,
    });
  });

  it('shows both toolbars for a seat saved before they could be hidden, and keeps one it hid', () => {
    const saved = '{"clock":true,"miniPlayer":false,"connectionQuality":true,"recording":false,"hotbar":true}';
    expect(parseWidgetVisibility(saved)).toMatchObject({ plToolbar: true, gmToolbar: true });
    expect(parseWidgetVisibility('{"plToolbar":false,"gmToolbar":"false"}')).toMatchObject({
      plToolbar: false,
      gmToolbar: true,
    });
  });

  it('shows the game clock once to a seat saved before it was shown from the start, which may hide it again', () => {
    expect(parseWidgetVisibility('{"clock":true,"gameClock":false}')).toMatchObject({ clock: true, gameClock: true });
    expect(parseWidgetVisibility('{"gameClock":false,"review":1}')).toMatchObject({ gameClock: false });
  });

  it('fills in only the missing entries', () => {
    expect(parseWidgetVisibility('{"clock":true,"review":1}')).toEqual({
      clock: true,
      gameClock: true,
      compass: false,
      miniPlayer: true,
      connectionQuality: false,
      recording: true,
      renderStats: false,
      hotbar: false,
      plToolbar: true,
      gmToolbar: true,
    });
  });
});

describe('WidgetVisibilityService', () => {
  let service: WidgetVisibilityService;

  beforeEach(() => {
    localStorage.removeItem('ui-widgets');
    TestBed.configureTestingModule({});
    service = TestBed.inject(WidgetVisibilityService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows only the mini player by default', () => {
    expect(service.clock()).toBe(false);
    expect(service.compass()).toBe(false);
    expect(service.miniPlayer()).toBe(true);
    expect(service.connectionQuality()).toBe(false);
    expect(service.recording()).toBe(true);
    expect(service.renderStats()).toBe(false);
    expect(service.hotbar()).toBe(false);
    expect(service.plToolbar()).toBe(true);
    expect(service.gmToolbar()).toBe(true);
  });

  it('shows the game clock from the start, and keeps it hidden once the seat hides it', () => {
    expect(service.gameClock()).toBe(true);

    service.toggleGameClock();
    TestBed.tick();

    expect(parseWidgetVisibility(localStorage.getItem('ui-widgets')).gameClock).toBe(false);
  });

  it('toggles each one independently', () => {
    service.toggleClock();
    expect(service.clock()).toBe(true);
    expect(service.miniPlayer()).toBe(true);

    service.toggleMiniPlayer();
    expect(service.miniPlayer()).toBe(false);
    expect(service.clock()).toBe(true);

    service.toggleConnectionQuality();
    expect(service.connectionQuality()).toBe(true);
    expect(service.clock()).toBe(true);
    expect(service.miniPlayer()).toBe(false);

    service.toggleHotbar();
    expect(service.hotbar()).toBe(true);
    expect(service.connectionQuality()).toBe(true);

    service.togglePlToolbar();
    expect(service.plToolbar()).toBe(false);
    expect(service.gmToolbar()).toBe(true);

    service.toggleGmToolbar();
    expect(service.gmToolbar()).toBe(false);
    expect(service.plToolbar()).toBe(false);

    service.toggleCompass();
    expect(service.compass()).toBe(true);
    expect(service.clock()).toBe(true);
  });

  it('still shows and hides widgets where the browser refuses to keep the choice', () => {
    TestBed.resetTestingModule();
    refuseLocalStorage();
    const refused = TestBed.inject(WidgetVisibilityService);

    const shown = refused.clock();
    refused.toggleClock();
    TestBed.tick();
    expect(refused.clock()).toBe(!shown);
  });
});

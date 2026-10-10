import { TestBed } from '@angular/core/testing';
import { prefersLightRendering, RenderLiteService } from '@axe/application/ui/render-lite.service';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const FIREFOX = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0';
const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

describe('prefersLightRendering', () => {
  it('draws Firefox the lighter way', () => {
    expect(prefersLightRendering({ userAgent: FIREFOX, hardwareConcurrency: 16, deviceMemory: 8 })).toBe(true);
  });

  it('draws Chromium on an ordinary machine the full way', () => {
    expect(prefersLightRendering({ userAgent: CHROME, hardwareConcurrency: 4, deviceMemory: 4 })).toBe(false);
  });

  it('draws a machine with two cores or two gigabytes the lighter way', () => {
    expect(prefersLightRendering({ userAgent: CHROME, hardwareConcurrency: 2 })).toBe(true);
    expect(prefersLightRendering({ userAgent: CHROME, deviceMemory: 2 })).toBe(true);
  });

  it('reads nothing into the two cores WebKit reports on an iPhone or an iPad', () => {
    expect(prefersLightRendering({ userAgent: IPHONE, hardwareConcurrency: 2 })).toBe(false);
    expect(prefersLightRendering({ userAgent: MAC_SAFARI, hardwareConcurrency: 2, maxTouchPoints: 5 })).toBe(false);
  });

  it('still draws a Mac without a touch screen the lighter way on two cores', () => {
    expect(prefersLightRendering({ userAgent: MAC_SAFARI, hardwareConcurrency: 2, maxTouchPoints: 0 })).toBe(true);
  });

  it('draws the full way when the browser says nothing about the machine', () => {
    expect(prefersLightRendering({ userAgent: CHROME })).toBe(false);
  });
});

describe('RenderLiteService', () => {
  function setup(userAgent: string): RenderLiteService {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    TestBed.configureTestingModule({ providers: [RenderLiteService] });
    return TestBed.inject(RenderLiteService);
  }

  beforeEach(() => {
    localStorage.removeItem('ui-render-lite');
    document.documentElement.classList.remove('render-lite');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    document.documentElement.classList.remove('render-lite');
  });

  it('follows the browser while on auto', () => {
    expect(setup(FIREFOX).active()).toBe(true);
    TestBed.resetTestingModule();
    expect(setup(CHROME).active()).toBe(false);
  });

  it('draws the lighter way once told to, whatever the browser', () => {
    const service = setup(CHROME);
    service.setting.set('on');

    expect(service.active()).toBe(true);
  });

  it('draws the full way once told to, even in Firefox', () => {
    const service = setup(FIREFOX);
    service.setting.set('off');

    expect(service.active()).toBe(false);
  });

  it('cycles through auto, on and off', () => {
    const service = setup(CHROME);

    service.cycle();
    expect(service.setting()).toBe('on');
    service.cycle();
    expect(service.setting()).toBe('off');
    service.cycle();
    expect(service.setting()).toBe('auto');
  });

  it('marks the document while drawing the lighter way', () => {
    const service = setup(CHROME);
    expect(document.documentElement.classList.contains('render-lite')).toBe(false);

    service.setting.set('on');
    TestBed.tick();

    expect(document.documentElement.classList.contains('render-lite')).toBe(true);
  });

  it('remembers a choice across a reload', () => {
    setup(CHROME).set('on');
    TestBed.resetTestingModule();

    expect(setup(CHROME).setting()).toBe('on');
  });

  it('writes nothing down until a choice is made', () => {
    setup(FIREFOX);

    expect(localStorage.getItem('ui-render-lite')).toBeNull();
  });

  it('takes a stored value it does not know for auto', () => {
    localStorage.setItem('ui-render-lite', 'sometimes');

    expect(setup(CHROME).setting()).toBe('auto');
  });
});

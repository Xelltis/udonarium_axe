import { TestBed } from '@angular/core/testing';
import {
  COMPACT_VIEWPORT_QUERY,
  FINE_POINTER_QUERY,
  TOUCH_POINTER_QUERY,
  ViewportService,
} from '@axe/application/ui/viewport.service';

interface FakeMediaQueryList {
  matches: boolean;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

describe('ViewportService', () => {
  let mql: FakeMediaQueryList;
  let listeners: Map<string, (event: MediaQueryListEvent) => void>;
  let listener: ((event: MediaQueryListEvent) => void) | null;

  function setup(matches: boolean): ViewportService {
    listeners = new Map();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const fake: FakeMediaQueryList = {
        matches,
        addEventListener: vi.fn((_: string, fn: (event: MediaQueryListEvent) => void) => listeners.set(query, fn)),
        removeEventListener: vi.fn(),
      };
      mql = fake;
      return fake as unknown as MediaQueryList;
    });

    TestBed.configureTestingModule({ providers: [ViewportService] });
    const service = TestBed.inject(ViewportService);
    listener = listeners.get(COMPACT_VIEWPORT_QUERY) ?? null;
    return service;
  }

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('treats a narrow screen as compact', () => {
    const service = setup(true);
    expect(service.isCompact()).toBe(true);
  });

  it('does not treat a wide screen as compact', () => {
    const service = setup(false);
    expect(service.isCompact()).toBe(false);
  });

  it('asks the browser about the width threshold', () => {
    setup(false);
    expect(window.matchMedia).toHaveBeenCalledWith(COMPACT_VIEWPORT_QUERY);
  });

  it('follows the width as it changes', () => {
    const service = setup(false);

    listener?.({ matches: true } as MediaQueryListEvent);
    expect(service.isCompact()).toBe(true);

    listener?.({ matches: false } as MediaQueryListEvent);
    expect(service.isCompact()).toBe(false);
  });

  it('asks the browser about a coarse pointer', () => {
    setup(false);
    expect(window.matchMedia).toHaveBeenCalledWith(TOUCH_POINTER_QUERY);
  });

  it('asks the browser whether any pointer is fine, and follows it', () => {
    const service = setup(true);
    expect(window.matchMedia).toHaveBeenCalledWith(FINE_POINTER_QUERY);
    expect(service.hasFinePointer()).toBe(true);

    listeners.get(FINE_POINTER_QUERY)?.({ matches: false } as MediaQueryListEvent);

    expect(service.hasFinePointer()).toBe(false);
  });

  it('counts a phone held sideways as compact too', () => {
    setup(false);
    expect(COMPACT_VIEWPORT_QUERY).toContain('(max-height: 500px) and (pointer: coarse)');
  });

  it('unsubscribes on teardown', () => {
    setup(false);
    TestBed.resetTestingModule();

    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});

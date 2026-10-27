import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GpuNoticeComponent } from '@axe/features/gpu-notice/gpu-notice.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const EDGE = `${CHROME} Edg/156.0.0.0`;

/** Makes the browser's WebGL answer as one with the GPU, or as one drawing in software. */
function webGl(withGpu: boolean): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((
    _kind: string,
    options?: WebGLContextAttributes
  ) => {
    if (options?.failIfMajorPerformanceCaveat && !withGpu) return null;
    return { RENDERER: 0x1f01, getParameter: () => 'WebKit WebGL', getExtension: () => null };
  }) as unknown as HTMLCanvasElement['getContext']);
}

describe('GpuNoticeComponent', () => {
  let automated: boolean;
  let userAgent: string;

  beforeEach(() => {
    automated = false;
    userAgent = CHROME;
    const navigatorProto = Object.getPrototypeOf(navigator) as object;
    vi.spyOn(navigatorProto as { webdriver: boolean }, 'webdriver', 'get').mockImplementation(() => automated);
    vi.spyOn(navigatorProto as { userAgent: string }, 'userAgent', 'get').mockImplementation(() => userAgent);
    TestBed.configureTestingModule({ imports: [GpuNoticeComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function open(): Promise<ComponentFixture<GpuNoticeComponent>> {
    const fixture = TestBed.createComponent(GpuNoticeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function notice(fixture: ComponentFixture<GpuNoticeComponent>): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('[data-testid="gpu-notice"]');
  }

  it('tells a reader whose browser draws without the GPU, with where the browser keeps the setting', async () => {
    webGl(false);
    userAgent = EDGE;

    const fixture = await open();

    expect(notice(fixture)).not.toBeNull();
    expect(notice(fixture)!.getAttribute('role')).toBe('alertdialog');
    expect(notice(fixture)!.querySelector('[data-testid="gpu-notice-steps"]')!.textContent).toContain(
      'システムとパフォーマンス'
    );
  });

  it('says nothing where the browser draws with the GPU', async () => {
    webGl(true);

    expect(notice(await open())).toBeNull();
  });

  it('says nothing to a browser driven by automation', async () => {
    webGl(false);
    automated = true;

    expect(notice(await open())).toBeNull();
  });

  it('goes away when closed, and comes back the next time the page opens', async () => {
    webGl(false);
    const first = await open();

    (first.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="gpu-notice-close"]')!.click();
    first.detectChanges();
    expect(notice(first)).toBeNull();
    first.destroy();

    expect(notice(await open())).not.toBeNull();
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { Network } from '@axe/core/network/network';
import { ReplayDetailLevel } from '@axe/domain/replay/replay-event';
import { ReplayIndicatorComponent } from '@axe/features/replay/replay-indicator/replay-indicator.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReplayIndicatorComponent', () => {
  let fixture: ComponentFixture<ReplayIndicatorComponent>;
  let isRecording: ReturnType<typeof signal<boolean>>;
  let mark: ReturnType<typeof vi.fn>;
  let stop: ReturnType<typeof vi.fn>;
  let start: ReturnType<typeof vi.fn>;
  let setDetailLevel: ReturnType<typeof vi.fn>;
  let isSupported = true;
  let isBoardMode: ReturnType<typeof signal<boolean>>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReplayIndicatorComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: ReplayPlaybackService, useValue: { isBoardMode: isBoardMode.asReadonly() } },
        {
          provide: ReplayRecorderService,
          useValue: {
            isRecording: isRecording.asReadonly(),
            eventCount: signal(42).asReadonly(),
            startedAt: signal(Date.now() - 65_000).asReadonly(),
            detailLevel: signal(ReplayDetailLevel.Notable).asReadonly(),
            isFailing: signal(false).asReadonly(),
            get isSupported() {
              return isSupported;
            },
            mark,
            stop,
            start,
            setDetailLevel,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReplayIndicatorComponent);
    fixture.detectChanges();
  }

  function pill(): HTMLButtonElement | null {
    return fixture.nativeElement.querySelector('button');
  }

  function buttonByText(text: string): HTMLButtonElement | undefined {
    return [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      (button as HTMLButtonElement).textContent?.includes(text)
    ) as HTMLButtonElement | undefined;
  }

  beforeEach(() => {
    localStorage.removeItem('ui-widgets');
    localStorage.removeItem('axe-replay-preference');
    isRecording = signal(true);
    isBoardMode = signal(false);
    isSupported = true;
    mark = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn().mockResolvedValue(undefined);
    start = vi.fn().mockResolvedValue(true);
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '第一夜' } as never);
    setDetailLevel = vi.fn();
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    localStorage.removeItem('ui-widgets');
    localStorage.removeItem('axe-replay-preference');
    vi.restoreAllMocks();
  });

  it('stays out of sight while it is hidden', async () => {
    await setup();
    TestBed.inject(WidgetVisibilityService).recording.set(false);
    fixture.detectChanges();
    expect(pill()).toBeNull();
  });

  it('offers nothing until it is pressed', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('input')).toBeNull();

    pill()?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input')).not.toBeNull();
  });

  it('marks the recording with a heading', async () => {
    await setup();
    pill()?.click();
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = '第二幕';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    buttonByText('目印')?.click();
    expect(mark).toHaveBeenCalledWith('第二幕');
  });

  it('shows the detail level and how many to keep that are in use, not the first of each', async () => {
    localStorage.setItem('axe-replay-preference', JSON.stringify({ detailLevel: 'notable', keepCount: 5 }));
    await setup();
    pill()?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const [level, keep] = [...fixture.nativeElement.querySelectorAll('select')] as HTMLSelectElement[];
    expect(level.value).toBe(ReplayDetailLevel.Notable);
    expect(keep.value).toBe('5');
  });

  it('marks nothing without one', async () => {
    await setup();
    pill()?.click();
    fixture.detectChanges();

    expect(buttonByText('目印')?.disabled).toBe(true);
  });

  it('stops the recording', async () => {
    await setup();
    pill()?.click();
    fixture.detectChanges();

    buttonByText('記録を止める')?.click();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('hides itself', async () => {
    await setup();
    pill()?.click();
    fixture.detectChanges();

    buttonByText('表示を消す')?.click();
    fixture.detectChanges();

    expect(TestBed.inject(WidgetVisibilityService).recording()).toBe(false);
    expect(pill()).toBeNull();
  });
});

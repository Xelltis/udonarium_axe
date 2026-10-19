import { computed, signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
} from '@axe/domain/replay/replay-event';
import { REPLAY_CAUGHT_UP_FLAG } from '@axe/domain/replay/replay-event-category';
import { ReplayStageComponent } from '@axe/features/replay/replay-workspace/replay-stage.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function event(
  seq: number,
  t: number,
  kind: ReplayEventKind = ReplayEventKind.ChatMessage,
  detail: Record<string, unknown> = {}
) {
  return { seq, at: t, t, kind, actorId: 'alice', detail, visibility: PUBLIC_VISIBILITY } as ReplayEvent;
}

const events: readonly ReplayEvent[] = [
  event(1, 0, ReplayEventKind.ChatMessage, { name: '盗賊', text: 'こんばんは' }),
  event(2, 100),
  event(3, 200),
  event(4, 5000, ReplayEventKind.Marker, { label: '第二幕' }),
  event(5, 10_000),
];

function scrub(track: HTMLElement, name: string, clientX: number): Promise<void> {
  const fired = new Event(name, { bubbles: true, cancelable: true });
  Object.defineProperty(fired, 'clientX', { value: clientX });
  Object.defineProperty(fired, 'pointerId', { value: 1 });
  track.dispatchEvent(fired);
  return Promise.resolve();
}

describe('ReplayStageComponent', () => {
  let fixture: ComponentFixture<ReplayStageComponent>;
  let cursor: WritableSignal<number>;
  let eventList: WritableSignal<readonly ReplayEvent[]>;
  let seekTo: ReturnType<typeof vi.fn>;
  let isEnteringBoardMode: WritableSignal<boolean>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReplayStageComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: eventList.asReadonly(),
            cursor: cursor.asReadonly(),
            manifest: signal(null).asReadonly(),
            currentEvent: computed(() => eventList()[cursor()] ?? null),
            isBoardMode: signal(false).asReadonly(),
            isEnteringBoardMode: isEnteringBoardMode.asReadonly(),
            isSeeking: signal(false).asReadonly(),
            autoPlay: signal(false).asReadonly(),
            isAtStart: signal(true).asReadonly(),
            isAtEnd: signal(false).asReadonly(),
            seekTo,
            toStart: vi.fn(),
            previous: vi.fn(),
            next: vi.fn(),
            toEnd: vi.fn(),
            toggleAutoPlay: vi.fn(),
            enterBoardMode: vi.fn(),
            exitBoardMode: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayStageComponent);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    cursor = signal(0);
    eventList = signal(events);
    seekTo = vi.fn().mockResolvedValue(undefined);
    isEnteringBoardMode = signal(false);
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });
    await setup();
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  it('shows the line this reader was last shown, passing over one kept from them or kept to the board', () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'bob', role: PeerRole.Player });
    eventList.set([
      event(1, 0, ReplayEventKind.ChatMessage, { name: '盗賊', text: 'こんばんは' }),
      { ...event(2, 100, ReplayEventKind.ChatMessage, { name: 'GM', text: 'ひみつ' }), visibility: GM_ONLY_VISIBILITY },
      event(3, 200, ReplayEventKind.ChatMessage, { name: '昔', text: 'むかしの話', [REPLAY_CAUGHT_UP_FLAG]: true }),
    ]);
    cursor.set(2);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('こんばんは');
    expect(text).not.toContain('ひみつ');
    expect(text).not.toContain('むかしの話');
  });

  it('leaves stepping and putting the board away unpressable while a scene is acted out', () => {
    const buttons = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
    const board = () => buttons().find((each) => each.textContent?.includes('盤面を映す'));
    const next = () =>
      buttons().find((each) => each.querySelector('.material-icons')?.textContent?.trim() === 'navigate_next');
    expect(board()?.disabled).toBe(false);
    expect(next()?.disabled).toBe(false);

    setNetworkIsolated(true);
    try {
      TestBed.inject(ReplayStagingService).begin(0, 'alice');
      fixture.detectChanges();

      expect(board()?.disabled).toBe(true);
      expect(next()?.disabled).toBe(true);
    } finally {
      TestBed.inject(ReplayStagingService).discard();
      setNetworkIsolated(false);
    }
  });

  it('leaves the button that shows the board unpressable while the board is on its way up', () => {
    const button = () =>
      [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((each) =>
        each.textContent?.includes('盤面を映す')
      );
    expect(button()?.disabled).toBe(false);

    isEnteringBoardMode.set(true);
    fixture.detectChanges();

    expect(button()?.disabled).toBe(true);
  });

  it('draws the busy stretches as peaks', () => {
    const bars: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="slider"] > div > span'));
    expect(bars.length).toBeGreaterThan(1);
    expect(bars.some((bar) => bar.style.height === '100%')).toBe(true);
    expect(bars.some((bar) => bar.style.height === '0%')).toBe(true);
  });

  it('lays the markers out as chapters', () => {
    const chapters: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('[role="slider"] button'));
    expect(chapters).toHaveLength(1);
    expect(chapters[0].title).toBe('第二幕');
    expect(chapters[0].style.left).toBe('50%');
  });

  it('jumps to a chapter on a press', () => {
    const chapter: HTMLElement = fixture.nativeElement.querySelector('[role="slider"] button');
    chapter.click();
    expect(seekTo).toHaveBeenCalledWith(3);
  });

  it('shows where it has got to', () => {
    const track: HTMLElement = fixture.nativeElement.querySelector('[role="slider"]');
    expect(track.getAttribute('aria-valuenow')).toBe('1');
    expect(track.getAttribute('aria-valuemax')).toBe('5');

    cursor.set(4);
    fixture.detectChanges();
    expect(track.getAttribute('aria-valuenow')).toBe('5');
  });

  it('heads the view with the chapter it has passed', () => {
    expect(fixture.nativeElement.textContent).not.toContain('第二幕');

    cursor.set(3);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('第二幕');
  });

  it('does not rebuild the board over and over while the handle is dragged', async () => {
    const track: HTMLElement = fixture.nativeElement.querySelector('[role="slider"]');
    Object.defineProperty(track, 'getBoundingClientRect', { value: () => ({ left: 0, width: 100 }) });
    track.setPointerCapture = vi.fn();
    track.hasPointerCapture = vi.fn().mockReturnValue(true);

    let release: (() => void) | null = null;
    seekTo.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        })
    );

    const drag = [
      scrub(track, 'pointerdown', 0),
      scrub(track, 'pointermove', 20),
      scrub(track, 'pointermove', 60),
      scrub(track, 'pointermove', 100),
    ];
    expect(seekTo).toHaveBeenCalledTimes(1);

    release!();
    await Promise.all(drag);

    expect(seekTo).toHaveBeenCalledTimes(2);
    expect(seekTo).toHaveBeenLastCalledWith(4);
  });

  it('steps on the arrow keys as the buttons do, over what this reader is not shown', () => {
    const playback = TestBed.inject(ReplayPlaybackService);
    const track: HTMLElement = fixture.nativeElement.querySelector('[role="slider"]');
    track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    track.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(playback.next).toHaveBeenCalledOnce();
    expect(playback.previous).toHaveBeenCalledOnce();
  });
});

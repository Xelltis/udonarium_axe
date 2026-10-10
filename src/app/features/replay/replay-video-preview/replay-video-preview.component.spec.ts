import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import type { ReplayVideoProduction } from '@axe/application/replay/replay-video-production';
import { ReplayVideoStudioService } from '@axe/application/replay/replay-video-studio.service';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayFocusService } from '@axe/features/replay/replay-focus.service';
import { ReplayVideoPreviewComponent } from '@axe/features/replay/replay-video-preview/replay-video-preview.component';
import { ReplayVideoSettingsService } from '@axe/features/replay/replay-video-settings.service';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';
import { recorder } from '@axe/testing/canvas-recorder';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function say(seq: number, text: string): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text, name: 'アリス' },
    visibility: PUBLIC_VISIBILITY,
  };
}

interface FakeProduction {
  durationMs: number;
  timeline: { segments: unknown[] };
  paint: ReturnType<typeof vi.fn>;
  isReady: () => boolean;
  prepare: ReturnType<typeof vi.fn>;
  timeOf: (seq: number) => number;
  dispose: ReturnType<typeof vi.fn>;
}

function fakeProduction(): FakeProduction {
  return {
    durationMs: 10_000,
    timeline: { segments: [{}] },
    paint: vi.fn(),
    isReady: () => true,
    prepare: vi.fn(),
    timeOf: (seq: number) => seq * 1000,
    dispose: vi.fn(),
  };
}

describe('ReplayVideoPreviewComponent', () => {
  const borrowed = new BorrowedGlobals();
  let fixture: ComponentFixture<ReplayVideoPreviewComponent>;
  let produce: ReturnType<typeof vi.fn>;
  let made: FakeProduction[];
  let events: WritableSignal<readonly ReplayEvent[]>;
  let cursor: WritableSignal<number>;
  let currentEvent: WritableSignal<ReplayEvent | null>;

  beforeEach(async () => {
    vi.useFakeTimers();
    const canvas = recorder();
    borrowed.lendOn(HTMLCanvasElement.prototype, 'getContext', () => canvas.ctx);
    made = [];
    events = signal<readonly ReplayEvent[]>([say(1, 'やあ'), say(2, 'どうも')]);
    cursor = signal(0);
    currentEvent = signal<ReplayEvent | null>(null);
    produce = vi.fn(async () => {
      const production = fakeProduction();
      made.push(production);
      return production as unknown as ReplayVideoProduction;
    });

    await TestBed.configureTestingModule({
      imports: [ReplayVideoPreviewComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: ReplayVideoStudioService, useValue: { produce } },
        {
          provide: ReplayPlaybackService,
          useValue: {
            recordingId: signal<number | null>(3).asReadonly(),
            events: events.asReadonly(),
            manifest: signal({ roomName: '第一夜', startedAt: 0 }).asReadonly(),
            cursor: cursor.asReadonly(),
            currentEvent: currentEvent.asReadonly(),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: { isEditing: signal(false).asReadonly(), edited: signal([]).asReadonly() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayVideoPreviewComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    borrowed.giveBack();
  });

  async function settle(ms = 400): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    fixture.detectChanges();
  }

  it('lays the video out once editing settles, and draws it', async () => {
    await settle();

    expect(produce).toHaveBeenCalledTimes(1);
    expect(produce.mock.calls[0][0]).toMatchObject({ id: 3, roomName: '第一夜' });
    expect(made[0].paint).toHaveBeenCalled();
  });

  it('lays it out again when the recording changes, letting the old one go', async () => {
    await settle();
    events.set([say(1, '書き直した')]);
    fixture.detectChanges();
    await settle();

    expect(produce).toHaveBeenCalledTimes(2);
    expect(made[0].dispose).toHaveBeenCalled();
  });

  it('lays it out again when the look is changed', async () => {
    await settle();
    TestBed.inject(ReplayVideoSettingsService).style.set('tabletop');
    fixture.detectChanges();
    await settle();

    expect(produce.mock.calls[1][1]).toMatchObject({ style: 'tabletop' });
  });

  it('goes to the row chosen in the list', async () => {
    await settle();
    TestBed.inject(ReplayFocusService).choose(2);
    fixture.detectChanges();
    await settle(50);

    expect(made[0].paint.mock.calls.at(-1)?.[1]).toBe(2000);
  });

  it('follows the playback cursor again once it moves on from where a row was chosen', async () => {
    await settle();
    TestBed.inject(ReplayFocusService).choose(2);
    fixture.detectChanges();
    await settle(50);

    cursor.set(1);
    currentEvent.set(say(1, 'やあ'));
    fixture.detectChanges();
    await settle(50);

    expect(made[0].paint.mock.calls.at(-1)?.[1]).toBe(1000);
  });

  it('plays on from where it is', async () => {
    await settle();
    fixture.nativeElement.querySelector('button').click();
    await settle(500);

    const times = made[0].paint.mock.calls.map((call) => call[1] as number);
    expect(times[times.length - 1]).toBeGreaterThan(0);
  });

  it('lets the video go when it closes', async () => {
    await settle();
    fixture.destroy();

    expect(made[0].dispose).toHaveBeenCalled();
  });

  it('lets go of a video still being laid out when it closes, once that is done', async () => {
    let finish: (() => void) | null = null;
    produce.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          const production = fakeProduction();
          made.push(production);
          finish = () => resolve(production as unknown as ReplayVideoProduction);
        })
    );
    await settle();
    expect(finish).not.toBeNull();

    fixture.destroy();
    finish!();
    await vi.advanceTimersByTimeAsync(0);

    expect(made[0].dispose).toHaveBeenCalled();
    expect(made[0].paint).not.toHaveBeenCalled();
  });
});

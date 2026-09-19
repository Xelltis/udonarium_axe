import { signal, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { type ReplayVideoFailure, ReplayVideoService } from '@axe/application/replay/replay-video.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayVideoPanelComponent } from '@axe/features/replay/replay-video-panel/replay-video-panel.component';
import { ReplayVideoSettingsService } from '@axe/features/replay/replay-video-settings.service';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function say(seq: number, text: string): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text, name: 'アリス', from: 'alice', tabIdentifier: 'main' },
    visibility: PUBLIC_VISIBILITY,
  };
}

describe('ReplayVideoPanelComponent', () => {
  let fixture: ComponentFixture<ReplayVideoPanelComponent>;
  let render: ReturnType<typeof vi.fn>;
  let cancel: ReturnType<typeof vi.fn>;
  let isRendering: WritableSignal<boolean>;
  let progress: WritableSignal<number>;
  let failure: WritableSignal<ReplayVideoFailure | null>;
  let wasPaused: WritableSignal<boolean>;
  let isSupported = true;
  let events: readonly ReplayEvent[];
  let isEditing: WritableSignal<boolean>;
  let edited: WritableSignal<readonly ReplayEvent[]>;
  const borrowed = new BorrowedGlobals();

  function buttonByText(text: string): HTMLButtonElement | undefined {
    return [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      (button as HTMLButtonElement).textContent?.includes(text)
    ) as HTMLButtonElement | undefined;
  }

  function choose(label: string, value: string): void {
    const select = [...fixture.nativeElement.querySelectorAll('label')]
      .find((element) => (element as HTMLElement).textContent?.includes(label))
      ?.querySelector('select') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReplayVideoPanelComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayVideoService,
          useValue: {
            isRendering: isRendering.asReadonly(),
            progress: progress.asReadonly(),
            failure: failure.asReadonly(),
            wasPaused: wasPaused.asReadonly(),
            get isSupported() {
              return isSupported;
            },
            isRealtimeOnly: false,
            render,
            cancel,
          },
        },
        {
          provide: ReplayPlaybackService,
          useValue: {
            recordingId: signal<number | null>(7).asReadonly(),
            events: signal(events).asReadonly(),
            manifest: signal({ roomName: '第一夜', startedAt: 0, endedAt: null, actors: [], targets: [] }).asReadonly(),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: { isEditing: isEditing.asReadonly(), edited: edited.asReadonly() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayVideoPanelComponent);
    fixture.detectChanges();
  }

  async function open(): Promise<void> {
    buttonByText('動画にする')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    render = vi.fn().mockResolvedValue(true);
    cancel = vi.fn();
    isRendering = signal(false);
    progress = signal(0);
    failure = signal<ReplayVideoFailure | null>(null);
    wasPaused = signal(false);
    isSupported = true;
    events = [say(1, 'やあ'), say(2, 'こんばんは')];
    isEditing = signal(false);
    edited = signal<readonly ReplayEvent[]>([]);
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
    borrowed.giveBack();
  });

  it('says how many moments and how long before it writes, the opening card among them', async () => {
    await setup();
    await open();

    expect(fixture.nativeElement.textContent).toContain('3 場面');
  });

  it('makes a video for the public unless told otherwise', async () => {
    await setup();
    await open();
    buttonByText('書き出す')?.click();
    await fixture.whenStable();

    expect(render.mock.calls[0][0].settings).toMatchObject({ audience: 'public' });
    expect(fixture.nativeElement.textContent).not.toContain('公開していない情報');
  });

  it('warns when made through eyes that saw secrets', async () => {
    await setup();
    await open();
    choose('見せる相手', 'gm');

    expect(fixture.nativeElement.textContent).toContain('公開していない情報');
  });

  it('asks for the size, the rate, the look and the language that were chosen', async () => {
    await setup();
    await open();
    choose('大きさ', '1440p');
    choose('なめらかさ', '30');
    choose('見せ方', 'tabletop');
    choose('言語', 'en');

    buttonByText('書き出す')?.click();
    await fixture.whenStable();

    const [job, file] = render.mock.calls[0];
    expect(job).toMatchObject({
      fps: 30,
      settings: { width: 2560, height: 1440, style: 'tabletop', lang: 'en' },
      recording: { id: 7, roomName: '第一夜', userId: 'gm' },
    });
    expect(file).toBeNull();
  });

  it('shares its choices with the preview', async () => {
    await setup();
    await open();
    choose('見せ方', 'tabletop');

    expect(TestBed.inject(ReplayVideoSettingsService).style()).toBe('tabletop');
  });

  it('hands over the edited order while it is being edited', async () => {
    isEditing = signal(true);
    edited = signal<readonly ReplayEvent[]>([say(1, '書き直した')]);
    await setup();
    await open();
    buttonByText('書き出す')?.click();
    await fixture.whenStable();

    expect(render.mock.calls[0][0].recording.events).toEqual(edited());
  });

  it('will not export without a moment it can picture', async () => {
    events = [{ ...say(1, ''), kind: ReplayEventKind.PeerJoin, detail: {} }];
    await setup();
    await open();

    expect(buttonByText('書き出す')?.disabled).toBe(true);
  });

  it('says why the last export failed', async () => {
    failure = signal<ReplayVideoFailure | null>('sound');
    await setup();
    await open();

    expect(fixture.nativeElement.textContent).toContain('音を混ぜられませんでした');
  });

  it('leaves the button unpressable where it cannot export at all', async () => {
    isSupported = false;
    await setup();

    expect(buttonByText('動画にする')?.disabled).toBe(true);
  });

  it('asks for the tab to stay in view while it writes', async () => {
    isRendering = signal(true);
    await setup();

    expect(fixture.nativeElement.textContent).toContain('表示したままに');
  });

  it('says so when the browser paused it in the background', async () => {
    isRendering = signal(true);
    await setup();
    wasPaused.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('ブラウザーが書き出しを止めていました');
  });

  it('shows how far it has got and how to stop while it writes', async () => {
    isRendering = signal(true);
    progress = signal(0.42);
    await setup();

    expect(fixture.nativeElement.textContent).toContain('42');
    buttonByText('やめる')?.click();
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('writes to the file chosen in the save dialogue', async () => {
    const handle = { name: 'replay.mp4' };
    borrowed.lend('showSaveFilePicker', vi.fn().mockResolvedValue(handle));
    await setup();
    await open();
    buttonByText('書き出す')?.click();
    await fixture.whenStable();

    expect(render.mock.calls[0][1]).toBe(handle);
  });

  it('calls the export off when the save dialogue is closed without choosing', async () => {
    borrowed.lend('showSaveFilePicker', vi.fn().mockRejectedValue(new DOMException('closed', 'AbortError')));
    await setup();
    await open();
    buttonByText('書き出す')?.click();
    await fixture.whenStable();

    expect(render).not.toHaveBeenCalled();
    expect(buttonByText('書き出す')).toBeDefined();
  });

  it('says how large the file will be', async () => {
    await setup();
    await open();

    expect(fixture.nativeElement.textContent).toMatch(/\d+ MB/);
  });

  describe('a video too large to hold in memory', () => {
    beforeEach(() => {
      events = Array.from({ length: 80 }, (_, index) =>
        say(index + 1, 'しばらく沈黙が続いた。誰も口を開こうとしない。')
      );
    });

    it('is warned against where the browser cannot save as it writes', async () => {
      await setup();
      await open();
      choose('大きさ', '2160p');

      expect(fixture.nativeElement.textContent).toContain('メモリーに溜めて');
    });

    it('is not, where the video streams to the file chosen', async () => {
      borrowed.lend('showSaveFilePicker', vi.fn());
      await setup();
      await open();
      choose('大きさ', '2160p');

      expect(fixture.nativeElement.textContent).not.toContain('メモリーに溜めて');
    });

    it('is not, once made small enough', async () => {
      await setup();
      await open();
      choose('大きさ', '720p');

      expect(fixture.nativeElement.textContent).not.toContain('メモリーに溜めて');
    });
  });
});

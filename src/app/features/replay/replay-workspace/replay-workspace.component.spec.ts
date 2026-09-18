import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import type { ReplayRecordingMeta } from '@axe/core/storage/replay-log-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import {
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';
import { ReplayWorkspaceComponent } from '@axe/features/replay/replay-workspace/replay-workspace.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const events: ReplayEvent[] = [
  {
    seq: 1,
    at: 1000,
    t: 0,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { name: '盗賊', text: 'こんばんは' },
    visibility: PUBLIC_VISIBILITY,
  },
  {
    seq: 2,
    at: 6000,
    t: 5000,
    kind: ReplayEventKind.ObjectMove,
    actorId: 'bob',
    targetId: 'c1',
    detail: { from: { name: 'table', x: 0, y: 0, z: 0 }, to: { name: 'table', x: 100, y: 50, z: 0 } },
    visibility: PUBLIC_VISIBILITY,
  },
];

const manifest: ReplayManifest = {
  formatVersion: REPLAY_FORMAT_VERSION,
  roomName: '第一夜',
  startedAt: 0,
  endedAt: null,
  recordedBy: { userId: 'gm', peerId: 'p', name: 'GM', role: PeerRole.GameMaster, imageIdentifier: '', sinceSeq: 0 },
  detailLevel: ReplayDetailLevel.Notable,
  actors: [
    { userId: 'alice', peerId: 'p1', name: 'アリス', role: PeerRole.Player, imageIdentifier: '', sinceSeq: 0 },
    { userId: 'bob', peerId: 'p2', name: 'ボブ', role: PeerRole.Player, imageIdentifier: '', sinceSeq: 0 },
  ],
  targets: [{ identifier: 'c1', aliasName: 'character', name: '盗賊', sinceSeq: 0 }],
  keyframes: [],
  chunks: [],
};

const cast: ReplayCastMember[] = [
  { identifier: 'c1', name: '盗賊', imageIdentifier: 'img-1', chatColor: '#112233', onTable: true },
  { identifier: 'c2', name: '魔術師', imageIdentifier: 'img-2', chatColor: '#445566', onTable: true },
];

describe('ReplayWorkspaceComponent', () => {
  let fixture: ComponentFixture<ReplayWorkspaceComponent>;
  let isOpen: ReturnType<typeof signal<boolean>>;
  let recordings: ReplayRecordingMeta[];
  let open: ReturnType<typeof vi.fn>;
  let begin: ReturnType<typeof vi.fn>;
  let insert: ReturnType<typeof vi.fn>;
  let isEditing: ReturnType<typeof signal<boolean>>;
  let canUndo: ReturnType<typeof signal<boolean>>;
  let undo: ReturnType<typeof vi.fn>;
  let edited: ReturnType<typeof signal<readonly ReplayEvent[]>>;
  let stopAutoPlay: ReturnType<typeof vi.fn>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ReplayWorkspaceComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            isOpen: isOpen.asReadonly(),
            recordingId: signal<number | null>(7).asReadonly(),
            manifest: signal<ReplayManifest | null>(manifest).asReadonly(),
            events: signal<readonly ReplayEvent[]>(events).asReadonly(),
            cursor: signal(0).asReadonly(),
            isBoardMode: signal(false).asReadonly(),
            isSeeking: signal(false).asReadonly(),
            autoPlay: signal(false).asReadonly(),
            isAtStart: signal(true).asReadonly(),
            isAtEnd: signal(false).asReadonly(),
            currentEvent: signal<ReplayEvent | null>(events[0]).asReadonly(),
            cast: signal<readonly ReplayCastMember[]>(cast).asReadonly(),
            open,
            close: vi.fn().mockResolvedValue(undefined),
            seekTo: vi.fn().mockResolvedValue(undefined),
            toStart: vi.fn(),
            previous: vi.fn(),
            next: vi.fn(),
            toEnd: vi.fn(),
            toggleAutoPlay: vi.fn(),
            stopAutoPlay,
            enterBoardMode: vi.fn().mockResolvedValue(true),
            exitBoardMode: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplayRecorderService,
          useValue: {
            recordings: signal<readonly ReplayRecordingMeta[]>(recordings).asReadonly(),
            isRecording: signal(true).asReadonly(),
            refresh: vi.fn().mockResolvedValue([]),
            remove: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: {
            isEditing: isEditing.asReadonly(),
            isDirty: signal(false).asReadonly(),
            isSaving: signal(false).asReadonly(),
            canUndo: canUndo.asReadonly(),
            undo,
            edited: edited.asReadonly(),
            begin,
            cancel: vi.fn(),
            revert: vi.fn(),
            insert,
            isInserted: () => false,
            move: vi.fn(),
            remove: vi.fn(),
            retext: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReplayWorkspaceComponent);
    fixture.detectChanges();
  }

  function buttonByText(text: string): HTMLButtonElement | undefined {
    return [...fixture.nativeElement.querySelectorAll('button')].find((button) =>
      (button as HTMLButtonElement).textContent?.includes(text)
    ) as HTMLButtonElement | undefined;
  }

  function entryRows(): HTMLElement[] {
    const list = fixture.nativeElement.querySelector('replay-entry-list ui-virtual-list') as HTMLElement | null;
    if (!list) return [];
    return [...list.querySelectorAll('[role="listitem"] > div')].filter((row) =>
      (row as HTMLElement).className.includes('relative')
    ) as HTMLElement[];
  }

  describe('the summary', () => {
    function summaryButton(): HTMLButtonElement | undefined {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
        button.textContent?.includes('まとめ')
      );
    }

    it('stops the playback as it opens', async () => {
      await setup();
      summaryButton()?.click();
      fixture.detectChanges();

      expect(stopAutoPlay).toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('replay-digest-panel')).not.toBeNull();
    });

    it('returns to the playback view once the recording is closed', async () => {
      await setup();
      summaryButton()?.click();
      fixture.detectChanges();

      isOpen.set(false);
      fixture.detectChanges();
      isOpen.set(true);
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('replay-digest-panel')).toBeNull();
    });
  });

  beforeEach(() => {
    isOpen = signal(true);
    isEditing = signal(false);
    canUndo = signal(true);
    undo = vi.fn();
    edited = signal<readonly ReplayEvent[]>(events);
    recordings = [{ id: 7, roomName: '第一夜', startedAt: 0, endedAt: null, eventCount: 2, byteSize: 100 }];
    open = vi.fn().mockResolvedValue(true);
    begin = vi.fn();
    insert = vi.fn();
    stopAutoPlay = vi.fn();
    PeerCursor.myCursor = { userId: 'alice', role: PeerRole.GameMaster } as PeerCursor;
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  function openChooser(): void {
    (fixture.nativeElement.querySelector('button[aria-expanded]') as HTMLButtonElement).click();
    fixture.detectChanges();
  }

  it('puts the stage and the list side by side, with the recordings folded behind a chooser', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('replay-stage')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('replay-entry-list')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('replay-recording-list')).toBeNull();

    openChooser();

    expect(fixture.nativeElement.querySelector('replay-recording-list')).not.toBeNull();
  });

  it('names the recording open on the chooser', async () => {
    await setup();
    expect((fixture.nativeElement.querySelector('button[aria-expanded]') as HTMLElement).textContent).toContain(
      '第一夜'
    );
  });

  it('opens a recording when one is chosen', async () => {
    await setup();
    openChooser();
    const item = fixture.nativeElement.querySelector('replay-recording-list li') as HTMLElement;
    item.click();
    expect(open).toHaveBeenCalledWith(7);
  });

  it('lists the recordings in full while none is open', async () => {
    isOpen = signal(false);
    await setup();
    expect(fixture.nativeElement.querySelector('replay-recording-list')).not.toBeNull();
  });

  it('always says that it is recording', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('記録中');
  });

  it('shows neither the stage nor the list without one open', async () => {
    isOpen = signal(false);
    await setup();
    expect(fixture.nativeElement.querySelector('replay-stage')).toBeNull();
    expect(fixture.nativeElement.querySelector('replay-entry-list')).toBeNull();
    expect(fixture.nativeElement.querySelector('replay-recording-list')).not.toBeNull();
  });

  it('builds each line with the name as it was then', async () => {
    await setup();
    const rows = entryRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].textContent).toContain('ボブ');
    expect(rows[1].textContent).toContain('盗賊');
  });

  it('offers no inserting until the editing starts', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('input[placeholder="差し込む内容"]')).toBeNull();

    buttonByText('編集')?.click();
    expect(begin).toHaveBeenCalledTimes(1);
  });

  it('takes one step back on the undo key', async () => {
    isEditing = signal(true);
    await setup();

    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('leaves that key alone while nothing is being edited', async () => {
    await setup();

    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(undo).not.toHaveBeenCalled();
  });

  it('leaves the button unpressable with nothing to undo', async () => {
    isEditing = signal(true);
    canUndo = signal(false);
    await setup();

    expect(buttonByText('取り消す')?.disabled).toBe(true);
  });

  it('offers a field to write in below the list while editing, and none otherwise', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('input[placeholder="差し込む内容"]')).toBeNull();

    fixture.destroy();
    TestBed.resetTestingModule();
    isEditing = signal(true);
    await setup();
    expect(fixture.nativeElement.querySelector('input[placeholder="差し込む内容"]')).not.toBeNull();
  });

  it('puts what is written after the row chosen, the chosen piece portrait and all', async () => {
    isEditing = signal(true);
    await setup();

    entryRows()[0].click();
    fixture.detectChanges();

    const selects = [...fixture.nativeElement.querySelectorAll('select')] as HTMLSelectElement[];
    const speaker = selects.find((select) => [...select.options].some((option) => option.text === '魔術師'))!;
    speaker.value = 'c2';
    speaker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const text = fixture.nativeElement.querySelector('input[placeholder="差し込む内容"]') as HTMLInputElement;
    text.value = 'そこまでだ';
    text.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    buttonByText('差し込む')?.click();

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0][0]).toBe(1);
    expect(insert.mock.calls[0][1]).toMatchObject({
      speaker: '魔術師',
      text: 'そこまでだ',
      imageIdentifier: 'img-2',
      chatColor: '#445566',
    });
  });

  it('puts what is written at the end with no row chosen', async () => {
    isEditing = signal(true);
    await setup();

    const text = fixture.nativeElement.querySelector('input[placeholder="差し込む内容"]') as HTMLInputElement;
    text.value = '終わりに';
    text.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    buttonByText('差し込む')?.click();

    expect(insert.mock.calls[0][0]).toBe(events.length);
  });
});

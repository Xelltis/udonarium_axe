import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayRecorderService } from '@axe/application/replay/replay-recorder.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import type { ReplayRecordingMeta } from '@axe/core/storage/replay-log-store';
import { formatSnapshotByteSize, formatSnapshotSavedAt } from '@axe/core/util/snapshot-format';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ReplayEditorService } from '@axe/features/replay/replay-editor.service';
import { ReplayRecordingListComponent } from '@axe/features/replay/replay-workspace/replay-recording-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReplayRecordingListComponent', () => {
  let fixture: ComponentFixture<ReplayRecordingListComponent>;
  let host: HTMLElement;

  const FIRST: ReplayRecordingMeta = {
    id: 1,
    roomName: '古城の卓',
    startedAt: new Date(2026, 0, 2, 20, 30).getTime(),
    endedAt: new Date(2026, 0, 2, 23, 0).getTime(),
    eventCount: 42,
    byteSize: 2048,
  };
  const SECOND: ReplayRecordingMeta = {
    id: 2,
    roomName: '',
    startedAt: new Date(2026, 0, 9, 20, 30).getTime(),
    endedAt: null,
    eventCount: 7,
    byteSize: 512,
  };

  const recordings = signal<ReplayRecordingMeta[]>([]);
  const isRecording = signal(false);
  const isBusy = signal(false);
  const openedId = signal<number | null>(null);
  const isSaving = signal(false);
  const isEditing = signal(false);
  const isDirty = signal(false);
  const recorder = {
    recordings,
    isRecording,
    refresh: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
  };
  const library = {
    isBusy,
    export: vi.fn(() => Promise.resolve()),
    import: vi.fn(() => Promise.resolve()),
  };
  const playback = {
    recordingId: openedId,
    open: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  const editor = { isSaving, isEditing, isDirty, cancel: vi.fn() };
  let ask: ReturnType<typeof vi.fn>;

  function beSeat(role: PeerRole): void {
    PeerCursor.myCursor = { role, identifier: 'seat-cursor' } as PeerCursor;
  }

  async function drawn(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function rows(): HTMLLIElement[] {
    return [...host.querySelectorAll<HTMLLIElement>('li')];
  }

  /** The button of a row whose words are the label. */
  function buttonOf(row: HTMLElement, label: string): HTMLButtonElement {
    return [...row.querySelectorAll('button')].find((button) => button.textContent?.trim() === label)!;
  }

  /** Lets the awaits a click started run to their end. */
  async function settled(): Promise<void> {
    for (let turn = 0; turn < 5; turn++) await Promise.resolve();
  }

  beforeEach(async () => {
    recordings.set([FIRST, SECOND]);
    isRecording.set(false);
    isBusy.set(false);
    openedId.set(null);
    isSaving.set(false);
    isEditing.set(false);
    isDirty.set(false);
    vi.clearAllMocks();
    beSeat(PeerRole.Player);
    ask = vi.fn(() => Promise.resolve(true));
    TestBed.configureTestingModule({
      imports: [ReplayRecordingListComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: ReplayRecorderService, useValue: recorder },
        { provide: ReplayLibraryService, useValue: library },
        { provide: ReplayPlaybackService, useValue: playback },
        { provide: ReplayEditorService, useValue: editor },
        { provide: ConfirmService, useValue: { ask } },
      ],
    });
    fixture = TestBed.createComponent(ReplayRecordingListComponent);
    host = fixture.nativeElement as HTMLElement;
    await drawn();
  });

  describe('listing the recordings', () => {
    it('reads the recordings afresh as it is made', () => {
      expect(recorder.refresh).toHaveBeenCalledTimes(1);
    });

    it('lists each by when it started, with its room, how much it holds and its size', () => {
      const [first, second] = rows();

      expect(first.textContent).toContain(formatSnapshotSavedAt(FIRST.startedAt));
      expect(first.textContent).toContain('古城の卓');
      expect(first.textContent).toContain(formatSnapshotByteSize(FIRST.byteSize));
      expect(second.textContent).toContain('ひとりの卓');
    });

    it('says so where nothing has been recorded', async () => {
      recordings.set([]);
      await drawn();

      expect(host.textContent).toContain('保存された記録はありません');
    });

    it('marks the recording being made, and only while recording', async () => {
      expect(host.querySelector('.animate-pulse')).toBeNull();

      isRecording.set(true);
      await drawn();

      expect(rows()[0].querySelector('.animate-pulse')).toBeNull();
      expect(rows()[1].querySelector('.animate-pulse')).not.toBeNull();
    });

    it('picks out the recording that is open', async () => {
      openedId.set(2);
      await drawn();

      expect(rows().map((row) => row.classList.contains('border-ui-accent'))).toEqual([false, true]);
    });
  });

  describe('opening a recording', () => {
    it('opens the one pressed', async () => {
      rows()[1].click();
      await settled();

      expect(playback.open).toHaveBeenCalledWith(2);
      expect(ask).not.toHaveBeenCalled();
    });

    it('opens the open one again from its start', async () => {
      openedId.set(1);

      rows()[0].click();
      await settled();

      expect(playback.open).toHaveBeenCalledWith(1);
    });

    it('opens nothing while the edits are being saved', async () => {
      isSaving.set(true);

      rows()[0].click();
      await settled();

      expect(playback.open).not.toHaveBeenCalled();
    });

    it('leaves the recording being edited as it is', async () => {
      isEditing.set(true);
      openedId.set(1);

      rows()[0].click();
      await settled();

      expect(playback.open).not.toHaveBeenCalled();
      expect(editor.cancel).not.toHaveBeenCalled();
    });

    it('throws untouched edits away without asking before opening another', async () => {
      isEditing.set(true);
      openedId.set(1);

      rows()[1].click();
      await settled();

      expect(ask).not.toHaveBeenCalled();
      expect(editor.cancel).toHaveBeenCalledTimes(1);
      expect(playback.open).toHaveBeenCalledWith(2);
    });

    it('asks before throwing edits away, and opens the other only on a yes', async () => {
      isEditing.set(true);
      isDirty.set(true);
      openedId.set(1);
      ask.mockResolvedValueOnce(false);

      rows()[1].click();
      await settled();
      expect(editor.cancel).not.toHaveBeenCalled();
      expect(playback.open).not.toHaveBeenCalled();

      rows()[1].click();
      await settled();
      expect(editor.cancel).toHaveBeenCalledTimes(1);
      expect(playback.open).toHaveBeenCalledWith(2);
    });
  });

  describe('writing a recording out and reading one in', () => {
    it('writes a recording out with its pictures and sounds until the box is cleared, without opening it', async () => {
      buttonOf(rows()[0], '書き出し').click();
      await settled();
      expect(library.export).toHaveBeenLastCalledWith(FIRST, true);

      host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.dispatchEvent(new Event('change'));
      buttonOf(rows()[0], '書き出し').click();
      await settled();

      expect(library.export).toHaveBeenLastCalledWith(FIRST, false);
      expect(playback.open).not.toHaveBeenCalled();
    });

    it('takes no export while the library is busy', async () => {
      isBusy.set(true);
      await drawn();

      expect(buttonOf(rows()[0], '書き出し').disabled).toBe(true);
    });

    it('reads a file in and lists the recordings afresh', async () => {
      const file = new File(['zip'], 'replay.zip', { type: 'application/zip' });
      const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(picker, 'files', { value: [file], configurable: true });

      picker.dispatchEvent(new Event('change'));
      await settled();

      expect(library.import).toHaveBeenCalledWith(file);
      expect(recorder.refresh).toHaveBeenCalledTimes(2);
    });

    it('reads nothing in when no file was chosen', async () => {
      const picker = host.querySelector<HTMLInputElement>('input[type="file"]')!;
      Object.defineProperty(picker, 'files', { value: [], configurable: true });

      picker.dispatchEvent(new Event('change'));
      await settled();

      expect(library.import).not.toHaveBeenCalled();
    });
  });

  describe('throwing a recording away', () => {
    it('asks first, naming when it started, and keeps it on a no', async () => {
      ask.mockResolvedValueOnce(false);

      buttonOf(rows()[0], '削除').click();
      await settled();

      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `${formatSnapshotSavedAt(FIRST.startedAt)} の記録を削除しますか？`,
          danger: true,
        })
      );
      expect(recorder.remove).not.toHaveBeenCalled();
      expect(playback.open).not.toHaveBeenCalled();
    });

    it('throws it away on a yes, leaving the open recording open', async () => {
      openedId.set(2);

      buttonOf(rows()[0], '削除').click();
      await settled();

      expect(recorder.remove).toHaveBeenCalledWith(1);
      expect(playback.close).not.toHaveBeenCalled();
    });

    it('closes the recording first when it is the open one', async () => {
      openedId.set(1);
      const order: string[] = [];
      playback.close.mockImplementationOnce(async () => void order.push('close'));
      recorder.remove.mockImplementationOnce(async () => void order.push('remove'));

      buttonOf(rows()[0], '削除').click();
      await settled();

      expect(order).toEqual(['close', 'remove']);
    });

    it('is not offered to a seat that is only watching', async () => {
      beSeat(PeerRole.Guest);
      fixture = TestBed.createComponent(ReplayRecordingListComponent);
      host = fixture.nativeElement as HTMLElement;
      await drawn();

      const remove = buttonOf(rows()[0], '削除');
      expect(remove.disabled).toBe(true);
      remove.click();
      await settled();

      expect(ask).not.toHaveBeenCalled();
      expect(recorder.remove).not.toHaveBeenCalled();
    });
  });
});

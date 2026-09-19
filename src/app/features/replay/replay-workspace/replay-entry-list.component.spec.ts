import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayEntryListComponent } from '@axe/features/replay/replay-workspace/replay-entry-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function event(seq: number, text: string): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { name: '盗賊', text },
    visibility: PUBLIC_VISIBILITY,
  };
}

const events: readonly ReplayEvent[] = [event(1, 'ひとつめ'), event(2, 'ふたつめ'), event(3, 'みっつめ')];

/** The recording open in the replay, shared by every fake playback so a spec can open another. */
let recordingId = signal<number | null>(1);

beforeEach(() => {
  recordingId = signal<number | null>(1);
});

function dragEvent(name: string, clientY = 0): Event {
  const fired = new Event(name, { bubbles: true, cancelable: true });
  Object.defineProperty(fired, 'clientY', { value: clientY });
  // A real one always carries the list, and something listening on the page may read it.
  Object.defineProperty(fired, 'dataTransfer', {
    value: { effectAllowed: '', types: [], setData: vi.fn(), getData: vi.fn(() => '') },
  });
  return fired;
}

function place(row: HTMLElement, top: number): void {
  Object.defineProperty(row, 'getBoundingClientRect', { value: () => ({ top, height: 20 }) });
}

describe('rearranging the entries', () => {
  let fixture: ComponentFixture<ReplayEntryListComponent>;
  let move: ReturnType<typeof vi.fn>;

  function rows(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[draggable="true"]'));
  }

  function dragTo(from: number, to: number, clientY: number): void {
    const source = rows()[from];
    const destination = rows()[to];
    place(destination, 100);
    source.dispatchEvent(dragEvent('dragstart'));
    destination.dispatchEvent(dragEvent('dragover', clientY));
    fixture.detectChanges();
    destination.dispatchEvent(dragEvent('drop'));
  }

  beforeEach(async () => {
    move = vi.fn();
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });

    await TestBed.configureTestingModule({
      imports: [ReplayEntryListComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: signal(events).asReadonly(),
            recordingId: recordingId.asReadonly(),
            cursor: signal(0).asReadonly(),
            manifest: signal(null).asReadonly(),
            cast: signal([]).asReadonly(),
            isBoardMode: signal(false).asReadonly(),
            seekTo: vi.fn().mockResolvedValue(undefined),
            enterBoardMode: vi.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: {
            edited: signal(events).asReadonly(),
            isEditing: signal(true).asReadonly(),
            isInserted: () => false,
            insert: vi.fn(),
            move,
            remove: vi.fn(),
            retext: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayEntryListComponent);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  it('leaves a drop it has no row to move for the rest of the page to answer', () => {
    const dropped = dragEvent('drop');

    rows()[0].dispatchEvent(dropped);

    expect(dropped.defaultPrevented).toBe(false);
  });

  it('keeps the drop that moves a row to itself', () => {
    const source = rows()[0];
    const destination = rows()[2];
    place(destination, 100);
    source.dispatchEvent(dragEvent('dragstart'));
    destination.dispatchEvent(dragEvent('dragover', 115));
    fixture.detectChanges();
    const dropped = dragEvent('drop');

    destination.dispatchEvent(dropped);

    expect(dropped.defaultPrevented).toBe(true);
  });

  it('names the insert buttons between the rows readably', () => {
    const labels: string[] = Array.from(
      fixture.nativeElement.querySelectorAll('button[aria-label]'),
      (button) => (button as HTMLElement).getAttribute('aria-label') ?? ''
    );
    expect(labels.every((label) => !label.startsWith('feature.'))).toBe(true);
  });

  it('can be picked up only while it is being edited', () => {
    expect(rows()).toHaveLength(3);

    fixture.componentRef.setInput('editing', false);
    fixture.detectChanges();
    expect(rows()).toHaveLength(0);
  });

  it('puts a row dropped on the bottom half after the target', () => {
    dragTo(0, 2, 115);
    expect(move).toHaveBeenCalledWith(1, 2);
  });

  it('puts one dropped on the top half before it', () => {
    dragTo(2, 0, 105);
    expect(move).toHaveBeenCalledWith(3, -2);
  });

  it('moves nothing when it lands where it was', () => {
    dragTo(1, 1, 105);
    expect(move).not.toHaveBeenCalled();
  });

  it('does not pass a reordering drop on to the table', () => {
    // Let through, reordering a row would run the path for a file dropped on the table.
    const onDocument = vi.fn();
    document.body.addEventListener('drop', onDocument);
    document.body.addEventListener('dragover', onDocument);

    try {
      dragTo(0, 2, 115);
    } finally {
      document.body.removeEventListener('drop', onDocument);
      document.body.removeEventListener('dragover', onDocument);
    }

    expect(move).toHaveBeenCalledWith(1, 2);
    expect(onDocument).not.toHaveBeenCalled();
  });

  it('shows where the row would land', () => {
    const source = rows()[0];
    const destination = rows()[2];
    place(destination, 100);
    source.dispatchEvent(dragEvent('dragstart'));
    destination.dispatchEvent(dragEvent('dragover', 115));
    fixture.detectChanges();

    expect(rows()[2].style.boxShadow).toContain('inset 0 -2px');
    expect(rows()[0].classList).toContain('opacity-40');
  });

  it('lets go of a drag that ended where its row could not hear it', () => {
    const source = rows()[0];
    source.dispatchEvent(dragEvent('dragstart'));
    fixture.detectChanges();
    expect(rows()[0].classList.contains('opacity-40')).toBe(true);

    document.dispatchEvent(new MouseEvent('mousemove'));
    fixture.detectChanges();

    expect(rows()[0].classList.contains('opacity-40')).toBe(false);
  });

  it('takes that mark away once it is let go', () => {
    const source = rows()[0];
    const destination = rows()[2];
    place(destination, 100);
    source.dispatchEvent(dragEvent('dragstart'));
    destination.dispatchEvent(dragEvent('dragover', 115));
    source.dispatchEvent(dragEvent('dragend'));
    fixture.detectChanges();

    expect(rows()[2].style.boxShadow).toBe('');
    expect(move).not.toHaveBeenCalled();
  });
});

describe('a long recording in the list', () => {
  const many: readonly ReplayEvent[] = Array.from({ length: 2_000 }, (_, i) => event(i + 1, `発言 ${i + 1}`));

  beforeEach(async () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });
    await TestBed.configureTestingModule({
      imports: [ReplayEntryListComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: signal(many).asReadonly(),
            recordingId: recordingId.asReadonly(),
            cursor: signal(0).asReadonly(),
            manifest: signal(null).asReadonly(),
            cast: signal([]).asReadonly(),
            isBoardMode: signal(false).asReadonly(),
            seekTo: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: {
            edited: signal(many).asReadonly(),
            isEditing: signal(false).asReadonly(),
            isInserted: () => false,
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  it('draws only the rows near the screen, not every row', () => {
    const fixture = TestBed.createComponent(ReplayEntryListComponent);
    fixture.detectChanges();

    const drawn = fixture.nativeElement.querySelectorAll('[role="listitem"]').length;
    expect(drawn).toBeGreaterThan(0);
    expect(drawn).toBeLessThan(100);
    expect(fixture.nativeElement.textContent).toContain('発言 1');
    expect(fixture.nativeElement.textContent).not.toContain('発言 2000');
  });
});

describe('editing the list by choosing rows', () => {
  let fixture: ComponentFixture<ReplayEntryListComponent>;
  let removeMany: ReturnType<typeof vi.fn>;
  let stepMany: ReturnType<typeof vi.fn>;
  let retext: ReturnType<typeof vi.fn>;
  let openMenu: ReturnType<typeof vi.spyOn>;

  const moveEvent = (seq: number): ReplayEvent => ({
    ...event(seq, ''),
    kind: ReplayEventKind.ObjectMove,
    detail: { from: { name: 'table', x: 0, y: 0, z: 0 }, to: { name: 'table', x: 50, y: 0, z: 0 } },
  });
  const story: readonly ReplayEvent[] = [
    event(1, 'はじめ'),
    moveEvent(2),
    moveEvent(3),
    event(4, 'つぎ'),
    event(5, 'おわり'),
  ];

  function rowElements(): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('[aria-selected]'));
  }

  function press(row: HTMLElement, init: MouseEventInit = {}): void {
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
    fixture.detectChanges();
  }

  function key(init: KeyboardEventInit): void {
    fixture.nativeElement
      .querySelector('ui-virtual-list')
      .dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    removeMany = vi.fn();
    stepMany = vi.fn();
    retext = vi.fn();
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });
    await TestBed.configureTestingModule({
      imports: [ReplayEntryListComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: signal(story).asReadonly(),
            recordingId: recordingId.asReadonly(),
            cursor: signal(0).asReadonly(),
            manifest: signal(null).asReadonly(),
            cast: signal([]).asReadonly(),
            isBoardMode: signal(false).asReadonly(),
            seekTo: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: {
            edited: signal(story).asReadonly(),
            isEditing: signal(true).asReadonly(),
            isInserted: () => false,
            removeMany,
            stepMany,
            retext,
          },
        },
      ],
    }).compileComponents();

    openMenu = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    fixture = TestBed.createComponent(ReplayEntryListComponent);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
    vi.restoreAllMocks();
  });

  it('folds the board events between the lines until they are opened', () => {
    expect(rowElements()).toHaveLength(3);

    (fixture.nativeElement.querySelector('button[aria-expanded="false"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(rowElements()).toHaveLength(5);
  });

  it('chooses a run of rows with the shift key', () => {
    press(rowElements()[0]);
    press(rowElements()[2], { shiftKey: true });

    expect(rowElements().map((row) => row.getAttribute('aria-selected'))).toEqual(['true', 'true', 'true']);
  });

  it('leaves the rows of a folded run out of a range, so they are not removed unseen', () => {
    press(rowElements()[0]);
    press(rowElements()[2], { shiftKey: true });

    key({ key: 'Delete' });

    expect([...removeMany.mock.calls[0][0]].sort()).toEqual([1, 4, 5]);
  });

  it('reaches into a run that is open', () => {
    (fixture.nativeElement.querySelector('button[aria-expanded="false"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    press(rowElements()[0]);
    press(rowElements()[4], { shiftKey: true });

    key({ key: 'Delete' });

    expect([...removeMany.mock.calls[0][0]].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('removes every row chosen on Delete, as one change', () => {
    press(rowElements()[1]);
    press(rowElements()[2], { ctrlKey: true });

    key({ key: 'Delete' });

    expect(removeMany).toHaveBeenCalledTimes(1);
    expect([...removeMany.mock.calls[0][0]].sort()).toEqual([4, 5]);
  });

  it('moves the chosen rows a step with Alt and an arrow', () => {
    press(rowElements()[2]);

    key({ key: 'ArrowUp', altKey: true });

    expect(stepMany).toHaveBeenCalledWith(new Set([5]), -1, expect.any(Function));
  });

  it('steps a row over a folded run of the board as a whole, not one hidden event at a time', () => {
    press(rowElements()[1]);

    key({ key: 'ArrowUp', altKey: true });

    const isStop = stepMany.mock.calls[0][2] as (event: ReplayEvent) => boolean;
    expect(story.filter(isStop).map((e) => e.seq)).toEqual([1, 2, 4, 5]);
  });

  it('forgets the rows chosen once editing ends, so they are neither shown nor removed later', () => {
    press(rowElements()[0]);
    fixture.componentRef.setInput('editing', false);
    fixture.detectChanges();
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();

    key({ key: 'Delete' });

    expect(rowElements().every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
    expect(removeMany).not.toHaveBeenCalled();
  });

  it('forgets the rows chosen once another recording opens', () => {
    press(rowElements()[0]);
    recordingId.set(2);
    fixture.detectChanges();

    expect(rowElements().every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  describe('rewriting the row chosen', () => {
    function field(): HTMLInputElement | null {
      return fixture.nativeElement.querySelector('input[type="text"]:not([placeholder])');
    }

    async function open(): Promise<HTMLInputElement> {
      press(rowElements()[0]);
      key({ key: 'Enter' });
      await fixture.whenStable();
      return field()!;
    }

    it('puts the keys in the field that opens, so what is typed goes there', async () => {
      const input = await open();

      expect(document.activeElement).toBe(input);
    });

    it('writes nothing when called off, even as the field closing takes the focus with it', async () => {
      const input = await open();
      input.value = '書き換え';

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();

      expect(retext).not.toHaveBeenCalled();
      expect(field()).toBeNull();
    });

    it('writes the row once on Enter, and leaves it closed', async () => {
      const input = await open();
      input.value = '書き換え';

      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('blur'));
      fixture.detectChanges();

      expect(retext).toHaveBeenCalledTimes(1);
      expect(retext).toHaveBeenCalledWith(1, '書き換え');
      expect(field()).toBeNull();
    });
  });

  it('lets the choice go on Escape', () => {
    press(rowElements()[0]);

    key({ key: 'Escape' });

    expect(rowElements().every((row) => row.getAttribute('aria-selected') === 'false')).toBe(true);
  });

  it('opens the menu of the row pressed with the other button, choosing it', () => {
    rowElements()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(openMenu).toHaveBeenCalledTimes(1);
    expect(rowElements()[1].getAttribute('aria-selected')).toBe('true');
  });
});

describe('writing entries one after another', () => {
  let fixture: ComponentFixture<ReplayEntryListComponent>;
  let edited: ReturnType<typeof signal<readonly ReplayEvent[]>>;
  let nextSeq: number;

  beforeEach(async () => {
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'gm', role: PeerRole.GameMaster });
    edited = signal<readonly ReplayEvent[]>(events);
    nextSeq = 100;
    const inserted = new Set<number>();
    await TestBed.configureTestingModule({
      imports: [ReplayEntryListComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: signal(events).asReadonly(),
            recordingId: recordingId.asReadonly(),
            cursor: signal(0).asReadonly(),
            manifest: signal(null).asReadonly(),
            cast: signal([]).asReadonly(),
            isBoardMode: signal(false).asReadonly(),
            seekTo: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReplayEditorService,
          useValue: {
            edited: edited.asReadonly(),
            isEditing: signal(true).asReadonly(),
            isInserted: (seq: number) => inserted.has(seq),
            insert: (index: number, draft: { text: string }) => {
              const entry = event(nextSeq++, draft.text);
              inserted.add(entry.seq);
              edited.update((list) => [...list.slice(0, index), entry, ...list.slice(index)]);
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReplayEntryListComponent);
    fixture.componentRef.setInput('editing', true);
    fixture.detectChanges();
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  function write(text: string): void {
    const list = fixture.componentInstance as unknown as {
      insertText: { set(value: string): void };
      insertHere(): void;
    };
    list.insertText.set(text);
    list.insertHere();
    fixture.detectChanges();
  }

  it('puts each after the one written before it, in the order written', () => {
    (fixture.nativeElement.querySelectorAll('[aria-selected]')[0] as HTMLElement).dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    fixture.detectChanges();

    write('A');
    write('B');

    expect(edited().map((entry) => entry.detail['text'])).toEqual(['ひとつめ', 'A', 'B', 'ふたつめ', 'みっつめ']);
  });
});

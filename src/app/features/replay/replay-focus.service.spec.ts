import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReplayEditorService } from '@axe/application/replay/replay-editor.service';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { ReplayFocusService } from '@axe/features/replay/replay-focus.service';

describe('ReplayFocusService', () => {
  const recordingId = signal<number | null>(1);
  const cursor = signal(0);
  const isEditing = signal(true);
  let focus: ReplayFocusService;

  beforeEach(() => {
    recordingId.set(1);
    cursor.set(0);
    isEditing.set(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: ReplayPlaybackService, useValue: { recordingId, cursor } },
        { provide: ReplayEditorService, useValue: { isEditing } },
      ],
    });
    focus = TestBed.inject(ReplayFocusService);
  });

  it('holds the row chosen', () => {
    focus.choose(7);

    expect(focus.seq()).toBe(7);
  });

  it('lets the row go once another recording opens', () => {
    focus.choose(7);
    recordingId.set(2);

    expect(focus.seq()).toBeNull();
  });

  it('lets the row go once editing ends, since a save numbers the events afresh', () => {
    focus.choose(7);
    isEditing.set(false);

    expect(focus.seq()).toBeNull();
  });

  it('lets the row go once the playback cursor moves on', () => {
    focus.choose(7);
    cursor.set(3);

    expect(focus.seq()).toBeNull();
  });
});

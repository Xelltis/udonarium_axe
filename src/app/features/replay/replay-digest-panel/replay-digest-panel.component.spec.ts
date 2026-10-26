import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ReplayPlaybackService } from '@axe/application/replay/replay-playback.service';
import { encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
} from '@axe/domain/replay/replay-event';
import { ReplayDigestPanelComponent } from '@axe/features/replay/replay-digest-panel/replay-digest-panel.component';
import { ReplayPhotoService } from '@axe/features/replay/replay-digest-panel/replay-photo.service';
import { ReplayEditorService } from '@axe/features/replay/replay-editor.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const MANIFEST = {
  roomName: '第一夜',
  startedAt: 0,
  endedAt: null,
  actors: [
    { userId: 'alice', peerId: 'p1', name: 'アリス', role: PeerRole.Player, imageIdentifier: '', sinceSeq: 0 },
    { userId: 'gm', peerId: 'p2', name: 'GM', role: PeerRole.GameMaster, imageIdentifier: '', sinceSeq: 0 },
  ],
  targets: [{ identifier: 'char-1', aliasName: 'character', name: 'ゴブリン', sinceSeq: 0 }],
};

function say(seq: number, actorId = 'alice', overrides: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId,
    detail: { text: 'やあ', name: 'アリス' },
    visibility: PUBLIC_VISIBILITY,
    ...overrides,
  };
}

function roll(seq: number, value: number, outcome = ''): ReplayEvent {
  return {
    ...say(seq),
    kind: ReplayEventKind.ChatDice,
    detail: {
      dicebot: encodeDiceRollDetail({
        system: 'Cthulhu',
        faces: [{ sides: 6, value, kind: 'normal' }],
        outcome: outcome as '',
      }),
    },
  };
}

describe('ReplayDigestPanelComponent', () => {
  let fixture: ComponentFixture<ReplayDigestPanelComponent>;
  let events: readonly ReplayEvent[];
  let role: PeerRole;
  let cast: { identifier: string; name: string; imageIdentifier: string; chatColor: string; onTable: boolean }[];
  let savePhoto: ReturnType<typeof vi.fn>;

  function photoButton(): HTMLButtonElement | undefined {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((button) =>
      button.textContent?.includes('記念写真')
    );
  }

  function numberOf(label: string): string {
    const cells = [...(fixture.nativeElement as HTMLElement).querySelectorAll('div.grid > div')];
    const cell = cells.find((item) => item.querySelector('span')?.textContent?.trim() === label);
    return cell?.querySelectorAll('span')[1]?.textContent?.trim() ?? '';
  }

  async function setup(): Promise<void> {
    PeerCursor.myCursor = Object.assign(new PeerCursor(), { peerId: 'p', userId: 'alice', role });

    await TestBed.configureTestingModule({
      imports: [ReplayDigestPanelComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplayPlaybackService,
          useValue: {
            events: signal(events).asReadonly(),
            manifest: signal(MANIFEST).asReadonly(),
            cast: signal(cast).asReadonly(),
          },
        },
        { provide: ReplayPhotoService, useValue: { save: savePhoto } },
        {
          provide: ReplayEditorService,
          useValue: { isEditing: signal(false).asReadonly(), edited: signal([]).asReadonly() },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReplayDigestPanelComponent);
    fixture.detectChanges();
  }

  beforeEach(() => {
    role = PeerRole.Player;
    events = [say(1), say(2), roll(3, 6, 'critical')];
    cast = [
      { identifier: 'char-1', name: 'ゴブリン', imageIdentifier: 'img-1', chatColor: '', onTable: true },
      { identifier: 'char-9', name: 'しまってあるコマ', imageIdentifier: 'img-9', chatColor: '', onTable: false },
    ];
    savePhoto = vi.fn().mockResolvedValue({ saved: true, omitted: 0 });
  });

  afterEach(() => {
    PeerCursor.myCursor = null as unknown as PeerCursor;
  });

  it('shows how the dice fell, in total and by person', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('ダイスの出方');
    expect(text).toContain('アリス');
    expect(text).not.toContain('出目が残っていません');
  });

  it('never shows a translation key on the screen', async () => {
    // The keys for the columns and the titles are built by joining strings, so a missing translation cannot be found in a list of keys.
    events = [
      say(1),
      say(2),
      roll(3, 6, 'critical'),
      roll(4, 1, 'fumble'),
      roll(5, 2, 'failure'),
      {
        ...say(6, 'gm'),
        kind: ReplayEventKind.ObjectValue,
        targetId: 'char-1',
        detail: { changes: [{ kind: 'damage', delta: -8, name: 'HP' }] },
      },
    ];
    await setup();

    expect(fixture.nativeElement.textContent).not.toContain('feature.replay.digest');
  });

  it('says so for a recording that kept no rolls', async () => {
    events = [say(1), { ...say(2), kind: ReplayEventKind.ChatDice, detail: { dicebot: '' } }];
    await setup();

    expect(fixture.nativeElement.textContent).toContain('出目が残っていません');
  });

  it('shows no ledger for one that kept no changes', async () => {
    await setup();

    expect(fixture.nativeElement.textContent).toContain('増減が残っていません');
  });

  it('counts no line it cannot see', async () => {
    events = [say(1), { ...say(2, 'gm'), visibility: GM_ONLY_VISIBILITY }];
    await setup();

    expect(numberOf('発言')).toBe('1');
  });

  it('exports the summary as markdown', async () => {
    const saved: { blob: Blob; name: string }[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      saved.push({ blob: blob as Blob, name: '' });
      return 'blob:summary';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      if (saved.length > 0) saved[saved.length - 1].name = this.download;
    });

    await setup();
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((button) => button.textContent?.includes('まとめを書き出す'))
      ?.click();

    expect(saved).toHaveLength(1);
    expect(saved[0].name.endsWith('_summary.md')).toBe(true);
    expect(await saved[0].blob.text()).toContain('# 第一夜');
    vi.restoreAllMocks();
  });

  it('exports a keepsake photo with the pieces and names of this recording', async () => {
    await setup();
    photoButton()?.click();
    await fixture.whenStable();

    // Only the pieces that were out are photographed; those put away are not in the group.
    expect(savePhoto).toHaveBeenCalledWith(expect.objectContaining({ cast: [cast[0]], roomName: '第一夜' }));
  });

  it('says how many did not fit', async () => {
    savePhoto = vi.fn().mockResolvedValue({ saved: true, omitted: 3 });
    await setup();
    photoButton()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('3 人');
  });

  it('says so when it cannot make one', async () => {
    savePhoto = vi.fn().mockRejectedValue(new Error('描けません'));
    await setup();
    photoButton()?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('写真を作れませんでした');
  });

  it('offers no photo for a recording with nobody in it', async () => {
    cast = [];
    await setup();

    expect(photoButton()).toBeUndefined();
  });

  it('says so alone when there is nothing to summarise', async () => {
    events = [];
    await setup();

    expect(fixture.nativeElement.textContent).toContain('まとめるものがありません');
  });
});

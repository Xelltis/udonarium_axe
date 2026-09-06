import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ContextMenuType } from '@axe/application/ui/context-menu.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TextNote } from '@axe/domain/tabletop/text-note';
import {
  buildTextNoteContextMenu,
  buildTextNoteContextMenuModel,
} from '@axe/features/tabletop/text-note/text-note-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

function makeService(): GameObjectInventoryService {
  return { notifyInventoryUpdate: vi.fn() } as unknown as GameObjectInventoryService;
}

interface MutableTextNote {
  altitude: number;
  isAltitudeIndicate: boolean;
  isLock: boolean;
  isUpright: boolean;
  location: { x: number; y: number };
  destroy: ReturnType<typeof vi.fn>;
  clone: ReturnType<typeof vi.fn>;
}

function makeTextNote(
  overrides: Partial<MutableTextNote & { isLock: boolean; isUpright: boolean; isAltitudeIndicate: boolean }> = {}
): MutableTextNote {
  return {
    altitude: 0,
    isAltitudeIndicate: false,
    isLock: false,
    isUpright: false,
    location: { x: 0, y: 0 },
    destroy: vi.fn(),
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, toTopmost: vi.fn() })),
    ...overrides,
  };
}

const names = (a: { name: string }[]) => a.map((x) => x.name);

describe('buildTextNoteContextMenu()', () => {
  beforeEach(() => {
    PeerCursor.myCursor = null!;
  });

  it('groups every action for the 2D menu without changing the ordinary menu', () => {
    const note = makeTextNote();
    const surfaceAction = { name: '地形へ移動', action: vi.fn() };
    const model = buildTextNoteContextMenuModel(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t,
      [surfaceAction]
    );

    expect(model.radialGroups.map((group) => group.name)).toEqual(['内容', '表示', '公開・所有', '移動・操作']);
    const ordinaryActions = model.actions.filter((action) => action.type !== ContextMenuType.SEPARATOR);
    const radialActions = model.radialGroups.flatMap((group) => group.actions);
    expect(new Set(radialActions)).toEqual(new Set(ordinaryActions));
  });

  it('leads with editing the note, and offers altitude, standing, locking, copying and deleting', () => {
    const note = makeTextNote();
    const menu = buildTextNoteContextMenu(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    expect(menu[0].name).toBe('メモを編集');
    const altitude = menu.find((m) => m.name === '高度設定');
    expect(altitude?.subActions?.length).toBe(2);
    expect(names(menu)).toContain('固定する');
    expect(names(menu)).toContain('直立させる');
    expect(names(menu)).toContain('メモを編集');
    expect(names(menu)).toContain('コピーを作る');
    expect(names(menu)).toContain('削除する');
  });

  it('offers to unlock what is locked, and does', () => {
    const note = makeTextNote({ isLock: true });
    const menu = buildTextNoteContextMenu(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    const unlockEntry = menu.find((m) => m.name === '固定解除');
    expect(unlockEntry).toBeDefined();
    unlockEntry!.action!();
    expect(note.isLock).toBe(false);
  });

  it('offers to lay down what stands and to stand up what lies flat', () => {
    const standing = makeTextNote({ isUpright: true });
    const standingMenu = buildTextNoteContextMenu(
      standing as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    expect(names(standingMenu)).toContain('寝かせる');

    const laying = makeTextNote({ isUpright: false });
    const layingMenu = buildTextNoteContextMenu(
      laying as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    expect(names(layingMenu)).toContain('直立させる');
  });

  it('opens the note for editing', () => {
    const note = makeTextNote();
    const onShowDetail = vi.fn();
    const menu = buildTextNoteContextMenu(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail },
      t
    );
    menu.find((m) => m.name === 'メモを編集')!.action!();
    expect(onShowDetail).toHaveBeenCalled();
  });

  it('destroys the note', () => {
    const note = makeTextNote();
    const menu = buildTextNoteContextMenu(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    menu.find((m) => m.name === '削除する')!.action!();
    expect(note.destroy).toHaveBeenCalled();
  });

  it('draws exactly two separators without permission', () => {
    const note = makeTextNote();
    const menu = buildTextNoteContextMenu(
      note as unknown as TextNote,
      50,
      makeService(),
      { onSetUpright: vi.fn(), onShowDetail: vi.fn() },
      t
    );
    expect(menu.filter((m) => m.type === ContextMenuType.SEPARATOR)).toHaveLength(2);
  });
});

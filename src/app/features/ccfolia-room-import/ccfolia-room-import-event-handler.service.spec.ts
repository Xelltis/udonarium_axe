import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { emitCcfoliaRoomDropped } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CcfoliaRoomImportService } from '@axe/features/ccfolia-room-import/ccfolia-room-import.service';
import { CcfoliaRoomImportEventHandlerService } from '@axe/features/ccfolia-room-import/ccfolia-room-import-event-handler.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const SUMMARY = {
  tableName: 'ココフォリアのルーム',
  tableCount: 1,
  panelCount: 2,
  pieceCount: 1,
  hiddenPanelCount: 0,
  missingImageCount: 0,
  skipped: { panels: 0, decks: 1, effects: 0 },
};

describe('CcfoliaRoomImportEventHandlerService', () => {
  let chatStub: { sendSystemNotice: ReturnType<typeof vi.fn> };
  let importAsync: ReturnType<typeof vi.fn>;
  let canEditTabletop: boolean;

  function setup(): void {
    chatStub = { sendSystemNotice: vi.fn() };
    importAsync = vi.fn().mockResolvedValue({ summary: SUMMARY, error: null });

    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    TestBed.overrideProvider(ChatMessageService, { useValue: chatStub });
    TestBed.overrideProvider(CcfoliaRoomImportService, { useValue: { importAsync } });
    TestBed.overrideProvider(RolePermissionService, {
      useValue: {
        canEditTabletop() {
          return canEditTabletop;
        },
      },
    });
    TestBed.inject(CcfoliaRoomImportEventHandlerService);
  }

  beforeEach(() => {
    canEditTabletop = true;
  });

  afterEach(() => {
    const allObjects = ObjectStore.instance.getObjects();
    allObjects.forEach((object) => ObjectStore.instance.delete(object, false));
    ObjectStore.instance.clearDeleteHistory();
  });

  it('reports what came in and what did not', async () => {
    setup();

    emitCcfoliaRoomDropped({ entries: {} });
    await vi.waitFor(() => expect(chatStub.sendSystemNotice).toHaveBeenCalled());

    const messages = chatStub.sendSystemNotice.mock.calls.map((call) => call[1] as string);
    expect(importAsync).toHaveBeenCalledOnce();
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('feature.tabletop.ccfoliaImport.imported');
    expect(messages[1]).toContain('feature.tabletop.ccfoliaImport.skippedDecks');
    expect(messages[2]).toContain('feature.tabletop.ccfoliaImport.bgmNotice');
  });

  it('imports nothing without permission to edit', async () => {
    canEditTabletop = false;
    setup();

    emitCcfoliaRoomDropped({ entries: {} });
    await vi.waitFor(() => expect(chatStub.sendSystemNotice).toHaveBeenCalled());

    expect(importAsync).not.toHaveBeenCalled();
    expect(chatStub.sendSystemNotice.mock.calls[0][1]).toContain('feature.tabletop.ccfoliaImport.errors.denied');
  });

  it('reports the error alone when it cannot read the file', async () => {
    setup();
    importAsync.mockResolvedValue({ summary: null, error: 'unrecognized' });

    emitCcfoliaRoomDropped({ entries: {} });
    await vi.waitFor(() => expect(chatStub.sendSystemNotice).toHaveBeenCalled());

    expect(chatStub.sendSystemNotice).toHaveBeenCalledOnce();
    expect(chatStub.sendSystemNotice.mock.calls[0][1]).toContain('feature.tabletop.ccfoliaImport.errors.unrecognized');
  });
});

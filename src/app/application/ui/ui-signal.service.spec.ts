import { TestBed } from '@angular/core/testing';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';

describe('UiSignalService', () => {
  let service: UiSignalService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UiSignalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should increment chatRedrawVersion on notifyChatRedraw', () => {
    const initial = service.chatRedrawVersion();
    service.notifyChatRedraw();
    expect(service.chatRedrawVersion()).toBe(initial + 1);
  });

  it('should increment terrainGridShowVersion on notifyTerrainGridShow', () => {
    const initial = service.terrainGridShowVersion();
    service.notifyTerrainGridShow();
    expect(service.terrainGridShowVersion()).toBe(initial + 1);
  });

  it('should increment terrainGridEndVersion on notifyTerrainGridEnd', () => {
    const initial = service.terrainGridEndVersion();
    service.notifyTerrainGridEnd();
    expect(service.terrainGridEndVersion()).toBe(initial + 1);
  });

  it('should set targetChange on notifyTargetChange', () => {
    service.notifyTargetChange('id-1', 'ClassName');
    const data = service.targetChange();
    expect(data).toEqual({ identifier: 'id-1', className: 'ClassName' });
  });

  it('should set noteResizeRequest on requestNoteResize', () => {
    service.requestNoteResize('note-1');
    const data = service.noteResizeRequest();
    expect(data?.identifier).toBe('note-1');
    expect(data?.timestamp).toBeGreaterThan(0);
  });

  it('should set tableViewRotation on notifyTableViewRotation', () => {
    service.notifyTableViewRotation(10, 20, 30);
    const data = service.tableViewRotation();
    expect(data).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('should set chatJumpRequest on requestChatJump', () => {
    service.requestChatJump('msg-1');
    const data = service.chatJumpRequest();
    expect(data?.messageIdentifier).toBe('msg-1');
    expect(data?.timestamp).toBeGreaterThan(0);
  });

  it('clears the jump request so a new message does not scroll the log again', () => {
    service.requestChatJump('msg-1');
    expect(service.chatJumpRequest()).not.toBeNull();
    service.clearChatJump();
    expect(service.chatJumpRequest()).toBeNull();
  });
});

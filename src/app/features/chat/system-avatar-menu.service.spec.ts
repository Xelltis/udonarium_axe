import { TestBed } from '@angular/core/testing';
import { SystemAvatarService } from '@axe/application/chat/system-avatar.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { SystemAvatarMenuService } from '@axe/features/chat/system-avatar-menu.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

describe('SystemAvatarMenuService', () => {
  let service: SystemAvatarMenuService;
  let mayEdit: ReturnType<typeof vi.spyOn>;
  let openMenu: ReturnType<typeof vi.spyOn>;

  function rightClick(): MouseEvent {
    return new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(SystemAvatarMenuService);
    mayEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    openMenu = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    TestBed.inject(PointerDeviceService).primeForContextMenu(120, 80);
  });

  afterEach(() => vi.restoreAllMocks());

  it('opens the avatar’s menu under its title, in place of the browser’s own', () => {
    const event = rightClick();

    service.openContextMenu(event, 'dice');

    expect(event.defaultPrevented).toBe(true);
    expect(openMenu).toHaveBeenCalledTimes(1);
    expect(openMenu.mock.calls[0][2]).toBe(TestBed.inject(TRANSLATE_FN)('feature.chat.systemAvatar.title'));
    expect((openMenu.mock.calls[0][1] as unknown[]).length).toBeGreaterThan(0);
  });

  it('leaves the browser’s menu alone for a role that may not edit the table', () => {
    mayEdit.mockReturnValue(false);
    const event = rightClick();

    service.openContextMenu(event, 'system');

    expect(event.defaultPrevented).toBe(false);
    expect(openMenu).not.toHaveBeenCalled();
  });

  it('opens nothing where the pointer has moved since it was pressed', () => {
    vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(false);
    const event = rightClick();

    service.openContextMenu(event, 'system');

    expect(event.defaultPrevented).toBe(false);
    expect(openMenu).not.toHaveBeenCalled();
  });

  it('sets the picture picked as the avatar of that kind of message', async () => {
    const picked = vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue('picture-1' as never);
    const setImage = vi.spyOn(TestBed.inject(SystemAvatarService), 'setImage').mockImplementation(() => undefined);

    service.changeImage('dice');
    await Promise.resolve();
    await Promise.resolve();

    expect(picked).toHaveBeenCalledWith(FileSelecterComponent, { isAllowedEmpty: true });
    expect(setImage).toHaveBeenCalledWith('dice', 'picture-1');
  });

  it('leaves the avatar as it was where the picker is closed without a choice', async () => {
    vi.spyOn(TestBed.inject(ModalService), 'open').mockResolvedValue(undefined as never);
    const setImage = vi.spyOn(TestBed.inject(SystemAvatarService), 'setImage').mockImplementation(() => undefined);

    service.changeImage('dice');
    await Promise.resolve();
    await Promise.resolve();

    expect(setImage).not.toHaveBeenCalled();
  });

  it('asks for no picture from a role that may not edit the table', () => {
    mayEdit.mockReturnValue(false);
    const picked = vi.spyOn(TestBed.inject(ModalService), 'open');

    service.changeImage('system');

    expect(picked).not.toHaveBeenCalled();
  });
});

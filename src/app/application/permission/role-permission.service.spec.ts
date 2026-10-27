import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { objectChanged$ } from '@axe/core/sync/object-event-extension';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

const CURSOR_ID = 'role-permission-spec-cursor';

function setMyRole(role: PeerRole | null) {
  PeerCursor.myCursor = (
    role == null ? null : ({ identifier: CURSOR_ID, role, isGameMaster: role === PeerRole.GameMaster } as PeerCursor)
  )!;
}

describe('RolePermissionService', () => {
  let service: RolePermissionService;
  const original = PeerCursor.myCursor;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [ObjectChangeService] });
    service = TestBed.inject(RolePermissionService);
  });

  afterEach(() => {
    PeerCursor.myCursor = original;
  });

  it('treats a missing cursor as the default player role', () => {
    setMyRole(null);
    expect(service.role()).toBe(PeerRole.Player);
    expect(service.isGameMaster()).toBe(false);
    expect(service.canEditTabletop()).toBe(true);
    expect(service.canSeeHidden()).toBe(false);
  });

  it('lets the game master edit and see hidden info', () => {
    setMyRole(PeerRole.GameMaster);
    expect(service.isGameMaster()).toBe(true);
    expect(service.canEditTabletop()).toBe(true);
    expect(service.canSeeHidden()).toBe(true);
    expect(service.canEditShared()).toBe(true);
  });

  it('lets a player edit but not see hidden info', () => {
    setMyRole(PeerRole.Player);
    expect(service.canEditTabletop()).toBe(true);
    expect(service.canSeeHidden()).toBe(false);
    expect(service.canEditShared()).toBe(false);
  });

  it('blocks a guest from editing and seeing hidden info', () => {
    setMyRole(PeerRole.Guest);
    expect(service.canEditTabletop()).toBe(false);
    expect(service.canSeeHidden()).toBe(false);
  });

  it('answers for the new role straight after it changes, before the room has announced it', () => {
    setMyRole(PeerRole.Player);
    expect(service.canEditTabletop()).toBe(true);

    setMyRole(PeerRole.Guest);

    expect(service.canEditTabletop()).toBe(false);
  });

  it('is followed by a computed once the change of role is announced', () => {
    setMyRole(PeerRole.Player);
    const mayEdit = computed(() => service.canEditTabletop());
    expect(mayEdit()).toBe(true);

    setMyRole(PeerRole.Guest);
    objectChanged$.emit({ identifier: CURSOR_ID, aliasName: PeerCursor.aliasName, isSendFromSelf: true });

    expect(mayEdit()).toBe(false);
  });
});

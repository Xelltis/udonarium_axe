import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  createExpectedPeerIdSet,
  isReconnectCompleted,
  ReConnectComponent,
  resolveReconnectUserId,
} from '@axe/features/lobby/re-connect/re-connect.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReConnectComponent', () => {
  let component: ReConnectComponent;
  let fixture: ComponentFixture<ReConnectComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ReConnectComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ReConnectComponent);
    component = fixture.componentInstance;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('keeps the user identifier it held through a reconnection', () => {
    expect(resolveReconnectUserId('persisted-user', 'current-user')).toBe('persisted-user');
  });

  it('falls back to the current one when it held none', () => {
    expect(resolveReconnectUserId('', 'current-user')).toBe('current-user');
  });

  it('leaves itself out of the peers it waits for', () => {
    const peerContexts = [PeerContext.parse('self-peer'), PeerContext.parse('peer-a'), PeerContext.parse('peer-b')];

    const expected = createExpectedPeerIdSet(peerContexts, 'self-peer');

    expect(expected.has('self-peer')).toBe(false);
    expect(expected.has('peer-a')).toBe(true);
    expect(expected.has('peer-b')).toBe(true);
  });

  it('counts the reconnection done only once every one of them is back', () => {
    const expected = new Set(['peer-a', 'peer-b']);

    expect(isReconnectCompleted(expected, new Set())).toBe(false);
    expect(isReconnectCompleted(expected, new Set(['peer-a']))).toBe(false);
    expect(isReconnectCompleted(expected, new Set(['peer-a', 'peer-b']))).toBe(true);
  });

  it('deletes nothing without being told to clean up', () => {
    component.networkService = {
      peerContext: { userId: 'current-user' },
    } as unknown as typeof Network;
    component.roomId = 'room-id';
    component.roomName = 'room-name';
    component.rooms = [{ alias: 'room-idroom-name', roomName: 'room-name', peerContexts: [] }];
    component.forceCleanup.set(false);

    const disconnectSpy = vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);
    const deleteSpy = vi.spyOn(component, 'deleteObject').mockImplementation(() => undefined);
    const connectSpy = vi.spyOn(component, 'connect').mockResolvedValue(undefined);

    component.reConnect();

    expect(disconnectSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(connectSpy).toHaveBeenCalledOnce();
  });

  it('deletes when it is', () => {
    component.networkService = {
      peerContext: { userId: 'current-user' },
    } as unknown as typeof Network;
    component.roomId = 'room-id';
    component.roomName = 'room-name';
    component.rooms = [{ alias: 'room-idroom-name', roomName: 'room-name', peerContexts: [] }];
    component.forceCleanup.set(true);

    vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);
    const deleteSpy = vi.spyOn(component, 'deleteObject').mockImplementation(() => undefined);
    vi.spyOn(component, 'connect').mockResolvedValue(undefined);

    component.reConnect();

    expect(deleteSpy).toHaveBeenCalledOnce();
  });

  describe('cleaning up', () => {
    afterEach(() => vi.restoreAllMocks());

    it('takes the pieces off this screen alone in a room server’s room, deleting and moving nothing', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      const character = GameCharacter.create('勇者', 1, '');
      const location = character.location.name;
      const send = vi.spyOn(Network, 'send');

      component.deleteObject();

      expect(ObjectStore.instance.get(character.identifier)).toBeNull();
      expect(ObjectStore.instance.isDeleted(character.identifier)).toBe(false);
      expect(character.location.name).toBe(location);
      expect(send).not.toHaveBeenCalled();
    });

    it('sends the pieces to the graveyard and deletes them among peers, as before', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');
      const character = GameCharacter.create('勇者', 1, '');

      component.deleteObject();

      expect(ObjectStore.instance.get(character.identifier)).toBeNull();
      expect(character.location.name).toBe('graveyard');
    });
  });
});

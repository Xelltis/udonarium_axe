import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RoomJoinService } from '@axe/application/lobby/room-join.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/index';
import { PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
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

  it('warns of lost data among peers, and says on a room server that the table stays there', () => {
    const textOf = () => {
      const made = TestBed.createComponent(ReConnectComponent);
      made.detectChanges();
      return (made.nativeElement as HTMLElement).textContent ?? '';
    };
    expect(textOf()).toContain('データが破棄された上に失敗します');

    vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    const onServer = textOf();
    expect(onServer).toContain('卓はサーバーに残ります');
    expect(onServer).not.toContain('データが破棄された上に失敗します');
    vi.restoreAllMocks();
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

    it('takes them away as the room server would, so the panels showing them close too', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      ObjectSynchronizer.instance.initialize();
      const character = GameCharacter.create('勇者', 1, '');
      const closed: string[] = [];
      const off = TestBed.inject(ObjectChangeService).objectDeleted$.subscribe((event) =>
        closed.push(event.identifier)
      );
      const send = vi.spyOn(Network, 'send');

      component.deleteObject();
      off();
      ObjectSynchronizer.instance.destroy();

      expect(ObjectStore.instance.get(character.identifier)).toBeNull();
      expect(ObjectStore.instance.isDeleted(character.identifier)).toBe(false);
      expect(closed).toContain(character.identifier);
      expect(send).not.toHaveBeenCalled();
    });

    it('hands a room without a key no password, one kept from another room included', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(component, 'myPeer', 'get').mockReturnValue({ reConnectPass: 'other-room' } as PeerCursor);
      const roomJoin = TestBed.inject(RoomJoinService);
      const join = vi.spyOn(roomJoin, 'joinServerRoom').mockResolvedValue(false);
      const open = { id: 'Ab3', name: '月夜の卓', roomKey: 'k', hasPassword: false } as IRoomInfo;
      const locked = { ...open, hasPassword: true } as IRoomInfo;
      const find = vi.spyOn(roomJoin, 'findServerRoom').mockResolvedValueOnce(open).mockResolvedValueOnce(locked);
      component.roomId = 'Ab3';
      component.roomName = '月夜の卓';
      vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);

      component.reConnect();
      await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(1));
      component.reConnect();
      await vi.waitFor(() => expect(join).toHaveBeenCalledTimes(2));

      expect(find).toHaveBeenCalledTimes(2);
      expect(join.mock.calls.map(([, password]) => password)).toEqual(['', 'other-room']);
    });

    it('asks first when changes have yet to reach the room server, and stays when the reader says no', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true, userId: 'u' } as PeerContext);
      vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(true);
      vi.spyOn(Network, 'hasSendsPending', 'get').mockReturnValue(true);
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      const find = vi.spyOn(TestBed.inject(RoomJoinService), 'findServerRoom');
      const disconnect = vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);

      await component.reConnect();

      expect(ask).toHaveBeenCalledWith(TestBed.inject(TRANSLATE_FN)('feature.lobby.reConnect.sending'));
      expect(disconnect).not.toHaveBeenCalled();
      expect(find).not.toHaveBeenCalled();
    });

    it('says the pieces’ changes are lost too when asked to drop inconsistent data with the link down', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true, userId: 'u' } as PeerContext);
      vi.spyOn(Network, 'isAuthorityOpen', 'get').mockReturnValue(false);
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);
      component.forceCleanup.set(true);

      await component.reConnect();

      const t = TestBed.inject(TRANSLATE_FN);
      expect(ask).toHaveBeenCalledWith(
        [t('feature.lobby.reConnect.unsentCleanup'), t('feature.lobby.reConnect.cleanupLoss')].join('\n')
      );
    });

    it('takes nothing away until it has found the room to get back into', async () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      vi.spyOn(component, 'myPeer', 'get').mockReturnValue({ reConnectPass: '' } as PeerCursor);
      const clean = vi.spyOn(component, 'deleteObject').mockImplementation(() => undefined);
      const roomJoin = TestBed.inject(RoomJoinService);
      const join = vi.spyOn(roomJoin, 'joinServerRoom').mockResolvedValue(false);
      const find = vi
        .spyOn(roomJoin, 'findServerRoom')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'Ab3', name: '月夜の卓', roomKey: 'k' } as IRoomInfo);
      component.roomId = 'Ab3';
      component.roomName = '月夜の卓';
      component.forceCleanup.set(true);
      vi.spyOn(component, 'disConnect').mockImplementation(() => undefined);

      component.reConnect();
      await vi.waitFor(() => expect(find).toHaveBeenCalledOnce());
      await Promise.resolve();
      expect(clean).not.toHaveBeenCalled();
      expect(join).not.toHaveBeenCalled();

      component.reConnect();
      await vi.waitFor(() => expect(join).toHaveBeenCalled());
      expect(clean).toHaveBeenCalledOnce();
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

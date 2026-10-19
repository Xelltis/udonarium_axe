import { TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import {
  roomDeletionMessageKey,
  RoomDeletionOutcome,
  RoomDeletionService,
} from '@axe/application/lobby/room-deletion.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/index';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('RoomDeletionService', () => {
  const room = { roomKey: 'k'.repeat(32), name: '月夜の卓', id: 'Ab3' };
  let service: RoomDeletionService;
  let ask: MockInstance<ConfirmService['ask']>;
  let deleteRoom: MockInstance<(roomKey: string) => Promise<void>>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(RoomDeletionService);
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    deleteRoom = vi.spyOn(Network, 'deleteRoom').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks first, as something that cannot be undone, and deletes nothing when the reader says no', async () => {
    const t = TestBed.inject(TRANSLATE_FN);
    ask.mockResolvedValue(false);

    expect(await service.delete(room)).toBe('cancelled');

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ title: t('feature.lobby.deleteRoom.confirmTitle'), danger: true })
    );
    expect(deleteRoom).not.toHaveBeenCalled();
  });

  it('names the room it asks about', async () => {
    const t = TestBed.inject(TRANSLATE_FN);

    await service.delete(room);

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ message: t('feature.lobby.deleteRoom.confirmMessage', { name: '月夜の卓/Ab3' }) })
    );
  });

  it('deletes the room by its key once the reader agrees', async () => {
    expect(await service.delete(room)).toBe('deleted');

    expect(deleteRoom).toHaveBeenCalledWith(room.roomKey);
  });

  it('tells apart a room already gone, a reader who is no GM of it, and any other failure', async () => {
    const outcomes: RoomDeletionOutcome[] = [];
    for (const failure of [
      new ServerRoomApiError(404, 'room-not-found'),
      new ServerRoomApiError(403, 'not-game-master'),
      new ServerRoomApiError(0, 'no-backend'),
      new Error('offline'),
    ]) {
      deleteRoom.mockRejectedValueOnce(failure);
      outcomes.push(await service.delete(room));
    }

    expect(outcomes).toEqual(['gone', 'not-game-master', 'failed', 'failed']);
  });

  it('has something to say for every outcome but a change of mind', () => {
    const outcomes: RoomDeletionOutcome[] = ['deleted', 'gone', 'not-game-master', 'failed', 'cancelled'];

    expect(outcomes.map(roomDeletionMessageKey)).toEqual([
      'feature.lobby.deleteRoom.deleted',
      'feature.lobby.deleteRoom.gone',
      'feature.lobby.deleteRoom.notGameMaster',
      'feature.lobby.deleteRoom.failed',
      null,
    ]);
  });
});

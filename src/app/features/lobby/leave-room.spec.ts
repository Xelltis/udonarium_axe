import { leaveRoomByReloading } from '@axe/features/lobby/leave-room';

describe('leaveRoomByReloading', () => {
  it('drops the invitation from the address before loading the page afresh, so it does not go back in', () => {
    const calls: string[] = [];
    const win = {
      location: { pathname: '/axe/', search: '?lang=ja', reload: () => calls.push('reload') },
      history: { replaceState: (_state: unknown, _title: string, url: string) => calls.push(`replace ${url}`) },
    } as unknown as Window;

    leaveRoomByReloading(win);

    expect(calls).toEqual(['replace /axe/?lang=ja', 'reload']);
  });
});

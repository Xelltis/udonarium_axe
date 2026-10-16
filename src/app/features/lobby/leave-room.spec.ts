import { Network } from '@axe/core/network/network';
import { leaveRoomByReloading } from '@axe/features/lobby/leave-room';

describe('leaveRoomByReloading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets the page go unasked and drops the invitation from the address before loading afresh', () => {
    const calls: string[] = [];
    vi.spyOn(Network, 'letPageGo').mockImplementation(() => calls.push('let go'));
    const win = {
      location: { pathname: '/axe/', search: '?lang=ja', reload: () => calls.push('reload') },
      history: { replaceState: (_state: unknown, _title: string, url: string) => calls.push(`replace ${url}`) },
    } as unknown as Window;

    leaveRoomByReloading(win);

    expect(calls).toEqual(['let go', 'replace /axe/?lang=ja', 'reload']);
  });
});

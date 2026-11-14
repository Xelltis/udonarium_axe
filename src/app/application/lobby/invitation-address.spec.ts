import { dropInvitationFromAddress } from '@axe/application/lobby/invitation-address';

describe('dropInvitationFromAddress', () => {
  afterEach(() => {
    history.replaceState(null, '', '/');
  });

  it('takes the invitation off the address and keeps the path and the query', () => {
    history.replaceState(null, '', '/axe/?lang=ja#join?r=a1b&n=room');

    dropInvitationFromAddress();

    expect(location.pathname + location.search + location.hash).toBe('/axe/?lang=ja');
  });

  it('writes on the window it is given', () => {
    const replaceState = vi.fn();
    const win = { location: { pathname: '/axe/', search: '?stats=1' }, history: { replaceState } };

    dropInvitationFromAddress(win as unknown as Window);

    expect(replaceState).toHaveBeenCalledWith(null, '', '/axe/?stats=1');
  });
});

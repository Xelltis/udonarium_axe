import { TestBed } from '@angular/core/testing';
import { NetworkReachService } from '@axe/features/lobby/network-reach.service';

describe('NetworkReachService', () => {
  let reach: NetworkReachService;

  beforeEach(() => {
    reach = TestBed.inject(NetworkReachService);
  });

  it('starts out not given up on', () => {
    expect(reach.unreachable()).toBe(false);
  });

  it('says the network cannot be reached once the retries have run out', () => {
    reach.giveUp();

    expect(reach.unreachable()).toBe(true);
  });

  it('takes that back once a connection opens', () => {
    reach.giveUp();

    reach.reached();

    expect(reach.unreachable()).toBe(false);
  });
});

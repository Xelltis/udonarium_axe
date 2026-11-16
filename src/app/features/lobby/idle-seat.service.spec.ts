import { TestBed } from '@angular/core/testing';
import { Network } from '@axe/core/network/network';
import { IdleSeatService } from '@axe/features/lobby/idle-seat.service';

describe('IdleSeatService', () => {
  let idleSeat: IdleSeatService;
  let comeBack: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    idleSeat = TestBed.inject(IdleSeatService);
    comeBack = vi.spyOn(Network, 'comeBackFromIdle').mockImplementation(() => undefined as never);
  });

  afterEach(() => vi.restoreAllMocks());

  it('starts with the seat in its room', () => {
    expect(idleSeat.leftAlone()).toBe(false);
  });

  it('takes the seat as let out once told so', () => {
    idleSeat.markLeft();

    expect(idleSeat.leftAlone()).toBe(true);
    expect(comeBack).not.toHaveBeenCalled();
  });

  it('takes a seat let out back into its room, once', () => {
    idleSeat.markLeft();

    idleSeat.comeBack();
    idleSeat.comeBack();

    expect(idleSeat.leftAlone()).toBe(false);
    expect(comeBack).toHaveBeenCalledOnce();
  });

  it('asks nothing of the network for a seat that never left', () => {
    idleSeat.comeBack();

    expect(comeBack).not.toHaveBeenCalled();
  });
});

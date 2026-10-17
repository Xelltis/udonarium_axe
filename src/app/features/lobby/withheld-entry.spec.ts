import { TestBed } from '@angular/core/testing';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { isTableWithheld, markLoadedWithheld, markSeatWithheld } from '@axe/domain/peer/withheld-table';
import { WithheldEntryService } from '@axe/features/lobby/withheld-entry';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('WithheldEntryService', () => {
  let service: WithheldEntryService;
  let ask: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(WithheldEntryService);
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
  });

  afterEach(() => {
    markLoadedWithheld(false, false);
    vi.restoreAllMocks();
  });

  it('lets a whole table into any room without asking', async () => {
    expect(await service.mayEnter('room-a')).toBe(true);
    expect(await service.mayEnter(null)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });

  it('keeps a table with withheld parts out of another room unless the reader says to go in', async () => {
    markSeatWithheld(true, 'room-a');

    expect(await service.mayEnter('room-b')).toBe(false);
    ask.mockResolvedValue(true);
    expect(await service.mayEnter(null)).toBe(true);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[0][0]).toMatchObject({ danger: true });
  });

  it('keeps the table marked once taken in, even as the GM of the room it went into', async () => {
    markSeatWithheld(true, 'room-a');
    ask.mockResolvedValue(true);

    await service.mayEnter('room-b');
    markSeatWithheld(true, 'room-b');
    markSeatWithheld(false, 'room-b');

    expect(isTableWithheld()).toBe(true);
  });

  it('lets it back into the room it was withheld in without asking', async () => {
    markSeatWithheld(true, 'room-a');

    expect(await service.mayEnter('room-a')).toBe(true);
    expect(ask).not.toHaveBeenCalled();
  });
});

import { TestBed } from '@angular/core/testing';
import { ReportService } from '@axe/application/moderation/report.service';
import { Network } from '@axe/core/network/network';
import { MAX_REPORT_REASON_LENGTH } from '@axe/core/network/server/server-protocol';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReportService', () => {
  const assetId = 'a'.repeat(64);
  let service: ReportService;
  let report: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ReportService);
    report = vi.spyOn(AssetHttpStore.instance, 'report').mockResolvedValue({ id: 'report-1' });
  });

  afterEach(() => vi.restoreAllMocks());

  it('lets a seat report only in a room on a room server, whatever its role', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
    const enabled = vi.spyOn(AssetHttpStore.instance, 'isEnabled', 'get').mockReturnValue(true);
    expect(TestBed.inject(ReportService).canReport()).toBe(true);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    enabled.mockReturnValue(false);
    expect(TestBed.inject(ReportService).canReport()).toBe(false);
  });

  it('reports nothing among peers, where there is no operator to tell', () => {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('skyway');
    vi.spyOn(AssetHttpStore.instance, 'isEnabled', 'get').mockReturnValue(true);

    expect(service.canReport()).toBe(false);
  });

  it('sends a picture’s report with its hash and the reason trimmed, and the room’s without a picture', async () => {
    expect(await service.send({ target: 'asset', assetId, name: 'dragon.png' }, '  無断転載です \n')).toEqual({
      id: 'report-1',
    });
    await service.send({ target: 'room', name: '卓' }, '荒らしがいます');

    expect(report.mock.calls).toEqual([
      [{ target: 'asset', assetId, reason: '無断転載です' }],
      [{ target: 'room', reason: '荒らしがいます' }],
    ]);
  });

  it('refuses before sending a reason that is empty or too long, or a picture not named by its hash', async () => {
    expect(await service.send({ target: 'room', name: '卓' }, '   ')).toBe('refused');
    expect(await service.send({ target: 'room', name: '卓' }, 'a'.repeat(MAX_REPORT_REASON_LENGTH + 1))).toBe(
      'refused'
    );
    expect(await service.send({ target: 'asset', assetId: 'none_icon', name: '同梱' }, '理由')).toBe('refused');
    expect(await service.send({ target: 'asset', name: '名前だけ' }, '理由')).toBe('refused');

    expect(report).not.toHaveBeenCalled();
  });
});

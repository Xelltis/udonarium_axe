import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportService, ReportSubject } from '@axe/application/moderation/report.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ReportResult } from '@axe/core/storage/asset-http-store';
import { ReportDialogComponent } from '@axe/features/moderation/report-dialog/report-dialog.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ReportDialogComponent', () => {
  let fixture: ComponentFixture<ReportDialogComponent>;
  let modalService: ModalService;
  let send: ReturnType<typeof vi.fn<(subject: ReportSubject, reason: string) => Promise<ReportResult>>>;

  async function open(subject: ReportSubject): Promise<HTMLElement> {
    modalService = TestBed.inject(ModalService);
    (modalService as unknown as Record<string, unknown>).modalContext = { option: subject };
    fixture = TestBed.createComponent(ReportDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const byTestId = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  async function write(host: HTMLElement, reason: string): Promise<void> {
    const box = byTestId(host, 'report-reason') as HTMLTextAreaElement;
    box.value = reason;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    send = vi.fn(async () => ({ id: 'report-1' }) as ReportResult);
    TestBed.configureTestingModule({
      imports: [ReportDialogComponent],
      providers: [...TEST_PROVIDERS, { provide: ReportService, useValue: { send } }],
    });
  });

  it('names what is reported, and sends nothing until a reason is written', async () => {
    const host = await open({ target: 'asset', assetId: 'a'.repeat(64), name: 'dragon.png' });

    expect(host.textContent).toContain('「dragon.png」を、部屋のサーバーの運営者に通報します。');
    expect((byTestId(host, 'report-send') as HTMLButtonElement).disabled).toBe(true);
    await write(host, '   ');
    expect((byTestId(host, 'report-send') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the reason and shows the id it was taken under, which closing hands back', async () => {
    const subject: ReportSubject = { target: 'room', name: '卓' };
    const host = await open(subject);
    const resolve = vi.spyOn(modalService, 'resolve').mockImplementation(() => {});
    await write(host, '荒らしがいます');

    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(send).toHaveBeenCalledWith(subject, '荒らしがいます');
    expect(byTestId(host, 'report-taken')!.textContent).toContain('report-1');
    (byTestId(host, 'report-taken')!.querySelector('button') as HTMLButtonElement).click();
    expect(resolve).toHaveBeenCalledWith('report-1');
  });

  it.each([
    ['unsupported', 'この部屋のサーバーは通報を受け付けていません'],
    ['rate-limited', '通報が多すぎます'],
    ['failed', '通報を送れませんでした'],
  ] as const)('says why a report did not go for %s, leaving the reason to send again', async (result, words) => {
    send.mockResolvedValue(result);
    const host = await open({ target: 'room', name: '卓' });
    await write(host, '荒らしがいます');

    host.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId(host, 'report-trouble')!.textContent).toContain(words);
    expect((byTestId(host, 'report-reason') as HTMLTextAreaElement).value).toBe('荒らしがいます');
  });

  it('closes with nothing sent when the reader thinks better of it', async () => {
    const host = await open({ target: 'room', name: '卓' });
    const resolve = vi.spyOn(modalService, 'resolve').mockImplementation(() => {});

    (host.querySelector('button[type="button"]') as HTMLButtonElement).click();

    expect(resolve).toHaveBeenCalledWith(null);
    expect(send).not.toHaveBeenCalled();
  });
});

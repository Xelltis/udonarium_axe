import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DeferBlockBehavior, DeferBlockState, TestBed } from '@angular/core/testing';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ReloadNoticeDirective } from '@axe/ui/directives/reload-notice.directive';

@Component({
  selector: 'reload-notice-test-host',
  template: `
    @defer (on immediate) {
      <span data-testid="arrived"></span>
    } @error {
      <ng-container appReloadNotice />
    }
  `,
  imports: [ReloadNoticeDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ReloadNoticeHostComponent {}

describe('ReloadNoticeDirective', () => {
  let tellReloadNeeded: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tellReloadNeeded = vi.fn();
    TestBed.configureTestingModule({
      imports: [ReloadNoticeHostComponent],
      providers: [...TEST_PROVIDERS, { provide: ReloadNoticeService, useValue: { tellReloadNeeded } }],
      deferBlockBehavior: DeferBlockBehavior.Manual,
    });
  });

  async function deferredViewEndsUp(state: DeferBlockState): Promise<void> {
    const fixture = TestBed.createComponent(ReloadNoticeHostComponent);
    fixture.detectChanges();
    const [block] = await fixture.getDeferBlocks();
    await block.render(state);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('asks the reader to reload when the deferred view cannot be fetched', async () => {
    await deferredViewEndsUp(DeferBlockState.Error);

    expect(tellReloadNeeded).toHaveBeenCalledTimes(1);
  });

  it('asks nothing when the deferred view arrives', async () => {
    await deferredViewEndsUp(DeferBlockState.Complete);

    expect(tellReloadNeeded).not.toHaveBeenCalled();
  });
});

import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { VirtualListComponent } from '@axe/ui/components/virtual-list/virtual-list.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VirtualListComponent],
  template: `
    <ui-virtual-list [items]="items()" [trackBy]="key" [estimate]="20" [overscan]="100">
      <ng-template #row let-item>
        <div class="row">{{ item }}</div>
      </ng-template>
    </ui-virtual-list>
  `,
})
class HostComponent {
  readonly items = signal(Array.from({ length: 200 }, (_, index) => index));
  readonly key = (item: number): number => item;
}

class FakeResizeObserver {
  static latest: FakeResizeObserver | null = null;
  readonly watched = new Set<Element>();

  constructor(readonly report: (entries: { target: Element }[]) => void) {
    FakeResizeObserver.latest = this;
  }

  observe(element: Element): void {
    this.watched.add(element);
  }

  unobserve(element: Element): void {
    this.watched.delete(element);
  }

  disconnect(): void {
    this.watched.clear();
  }
}

describe('VirtualListComponent', () => {
  const borrowed = new BorrowedGlobals();
  let fixture: ComponentFixture<HostComponent>;

  const list = () => fixture.nativeElement.querySelector('ui-virtual-list') as HTMLElement;
  const cells = () => [...fixture.nativeElement.querySelectorAll('[role="listitem"]')] as HTMLElement[];
  const observer = () => FakeResizeObserver.latest!;
  const total = () => parseFloat((fixture.nativeElement.querySelector('[role="list"]') as HTMLElement).style.height);

  beforeEach(async () => {
    vi.useFakeTimers();
    borrowed.lend('ResizeObserver', FakeResizeObserver);
    await TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    borrowed.giveBack();
    vi.useRealTimers();
  });

  async function scrollTo(top: number): Promise<void> {
    list().scrollTop = top;
    list().dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(50);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('watches the rows it draws for their height, and no others', async () => {
    const drawn = cells();

    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.length).toBeLessThan(200);
    for (const cell of drawn) expect(observer().watched.has(cell)).toBe(true);
  });

  it('stops watching the rows it no longer draws once scrolled past them', async () => {
    const first = cells()[0];

    await scrollTo(3000);

    expect(cells()).not.toContain(first);
    expect(observer().watched.has(first)).toBe(false);
    expect([...observer().watched].filter((element) => element !== list())).toHaveLength(cells().length);
  });

  it('takes no height from a row that has left the page', async () => {
    const first = cells()[0];
    const before = total();
    await scrollTo(3000);

    observer().report([{ target: first }]);
    fixture.detectChanges();

    expect(total()).toBe(before);
  });
});

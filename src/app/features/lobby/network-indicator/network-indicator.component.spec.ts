import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EventChannel } from '@axe/core/event/event-channel';
import { Network } from '@axe/core/index';
import { NetworkIndicatorComponent } from '@axe/features/lobby/network-indicator/network-indicator.component';

describe('NetworkIndicatorComponent', () => {
  let component: NetworkIndicatorComponent;
  let fixture: ComponentFixture<NetworkIndicatorComponent>;
  let activity: EventChannel<void>;

  beforeEach(async () => {
    activity = new EventChannel<void>();
    TestBed.configureTestingModule({
      imports: [NetworkIndicatorComponent],
      providers: [{ provide: ObjectChangeService, useValue: { eventActivity$: activity } }],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NetworkIndicatorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('comes out while the traffic runs heavy, and goes again once it has quieted', () => {
    vi.useFakeTimers();
    try {
      const bandwidth = vi.spyOn(Network, 'bandwidthUsage', 'get').mockReturnValue(1024);
      fixture.detectChanges();
      TestBed.tick();
      const host = fixture.nativeElement as HTMLElement;

      activity.emit();
      expect(host.style.display).toBe('');

      bandwidth.mockReturnValue(4 * 1024);
      activity.emit();
      expect(host.style.display).toBe('block');

      vi.advanceTimersByTime(650);
      expect(host.style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  describe('tearing down', () => {
    it('clears the timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { timer: ReturnType<typeof setTimeout> | null };
      priv.timer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(priv.timer).toBeNull();
    });
  });
});

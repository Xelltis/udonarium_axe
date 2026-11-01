import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MotionService } from '@axe/application/ui/motion.service';
import { sceneFade$ } from '@axe/core/event/domain-events';
import { SCENE_FADE } from '@axe/domain/scene/board-scene-parts';
import { SceneFadeOverlayComponent } from '@axe/features/tabletop/scene-fade-overlay/scene-fade-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('SceneFadeOverlayComponent', () => {
  let fixture: ComponentFixture<SceneFadeOverlayComponent>;

  const dark = () =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[data-testid="scene-fade"]')!.style.opacity;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    TestBed.configureTestingModule({ imports: [SceneFadeOverlayComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('darkens the table as a scene changes, and lights it again after', () => {
    TestBed.inject(MotionService).set('on');
    fixture = TestBed.createComponent(SceneFadeOverlayComponent);
    fixture.detectChanges();
    expect(dark()).toBe('0');

    sceneFade$.emit();
    fixture.detectChanges();
    expect(dark()).toBe('1');

    vi.advanceTimersByTime(SCENE_FADE.inMs + SCENE_FADE.holdMs);
    fixture.detectChanges();
    expect(dark()).toBe('0');
  });

  it('stays light on a screen kept still', () => {
    TestBed.inject(MotionService).set('off');
    fixture = TestBed.createComponent(SceneFadeOverlayComponent);
    fixture.detectChanges();

    sceneFade$.emit();
    fixture.detectChanges();

    expect(dark()).toBe('0');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { DEFAULT_GAME_CLOCK } from '@axe/domain/game-clock/game-clock';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameClockWidgetComponent } from '@axe/features/widgets/game-clock/game-clock-widget.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameClockWidgetComponent', () => {
  let fixture: ComponentFixture<GameClockWidgetComponent>;

  function open(role: PeerRole): HTMLElement {
    PeerCursor.myCursor.role = role;
    fixture = TestBed.createComponent(GameClockWidgetComponent);
    TestBed.inject(WidgetVisibilityService).gameClock.set(true);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (root: HTMLElement, testId: string) =>
    root.querySelector(`[data-testid="${testId}"]`)?.textContent?.trim() ?? '';

  beforeEach(() => {
    localStorage.clear();
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [GameClockWidgetComponent], providers: [...TEST_PROVIDERS] });
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
  });

  afterEach(() => {
    fixture?.destroy();
    Config.instance.gameClock = DEFAULT_GAME_CLOCK;
    vi.restoreAllMocks();
  });

  it('shows the day and the part of it to everyone, and the means to move it to the master alone', () => {
    const root = open(PeerRole.Player);

    expect(text(root, 'game-clock-day')).toBe('1日目');
    expect(text(root, 'game-clock-time')).toBe('朝');
    expect(root.querySelector('[data-testid="game-clock-on"]')).toBeNull();
    expect(root.querySelector('[data-testid="game-clock-settings"]')).toBeNull();
  });

  it('lets the master step the time on and back', () => {
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-on"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-on"]')!.click();
    fixture.detectChanges();
    expect(text(root, 'game-clock-time')).toBe('夕');

    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-back"]')!.click();
    fixture.detectChanges();
    expect(text(root, 'game-clock-time')).toBe('昼');
  });

  it('opens the set-up below for the master, and tells the hour on a clock once asked', () => {
    const root = open(PeerRole.GameMaster);

    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-settings"]')!.click();
    fixture.detectChanges();
    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-mode-hours"]')!.click();
    fixture.detectChanges();
    const time = root.querySelector<HTMLInputElement>('[data-testid="game-clock-time-input"]')!;
    time.value = '21:15';
    time.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(text(root, 'game-clock-time')).toBe('21:15');
    expect(root.querySelector('[data-testid="game-clock-periods"]')).toBeNull();
  });

  it('hides itself for this seat alone', () => {
    const root = open(PeerRole.Player);

    root.querySelector<HTMLButtonElement>('[aria-label="ゲーム内時間を隠す"]')!.click();
    fixture.detectChanges();

    expect(TestBed.inject(WidgetVisibilityService).gameClock()).toBe(false);
    expect(root.querySelector('[data-testid="game-clock"]')).toBeNull();
  });
});

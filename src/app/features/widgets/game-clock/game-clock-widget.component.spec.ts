import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { MotionService } from '@axe/application/ui/motion.service';
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

  it('picks the last part of the day in the set-up for a clock that stands past the parts there are now', async () => {
    Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, period: 5 };
    const root = open(PeerRole.GameMaster);
    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-settings"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text(root, 'game-clock-time')).toBe('夜');
    expect(root.querySelector<HTMLSelectElement>('[data-testid="game-clock-period"]')!.selectedIndex).toBe(3);
  });

  it('shows in each field what the clock keeps, where it kept to its bounds or tidied what was written', () => {
    const root = open(PeerRole.GameMaster);
    root.querySelector<HTMLButtonElement>('[data-testid="game-clock-settings"]')!.click();
    fixture.detectChanges();
    const change = (testId: string, value: string) => {
      const field = root.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`)!;
      field.value = value;
      field.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      return field.value;
    };

    expect(change('game-clock-day-input', '0')).toBe('1');
    expect(change('game-clock-day-input', '37')).toBe('37');
    expect(change('game-clock-day-input', '')).toBe('37');
    expect(change('game-clock-periods', '')).toBe('');
    expect(change('game-clock-periods', ' , ,')).toBe('');
    expect(change('game-clock-day-format', '  ')).toBe('');
  });

  describe('the sun and the moon moving on', () => {
    /** Where a body stands, read off the transform it is drawn with. */
    function placeOf(root: HTMLElement, body: 'sun' | 'moon'): { x: number; y: number } {
      const drawn = root.querySelector<SVGGElement>(`[data-testid="game-clock-${body}"]`)!.style.transform;
      const [x, y] = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(drawn)!.slice(1).map(Number);
      return { x, y };
    }

    /** How far a point lies off the arc the bodies go round, 0 on it. */
    const offArc = ({ x, y }: { x: number; y: number }) => Math.abs(((x - 120) / 100) ** 2 + ((y - 62) / 50) ** 2 - 1);

    /** The places a body passes through, frame by frame, as the clock is stepped on once. */
    async function framesStepping(root: HTMLElement, body: 'sun' | 'moon'): Promise<{ x: number; y: number }[]> {
      root.querySelector<HTMLButtonElement>('[data-testid="game-clock-on"]')!.click();
      const places: { x: number; y: number }[] = [];
      for (let frame = 0; frame < 60; frame++) {
        await vi.advanceTimersByTimeAsync(16);
        fixture.detectChanges();
        places.push(placeOf(root, body));
      }
      return places;
    }

    beforeEach(() => vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout'] }));
    afterEach(() => vi.useRealTimers());

    it('goes along its arc from noon to evening, westward all the way', async () => {
      Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, period: 1 };
      const root = open(PeerRole.GameMaster);

      const places = await framesStepping(root, 'sun');

      expect(places.every((place) => offArc(place) < 0.001)).toBe(true);
      expect(places.some((place) => place.x > 25 && place.x < 115)).toBe(true);
      expect(places.every((place, index) => index === 0 || place.x <= places[index - 1].x)).toBe(true);
      expect(places.at(-1)!.x).toBeCloseTo(20);
    });

    it('goes there at once for a seat that keeps the screen still', () => {
      TestBed.inject(MotionService).set('off');
      Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, period: 1 };
      const root = open(PeerRole.GameMaster);

      root.querySelector<HTMLButtonElement>('[data-testid="game-clock-on"]')!.click();
      fixture.detectChanges();

      expect(placeOf(root, 'sun').x).toBeCloseTo(20);
    });

    it('crosses the sky from east to west on a day of two parts, rather than along the horizon', async () => {
      Config.instance.gameClock = { ...DEFAULT_GAME_CLOCK, periods: ['昼', '夜'] };
      const root = open(PeerRole.GameMaster);

      const places = await framesStepping(root, 'sun');

      expect(places.every((place) => offArc(place) < 0.001)).toBe(true);
      expect(places.every((place, index) => index === 0 || place.x <= places[index - 1].x)).toBe(true);
      expect(places.some((place) => place.y < 20)).toBe(true);
    });
  });

  it('hides itself for this seat alone', () => {
    const root = open(PeerRole.Player);

    root.querySelector<HTMLButtonElement>('[aria-label="ゲーム内時間を隠す"]')!.click();
    fixture.detectChanges();

    expect(TestBed.inject(WidgetVisibilityService).gameClock()).toBe(false);
    expect(root.querySelector('[data-testid="game-clock"]')).toBeNull();
  });
});

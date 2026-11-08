import { dismissLoadingScreen, showLoadingStage } from '@axe/infrastructure/ui/loading-screen';

describe('the loading screen the page opens with', () => {
  let screen: HTMLElement;

  beforeEach(() => {
    screen = document.createElement('div');
    screen.id = 'app-loading';
    screen.innerHTML =
      '<div class="app-loading-fill"></div><div class="app-loading-percent"></div><div class="app-loading-stage"></div>';
    document.body.appendChild(screen);
  });

  afterEach(() => {
    screen.remove();
    vi.useRealTimers();
  });

  it('fills its bar to the share given and says what is being done', () => {
    showLoadingStage(0.35, '卓の描画を準備しています…');

    expect(screen.querySelector<HTMLElement>('.app-loading-fill')!.style.width).toBe('35%');
    expect(screen.querySelector('.app-loading-percent')!.textContent).toBe('35%');
    expect(screen.querySelector('.app-loading-stage')!.textContent).toBe('卓の描画を準備しています…');
    expect(screen.getAttribute('aria-valuenow')).toBe('35');
  });

  it('fills the bar, fades and is taken away once dismissed, even where the fade is never seen to end', () => {
    vi.useFakeTimers();

    dismissLoadingScreen();
    expect(screen.classList.contains('is-done')).toBe(true);
    expect(screen.querySelector<HTMLElement>('.app-loading-fill')!.style.width).toBe('100%');
    expect(screen.querySelector('.app-loading-percent')!.textContent).toBe('100%');
    expect(screen.isConnected).toBe(true);

    vi.advanceTimersByTime(600);
    expect(screen.isConnected).toBe(false);
  });

  it('does nothing on a page with no loading screen, as once it is gone', () => {
    screen.remove();

    expect(() => showLoadingStage(0.5, 'x')).not.toThrow();
    expect(() => dismissLoadingScreen()).not.toThrow();
  });
});

/** The loading screen the page opens with, laid out in index.html, which the app moves on and takes away. */
const SCREEN_ID = 'app-loading';

/** How long the screen takes to fade, past which it is taken away whether or not the fade was seen to end. */
const FADE_MS = 600;

/** Fills the bar to a percentage and says it on the badge beside it. */
function fillBar(screen: HTMLElement, percent: number): void {
  const fill = screen.querySelector<HTMLElement>('.app-loading-fill');
  if (fill) fill.style.width = `${percent}%`;
  const badge = screen.querySelector('.app-loading-percent');
  if (badge) badge.textContent = `${percent}%`;
}

/**
 * Fills the loading screen's bar to a share of the whole, from 0 to 1, and says what is being done.
 * Does nothing where the page has no loading screen, as once it is gone.
 */
export function showLoadingStage(share: number, words: string): void {
  const screen = document.getElementById(SCREEN_ID);
  if (!screen) return;
  const percent = Math.round(Math.min(1, Math.max(0, share)) * 100);
  fillBar(screen, percent);
  const stage = screen.querySelector('.app-loading-stage');
  if (stage) stage.textContent = words;
  screen.setAttribute('aria-valuenow', String(percent));
  screen.setAttribute('aria-label', words);
}

/** Fills the loading screen's bar, fades the screen out and takes it away. */
export function dismissLoadingScreen(): void {
  const screen = document.getElementById(SCREEN_ID);
  if (!screen || screen.classList.contains('is-done')) return;
  fillBar(screen, 100);
  screen.setAttribute('aria-valuenow', '100');
  screen.classList.add('is-done');
  const remove = () => screen.remove();
  screen.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, FADE_MS);
}

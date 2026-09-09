import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';

export type Theme = 'auto' | 'dark' | 'light';

const STORAGE_KEY = 'ui-theme';
const THEME_ORDER: Theme[] = ['auto', 'dark', 'light'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly theme = signal<Theme>((localStorage.getItem(STORAGE_KEY) as Theme) ?? 'auto');

  private readonly systemPrefersDark = signal(window.matchMedia('(prefers-color-scheme: dark)').matches);

  /** The theme actually on screen, with 'auto' settled against what the system asks for. */
  readonly resolved = computed<Exclude<Theme, 'auto'>>(() => {
    const theme = this.theme();
    if (theme !== 'auto') return theme;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => this.systemPrefersDark.set(e.matches);
    mql.addEventListener('change', listener);
    this.destroyRef.onDestroy(() => mql.removeEventListener('change', listener));

    AttachedDocuments.begin(this.document);
    const stopWatching = AttachedDocuments.onChange((documents) => this.dress(documents));
    this.destroyRef.onDestroy(stopWatching);

    effect(() => {
      const t = this.theme();
      this.resolved();
      this.dress(AttachedDocuments.all());
      localStorage.setItem(STORAGE_KEY, t);
    });
  }

  /** A window that opened after the theme was settled still has to be dressed in it. */
  private dress(documents: readonly Document[]): void {
    const theme = this.theme();
    const resolved = this.resolved();
    for (const document of documents) {
      const html = document.documentElement;
      if (theme === 'auto') html.removeAttribute('data-theme');
      else html.setAttribute('data-theme', theme);
      html.classList.toggle('theme-light', resolved === 'light');
      html.classList.toggle('theme-dark', resolved === 'dark');
    }
  }

  cycle() {
    const idx = THEME_ORDER.indexOf(this.theme());
    this.theme.set(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }
}

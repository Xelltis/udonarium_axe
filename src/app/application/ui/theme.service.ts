import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { readLocal, writeLocal } from '@axe/core/storage/local-preference';
import { STORAGE_KEYS } from '@axe/core/storage/storage-keys';
import { AttachedDocuments } from '@axe/domain/ui/attached-documents';

export type Theme = 'auto' | 'dark' | 'light';

const THEME_ORDER: Theme[] = ['auto', 'dark', 'light'];

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  readonly theme = signal<Theme>((readLocal(STORAGE_KEYS.theme) as Theme) ?? 'auto');

  private readonly systemPrefersDark = signal(
    this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches ?? false
  );

  /** The theme actually on screen, with 'auto' settled against what the system asks for. */
  readonly resolved = computed<Exclude<Theme, 'auto'>>(() => {
    const theme = this.theme();
    if (theme !== 'auto') return theme;
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    const mql = this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)');
    if (mql) {
      const listener = (e: MediaQueryListEvent) => this.systemPrefersDark.set(e.matches);
      mql.addEventListener('change', listener);
      this.destroyRef.onDestroy(() => mql.removeEventListener('change', listener));
    }

    AttachedDocuments.begin(this.document);
    const stopWatching = AttachedDocuments.onChange((documents) => this.dress(documents));
    this.destroyRef.onDestroy(stopWatching);

    effect(() => {
      const t = this.theme();
      this.resolved();
      this.dress(AttachedDocuments.all());
      writeLocal(STORAGE_KEYS.theme, t);
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

  /** A colour of the theme on screen, as the page names its custom property, or the colour given where it cannot be read. */
  cssColor(property: string, otherwise: string): string {
    const view = this.document.defaultView;
    if (typeof view?.getComputedStyle !== 'function') return otherwise;
    const colour = view.getComputedStyle(this.document.documentElement).getPropertyValue(property).trim();
    return colour || otherwise;
  }

  /** Moves the theme on through auto, dark and light. The choice is written to localStorage. */
  cycle() {
    const idx = THEME_ORDER.indexOf(this.theme());
    this.theme.set(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }
}

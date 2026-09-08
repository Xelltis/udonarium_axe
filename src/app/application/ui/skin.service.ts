import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { ThemeService } from '@axe/application/ui/theme.service';
import { resetChatBubbleBaseTone, setChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { asRecipe, asSkinId, CUSTOM_SKIN, parseRecipe, skinById, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { panelTone, SkinMode, SkinRecipe, SkinTokens, skinTokens } from '@axe/domain/ui/skin-palette';

const SKIN_KEY: Record<SkinMode, string> = { light: 'ui-skin-light', dark: 'ui-skin-dark' };
const RECIPE_KEY: Record<SkinMode, string> = { light: 'ui-skin-recipe-light', dark: 'ui-skin-recipe-dark' };

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // a browser that refuses to remember still shows the skin for this sitting
  }
}

/**
 * Which colours the seat is dressed in.
 *
 * A skin belongs to this screen, not to the room: the people at a table may be sitting in
 * different rooms and different light, and none of them should be able to repaint anyone
 * else's screen. It is kept beside the light/dark choice rather than inside it — a skin is
 * picked for each side of that switch, so `auto` goes on following the system and lands on
 * whichever skin was chosen for where it landed.
 */
@Injectable({ providedIn: 'root' })
export class SkinService {
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);

  private readonly chosen: Record<SkinMode, ReturnType<typeof signal<string>>> = {
    light: signal(asSkinId(read(SKIN_KEY.light), 'light')),
    dark: signal(asSkinId(read(SKIN_KEY.dark), 'dark')),
  };

  private readonly recipes: Record<SkinMode, ReturnType<typeof signal<SkinRecipe>>> = {
    light: signal(parseRecipe(read(RECIPE_KEY.light), 'light')),
    dark: signal(parseRecipe(read(RECIPE_KEY.dark), 'dark')),
  };

  /** Which ladder is on screen, settled the same way the light/dark switch settles it. */
  readonly mode = computed<SkinMode>(() => this.theme.resolved());

  /** The skin on screen now. */
  readonly current = computed(() => this.chosen[this.mode()]());

  /** What the sliders are holding for the ladder on screen. */
  readonly recipe = computed(() => this.recipes[this.mode()]());

  /** The colours to paint, or nothing at all where the stylesheet already says them. */
  readonly tokens = computed<SkinTokens | null>(() => {
    const mode = this.mode();
    const id = this.chosen[mode]();
    if (id === STANDARD_SKIN) return null;
    if (id === CUSTOM_SKIN) return skinTokens(this.recipes[mode](), mode);
    const skin = skinById(id, mode);
    return skin?.recipe ? skinTokens(skin.recipe, mode) : null;
  });

  private painted: string[] = [];

  constructor() {
    effect(() => this.paint(this.tokens(), this.mode()));
  }

  skinOf(mode: SkinMode): string {
    return this.chosen[mode]();
  }

  recipeOf(mode: SkinMode): SkinRecipe {
    return this.recipes[mode]();
  }

  choose(id: string, mode: SkinMode = this.mode()): void {
    const settled = asSkinId(id, mode);
    this.chosen[mode].set(settled);
    write(SKIN_KEY[mode], settled);
  }

  /** Hands the sliders' numbers to the skin a person is building, and switches to it. */
  build(recipe: SkinRecipe, mode: SkinMode = this.mode()): void {
    const settled = asRecipe(recipe, mode);
    this.recipes[mode].set(settled);
    write(RECIPE_KEY[mode], JSON.stringify(settled));
    this.choose(CUSTOM_SKIN, mode);
  }

  /** The colours a skin would paint, for the swatches in the picker. */
  preview(id: string, mode: SkinMode): SkinTokens | null {
    if (id === CUSTOM_SKIN) return skinTokens(this.recipes[mode](), mode);
    const skin = skinById(id, mode);
    return skin?.recipe ? skinTokens(skin.recipe, mode) : null;
  }

  private paint(tokens: SkinTokens | null, mode: SkinMode): void {
    const style = this.document.documentElement.style;
    for (const name of this.painted) style.removeProperty(name);
    this.painted = [];

    if (!tokens) {
      resetChatBubbleBaseTone();
      return;
    }

    for (const [name, value] of Object.entries(tokens)) {
      style.setProperty(name, value);
      this.painted.push(name);
    }
    setChatBubbleBaseTone(mode, panelTone(tokens));
  }
}

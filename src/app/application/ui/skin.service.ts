import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { ThemeService } from '@axe/application/ui/theme.service';
import { resetChatBubbleBaseTone, setChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { asRecipe, asSkinId, CUSTOM_SKIN, parseRecipe, skinById, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { panelTone, SkinMode, SkinRecipe, SkinTokens, skinTokens } from '@axe/domain/ui/skin-palette';
import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';

/** A seat's whole wardrobe at one moment, which is what "put it back" restores. */
export interface SkinSnapshot {
  light: { id: string; recipe: SkinRecipe };
  dark: { id: string; recipe: SkinRecipe };
}

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

  /**
   * Which ladder the picker is dressing.
   *
   * It follows the one on screen, and stays where it is put until the screen moves: a dark
   * skin has to be choosable in daylight.
   */
  readonly editing = linkedSignal<SkinMode>(() => this.mode());

  /** What the sliders are holding for the ladder being dressed. */
  readonly recipe = computed(() => this.recipes[this.editing()]());

  /**
   * The skin under the pointer, which is shown without being put on.
   *
   * Trying a skin on for real means repainting the whole app, which is the truest preview
   * there is but costs the one you were wearing. Hovering shows it in the panel's own
   * preview instead, so a list of twenty can be looked through without choosing twenty times.
   */
  private readonly hovered = signal<string | null>(null);

  /** The colours the panel's preview is showing, standard included, without painting any. */
  readonly editedTokens = computed<SkinTokens>(() => {
    const mode = this.editing();
    return this.preview(this.hovered() ?? this.chosen[mode](), mode) ?? STANDARD_TOKENS[mode];
  });

  /** Whether the preview is showing something other than what the seat is wearing. */
  readonly tryingOn = computed(() => this.hovered() !== null && this.hovered() !== this.chosen[this.editing()]());

  /** Whether what the preview shows is also what is on screen behind the panel. */
  readonly live = computed(() => this.editing() === this.mode() && !this.tryingOn());

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

  editLadder(mode: SkinMode): void {
    this.editing.set(mode);
    this.hovered.set(null);
  }

  /** Shows a skin in the preview without putting it on. Null goes back to the one worn. */
  tryOn(id: string | null): void {
    this.hovered.set(id);
  }

  /** What the seat is wearing now, so a panel can put it back after someone has tried things on. */
  snapshot(): SkinSnapshot {
    return {
      light: { id: this.chosen.light(), recipe: this.recipes.light() },
      dark: { id: this.chosen.dark(), recipe: this.recipes.dark() },
    };
  }

  restore(worn: SkinSnapshot): void {
    for (const mode of ['light', 'dark'] as const) {
      this.recipes[mode].set(worn[mode].recipe);
      write(RECIPE_KEY[mode], JSON.stringify(worn[mode].recipe));
      this.chosen[mode].set(worn[mode].id);
      write(SKIN_KEY[mode], worn[mode].id);
    }
    this.hovered.set(null);
  }

  choose(id: string, mode: SkinMode = this.editing()): void {
    this.hovered.set(null);
    const settled = asSkinId(id, mode);
    this.chosen[mode].set(settled);
    write(SKIN_KEY[mode], settled);
  }

  /** Hands the sliders' numbers to the skin a person is building, and switches to it. */
  build(recipe: SkinRecipe, mode: SkinMode = this.editing()): void {
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

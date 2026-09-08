import { DOCUMENT } from '@angular/common';
import { computed, effect, inject, Injectable, linkedSignal, signal } from '@angular/core';
import { ThemeService } from '@axe/application/ui/theme.service';
import { downscaleImageBlob } from '@axe/core/storage/image-downscale';
import { looksLikeImage } from '@axe/core/storage/image-sniff';
import { SKIN_IMAGE_MAX_BYTES, SKIN_IMAGE_MAX_SIDE, SkinImageStore } from '@axe/core/storage/skin-image-store';
import { createZipBlob, readZipEntries } from '@axe/core/storage/zip-archive';
import { downloadBlob } from '@axe/core/util/download-blob';
import { resetChatBubbleBaseTone, setChatBubbleBaseTone } from '@axe/domain/ui/chat-bubble-base';
import { asRecipe, asSkinId, CUSTOM_SKIN, parseRecipe, skinById, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { readSkinFile, SKIN_FILE_NAME, skinFileName, writeSkinFile } from '@axe/domain/ui/skin-file';
import {
  layerPlacement,
  MAX_LAYERS,
  newLayerId,
  parseLayers,
  reorderLayers,
  SkinLayer,
} from '@axe/domain/ui/skin-layer';
import { panelTone, SkinMode, SkinRecipe, SkinTokens, skinTokens } from '@axe/domain/ui/skin-palette';
import { STANDARD_TOKENS } from '@axe/domain/ui/skin-standard';

/** A seat's whole wardrobe at one moment, which is what "put it back" restores. */
export interface SkinSnapshot {
  light: { id: string; recipe: SkinRecipe; stack: SkinLayer[] };
  dark: { id: string; recipe: SkinRecipe; stack: SkinLayer[] };
}

const SKIN_KEY: Record<SkinMode, string> = { light: 'ui-skin-light', dark: 'ui-skin-dark' };
const RECIPE_KEY: Record<SkinMode, string> = { light: 'ui-skin-recipe-light', dark: 'ui-skin-recipe-dark' };
const LAYERS_KEY: Record<SkinMode, string> = { light: 'ui-skin-layers-light', dark: 'ui-skin-layers-dark' };

/** One picture of the stack, ready to be handed to an element as a style. */
export interface PaintedLayer {
  id: string;
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  opacity: number;
}

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

  /**
   * The pictures papering each ladder's panels, underneath first.
   *
   * They belong to the ladder rather than to the skin, so a stack survives trying other
   * skins on. The bytes live in their own database; only the arrangement is held here.
   */
  private readonly stacks: Record<SkinMode, ReturnType<typeof signal<SkinLayer[]>>> = {
    light: signal(parseLayers(read(LAYERS_KEY.light))),
    dark: signal(parseLayers(read(LAYERS_KEY.dark))),
  };

  /** Where each layer's bytes are reachable, once they have been fetched out of the store. */
  private readonly urls = signal<Readonly<Record<string, string>>>({});

  private readonly images = SkinImageStore.instance;

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

  /**
   * The tone the panels of one ladder sit at.
   *
   * A chat bubble is worked out against the page it sits on, and the pipe that does the
   * working out is pure: it has to be handed this so that a skin moving the panels moves
   * every bubble already on screen, not only the ones written afterwards.
   */
  toneOf(mode: SkinMode): number {
    const worn = mode === this.mode() ? this.tokens() : this.preview(this.chosen[mode](), mode);
    return panelTone(worn ?? STANDARD_TOKENS[mode]);
  }

  /** The stack being arranged, for the list in the panel. */
  readonly stack = computed(() => this.stacks[this.editing()]());

  /** What every panel on screen is papered with. */
  readonly panelLayers = computed(() => this.paintedFor(this.mode()));

  /** What the preview is papered with, which may be the other ladder's. */
  readonly editedLayers = computed(() => this.paintedFor(this.editing()));

  /** Whether the stack is full, so the panel can stop offering to add to it. */
  readonly stackIsFull = computed(() => this.stack().length >= MAX_LAYERS);

  /** Whether the preview is showing something other than what the seat is wearing. */
  readonly tryingOn = computed(() => this.hovered() !== null && this.hovered() !== this.chosen[this.editing()]());

  /** Whether what the preview shows is also what is on screen behind the panel. */
  readonly live = computed(() => this.editing() === this.mode() && !this.tryingOn());

  /** The colours to paint, or nothing at all where the stylesheet already says them. */
  readonly tokens = computed<SkinTokens | null>(() => {
    const mode = this.mode();
    const id = this.chosen[mode]();
    if (id === STANDARD_SKIN) return null;
    return this.preview(id, mode);
  });

  private painted: string[] = [];

  constructor() {
    effect(() => this.paint(this.tokens(), this.mode()));
    void this.loadPictures();
  }

  private async loadPictures(): Promise<void> {
    const wanted = [...this.stacks.light(), ...this.stacks.dark()].map((layer) => layer.id);
    const fetched = await Promise.all(wanted.map(async (id) => [id, await this.images.get(id)] as const));

    const found: Record<string, string> = {};
    for (const [id, blob] of fetched) {
      if (blob) found[id] = URL.createObjectURL(blob);
    }
    if (Object.keys(found).length > 0) this.urls.update((held) => ({ ...held, ...found }));

    await this.images.forget(new Set(wanted));
  }

  /** The stack of one ladder, with the bytes it has and without the ones it has lost. */
  private paintedFor(mode: SkinMode): PaintedLayer[] {
    const urls = this.urls();
    return this.stacks[mode]()
      .filter((layer) => urls[layer.id])
      .map((layer) => {
        const place = layerPlacement(layer);
        return {
          id: layer.id,
          backgroundImage: `url("${urls[layer.id]}")`,
          backgroundSize: place.size,
          backgroundPosition: place.position,
          backgroundRepeat: place.repeat,
          opacity: layer.opacity / 100,
        };
      });
  }

  private keepStack(mode: SkinMode, layers: SkinLayer[]): void {
    this.stacks[mode].set(layers);
    write(LAYERS_KEY[mode], JSON.stringify(layers));
  }

  /**
   * Takes a picture into the stack of the ladder being dressed.
   *
   * It is resampled first: a panel is a few hundred pixels across and a camera hands over
   * something far larger, which would sit in the database for as long as the skin does.
   * Anything that is not a picture, or beyond what a browser will decode, is refused.
   */
  async addLayer(file: Blob, name: string, mode: SkinMode = this.editing()): Promise<boolean> {
    const id = await this.keepPicture(file, mode);
    if (!id) return false;

    this.keepStack(mode, [
      ...this.stacks[mode](),
      { id, name: name.slice(0, 60), opacity: 100, fit: 'cover', anchor: 'center' },
    ]);
    return true;
  }

  /**
   * The one way bytes become a layer, whether they came from a file picker or a zip.
   *
   * Nothing skips the size limit, the check that this is a picture at all, or the resample:
   * a skin handed over by someone else is exactly the case where those matter most. The cap
   * on the stack is read again after the waiting, since two pictures can be chosen at once.
   */
  private async keepPicture(file: Blob, mode: SkinMode): Promise<string | null> {
    if (this.stacks[mode]().length >= MAX_LAYERS) return null;
    if (file.size > SKIN_IMAGE_MAX_BYTES) return null;
    if (file.type && !file.type.startsWith('image/')) return null;
    if (!(await looksLikeImage(file))) return null;

    const scaled = (await downscaleImageBlob(file, SKIN_IMAGE_MAX_SIDE)) ?? file;
    if (this.stacks[mode]().length >= MAX_LAYERS) return null;

    const id = newLayerId();
    if (!(await this.images.put(id, scaled))) return null;

    this.urls.update((held) => ({ ...held, [id]: URL.createObjectURL(scaled) }));
    return id;
  }

  /**
   * Takes a layer out of the stack, leaving its bytes where they are.
   *
   * The way back out of the panel has to be able to put it there again, and there is nowhere
   * else the picture survives. What no stack refers to any more is swept on the next start.
   */
  removeLayer(id: string, mode: SkinMode = this.editing()): void {
    this.keepStack(
      mode,
      this.stacks[mode]().filter((layer) => layer.id !== id)
    );
  }

  moveLayer(id: string, by: number, mode: SkinMode = this.editing()): void {
    this.keepStack(mode, reorderLayers(this.stacks[mode](), id, by));
  }

  /** Changes one layer's strength, fit or corner, leaving the rest of the stack alone. */
  tuneLayer(id: string, patch: Partial<SkinLayer>, mode: SkinMode = this.editing()): void {
    this.keepStack(
      mode,
      this.stacks[mode]().map((layer) => (layer.id === id ? { ...layer, ...patch, id: layer.id } : layer))
    );
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
      light: { id: this.chosen.light(), recipe: this.recipes.light(), stack: [...this.stacks.light()] },
      dark: { id: this.chosen.dark(), recipe: this.recipes.dark(), stack: [...this.stacks.dark()] },
    };
  }

  restore(worn: SkinSnapshot): void {
    for (const mode of ['light', 'dark'] as const) {
      this.recipes[mode].set(worn[mode].recipe);
      write(RECIPE_KEY[mode], JSON.stringify(worn[mode].recipe));
      this.chosen[mode].set(worn[mode].id);
      write(SKIN_KEY[mode], worn[mode].id);
      this.keepStack(mode, [...worn[mode].stack]);
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

  /** The colours a skin would paint, for the swatches and the preview stage. */
  preview(id: string, mode: SkinMode): SkinTokens | null {
    if (id === CUSTOM_SKIN) return skinTokens(this.recipes[mode](), mode);
    const skin = skinById(id, mode);
    if (!skin?.recipe) return null;
    return skin.pinned ? { ...skinTokens(skin.recipe, mode), ...skin.pinned } : skinTokens(skin.recipe, mode);
  }

  /** Writes the skin being dressed out as a zip: its numbers, and every picture it stacks. */
  async exportSkin(name: string, mode: SkinMode = this.editing()): Promise<void> {
    const layers = this.stacks[mode]();
    const files: File[] = [];
    const packed: { layer: SkinLayer; entry: string }[] = [];

    for (const [index, layer] of layers.entries()) {
      const picture = await this.images.get(layer.id);
      if (!picture) continue;
      const entry = `${index + 1}-${layer.id}.${picture.type === 'image/png' ? 'png' : 'webp'}`;
      packed.push({ layer, entry });
      files.push(new File([picture], entry, { type: picture.type || 'image/webp' }));
    }

    const text = writeSkinFile(this.recipes[mode](), mode, name, packed);
    files.unshift(new File([text], SKIN_FILE_NAME, { type: 'application/json' }));
    downloadBlob(await createZipBlob(files), skinFileName(name));
  }

  /** Reads a skin someone was handed, and wears it. Anything unreadable is left alone. */
  async importSkin(blob: Blob): Promise<boolean> {
    const entries = await readZipEntries(blob).catch(() => []);
    const description = entries.find((entry) => entry.name === SKIN_FILE_NAME);
    if (!description) return false;

    const skin = readSkinFile(await description.blob.text());
    if (!skin) return false;

    const mode = skin.mode;
    this.keepStack(mode, []);
    this.build(skin.recipe, mode);

    for (const wanted of skin.layers) {
      const packed = entries.find((entry) => entry.name === wanted.file);
      if (!packed) continue;
      const id = await this.keepPicture(packed.blob, mode);
      if (!id) continue;
      this.keepStack(mode, [
        ...this.stacks[mode](),
        { id, name: wanted.name, opacity: wanted.opacity, fit: wanted.fit, anchor: wanted.anchor },
      ]);
    }

    this.editLadder(mode);
    return true;
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

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SkinService } from '@axe/application/ui/skin.service';
import { CUSTOM_SKIN, Skin, SkinGroup, skinsFor, STANDARD_SKIN } from '@axe/domain/ui/skin';
import {
  LAYER_ANCHORS,
  LAYER_FITS,
  LayerAnchor,
  LayerFit,
  RECOMMENDED_LAYER_SIZE,
  RECOMMENDED_TILE_SIZE,
} from '@axe/domain/ui/skin-layer';
import { MAX_LIFT, MAX_SPREAD, MIN_SPREAD, SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';
import { TranslocoModule } from '@jsverse/transloco';

/** The order the groups are offered in: the plain one first, then colour, then the odd ones. */
const GROUPS: readonly SkinGroup[] = ['standard', 'hue', 'legible', 'scene', 'board'];

interface Swatch {
  id: string;
  ground: string;
  panel: string;
  accent: string;
  ink: string;
}

@Component({
  selector: 'app-skin-picker',
  templateUrl: './skin-picker.component.html',
  imports: [TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkinPickerComponent {
  private readonly skins = inject(SkinService);

  protected readonly standard = STANDARD_SKIN;
  protected readonly custom = CUSTOM_SKIN;
  protected readonly maxLift = MAX_LIFT;
  protected readonly maxSpread = MAX_SPREAD;
  protected readonly minSpread = MIN_SPREAD;
  protected readonly fits = LAYER_FITS;
  protected readonly anchors = LAYER_ANCHORS;
  protected readonly wide = RECOMMENDED_LAYER_SIZE.width;
  protected readonly tall = RECOMMENDED_LAYER_SIZE.height;
  protected readonly tile = RECOMMENDED_TILE_SIZE;

  protected readonly stack = this.skins.stack;
  protected readonly stackIsFull = this.skins.stackIsFull;

  /** What the skin is called when it is written out. Blank is fine; the file falls back. */
  protected readonly skinName = signal('');

  /** What went wrong with the last file that was handed over, for the line under the button. */
  protected readonly trouble = signal<'' | 'picture' | 'skin'>('');

  /** Which ladder is being dressed. The service holds it, so the preview follows along. */
  protected readonly editing = this.skins.editing;

  protected readonly chosen = computed(() => this.skins.skinOf(this.editing()));

  /** What each ladder is wearing, so both are readable without switching to look. */
  protected readonly ladders = computed(() =>
    (['light', 'dark'] as const).map((mode) => ({ mode, worn: this.skins.skinOf(mode) }))
  );

  protected readonly recipe = this.skins.recipe;

  protected readonly groups = computed(() => {
    const mode = this.editing();
    const all = skinsFor(mode);
    return GROUPS.map((group) => ({ group, skins: all.filter((skin) => skin.group === group) })).filter(
      (row) => row.skins.length > 0
    );
  });

  /** The four colours a swatch shows, which is as much of a skin as a thumbnail can carry. */
  protected swatchOf(skin: Skin): Swatch {
    const tokens = this.skins.preview(skin.id, this.editing());
    if (!tokens) {
      return skin.mode === 'light'
        ? { id: skin.id, ground: '#d4c8e2', panel: '#e8dded', accent: '#1e66f5', ink: '#4c4564' }
        : { id: skin.id, ground: '#0d1117', panel: '#21262d', accent: '#58a6ff', ink: '#e6edf3' };
    }
    return {
      id: skin.id,
      ground: tokens['--ui-bg'],
      panel: tokens['--ui-elevated'],
      accent: tokens['--ui-accent'],
      ink: tokens['--ui-text'],
    };
  }

  protected readonly customSwatch = computed<Swatch>(() => {
    const tokens = this.skins.preview(CUSTOM_SKIN, this.editing())!;
    return {
      id: CUSTOM_SKIN,
      ground: tokens['--ui-bg'],
      panel: tokens['--ui-elevated'],
      accent: tokens['--ui-accent'],
      ink: tokens['--ui-text'],
    };
  });

  protected editLadder(mode: SkinMode): void {
    this.skins.editLadder(mode);
  }

  protected tryOn(id: string | null): void {
    this.skins.tryOn(id);
  }

  protected pick(id: string): void {
    this.skins.choose(id, this.editing());
  }

  protected tune(field: keyof SkinRecipe, value: string): void {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    this.skins.build({ ...this.recipe(), [field]: amount }, this.editing());
  }

  protected async addLayer(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const name = file?.name ?? '';
    input.value = '';
    if (!file) return;
    this.trouble.set((await this.skins.addLayer(file, name)) ? '' : 'picture');
  }

  protected async dropLayer(id: string): Promise<void> {
    await this.skins.removeLayer(id);
  }

  protected moveLayer(id: string, by: number): void {
    this.skins.moveLayer(id, by);
  }

  protected setOpacity(id: string, value: string): void {
    const amount = Number(value);
    if (Number.isFinite(amount)) this.skins.tuneLayer(id, { opacity: amount });
  }

  protected setFit(id: string, fit: string): void {
    this.skins.tuneLayer(id, { fit: fit as LayerFit });
  }

  protected setAnchor(id: string, anchor: string): void {
    this.skins.tuneLayer(id, { anchor: anchor as LayerAnchor });
  }

  protected async exportSkin(): Promise<void> {
    await this.skins.exportSkin(this.skinName());
  }

  protected async importSkin(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.trouble.set((await this.skins.importSkin(file)) ? '' : 'skin');
  }

  protected rename(value: string): void {
    this.skinName.set(value.slice(0, 40));
  }

  protected toggleContrast(strong: boolean): void {
    this.skins.build({ ...this.recipe(), contrast: strong ? 'high' : 'normal' }, this.editing());
  }
}

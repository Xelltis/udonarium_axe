import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SkinService } from '@axe/application/ui/skin.service';
import { CUSTOM_SKIN, Skin, SkinGroup, skinsFor, STANDARD_SKIN } from '@axe/domain/ui/skin';
import { MAX_LIFT, SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';
import { TranslocoModule } from '@jsverse/transloco';

/** The order the groups are offered in: the plain one first, then colour, then the odd ones. */
const GROUPS: readonly SkinGroup[] = ['standard', 'hue', 'dark', 'legible', 'scene', 'board'];

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

  /** Which ladder is being dressed. It opens on the one showing, and can be moved to the other. */
  protected readonly editing = signal<SkinMode>(this.skins.mode());

  protected readonly chosen = computed(() => this.skins.skinOf(this.editing()));

  protected readonly recipe = computed(() => this.skins.recipeOf(this.editing()));

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
    this.editing.set(mode);
  }

  protected pick(id: string): void {
    this.skins.choose(id, this.editing());
  }

  protected tune(field: keyof SkinRecipe, value: string): void {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    this.skins.build({ ...this.recipe(), [field]: amount }, this.editing());
  }

  protected toggleContrast(strong: boolean): void {
    this.skins.build({ ...this.recipe(), contrast: strong ? 'high' : 'normal' }, this.editing());
  }
}

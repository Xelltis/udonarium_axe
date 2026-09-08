import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, viewChild } from '@angular/core';
import { SkinService, SkinSnapshot } from '@axe/application/ui/skin.service';
import { SkinPickerComponent } from '@axe/features/skin/skin-picker/skin-picker.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The whole skin, shown at the size it is actually read at.
 *
 * Three things have to hold at once for this to be worth opening. The preview has to stay
 * on screen while the sliders are being dragged, so it is stuck to the top of the panel
 * rather than scrolling away above the controls. A skin has to be viewable without being
 * put on, so hovering a swatch shows it here and only a click commits. And the app behind
 * the panel is the truest preview there is, so choosing repaints it at once — which is
 * only safe because what the seat was wearing when the panel opened can be put back.
 */
@Component({
  selector: 'app-skin-panel',
  templateUrl: './skin-panel.component.html',
  imports: [TranslocoModule, SkinPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SkinPanelComponent {
  private readonly skins = inject(SkinService);
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');

  protected readonly editing = this.skins.editing;
  protected readonly live = this.skins.live;
  protected readonly tryingOn = this.skins.tryingOn;

  /** What the seat was wearing when this opened, which is what the way back leads to. */
  private readonly worn: SkinSnapshot = this.skins.snapshot();

  private painted: string[] = [];

  constructor() {
    effect(() => {
      const tokens = this.skins.editedTokens();
      const style = this.stage().nativeElement.style;
      for (const name of this.painted) style.removeProperty(name);
      this.painted = Object.keys(tokens);
      for (const [name, value] of Object.entries(tokens)) style.setProperty(name, value);
    });
  }

  protected revert(): void {
    this.skins.restore(this.worn);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { ShortcutScopeService } from '@axe/application/ui/shortcut-scope.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { shortcutSheetSections } from '@axe/domain/ui/keyboard-shortcuts';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { UiShortcutSheetComponent } from '@axe/ui/components/shortcut-sheet/shortcut-sheet.component';

/**
 * The cheat sheet, brought out and put away with the names of the buttons.
 *
 * It lists what can be used from the screen the reader is on: an editor that is open first, then
 * the first person view or the table under it, without the lines meant for another role or the
 * other kind of grid. It is left out wherever the guide is, in novel mode, the small-screen layout
 * and the streaming overlay.
 */
@Component({
  selector: 'app-shortcut-sheet',
  templateUrl: './shortcut-sheet.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UiShortcutSheetComponent],
})
export class ShortcutSheetComponent {
  private readonly guide = inject(ButtonGuideService);
  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly overlayMode = inject(OverlayModeService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly scopes = inject(ShortcutScopeService);
  private readonly objectChange = inject(ObjectChangeService);

  protected readonly shown = computed(
    () => this.guide.shown() && !this.visualNovel.active() && !this.mobile.isActive() && !this.overlayMode.active()
  );

  protected readonly sections = computed(() => {
    this.objectChange.trackMyCursor();
    const lattice = this.firstPerson.lattice().kind;
    return shortcutSheetSections({
      firstPerson: this.firstPerson.showing(),
      openScopes: this.scopes.scopes(),
      grid: lattice === 'flatHex' || lattice === 'pointyHex' ? 'hex' : 'square',
      role: PeerCursor.myRole,
    });
  });
}

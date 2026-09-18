import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { getRangeMenuItems } from '@axe/application/tabletop/tabletop-action-helpers';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode } from '@axe/domain/character/buff-view-mode';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { ActiveCharacterService } from '@axe/features/pl-tools/active-character.service';
import { isOwnedByUser } from '@axe/features/pl-tools/owned-character-list/owned-characters';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { turnIndicatorSignal } from '@axe/ui/turn/turn-indicator.signal';
import { TranslocoModule } from '@jsverse/transloco';

const BUFF_VIEW_ICONS: Record<BuffViewMode, string> = {
  icon: 'bubble_chart',
  detail: 'format_list_bulleted',
  count: 'tag',
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pl-toolbar',
  templateUrl: './pl-toolbar.component.html',
  imports: [DraggableDirective, SafePipe, TranslocoModule, UiIconButtonComponent],
})
export class PlToolbarComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly tabletopAction = inject(TabletopActionService);
  protected readonly active = inject(ActiveCharacterService);
  private readonly buffViewPreference = inject(BuffViewPreferenceService);
  private readonly t = inject(TRANSLATE_FN);

  protected readonly buffViewIcon = computed(() => BUFF_VIEW_ICONS[this.buffViewPreference.mode()]);
  protected readonly buffViewLabelKey = computed(() => BUFF_VIEW_LABEL_KEYS[this.buffViewPreference.mode()]);

  protected cycleBuffView(): void {
    this.buffViewPreference.cycle();
  }

  protected readonly rangeMenuItems = getRangeMenuItems();
  protected readonly rangeOpen = signal(false);

  private readonly folds = inject(ToolbarFoldService);

  /** Whether this seat draws the resource bars and the buffs over the pieces, switched from here. */
  protected readonly overlay = inject(PieceOverlayPreferenceService);

  /** Whether the bar is folded down to its title. */
  protected readonly folded = computed(() => this.folds.isFolded('pl'));

  /** Folds the bar down to its title, or opens it again; what was open in it closes with it. */
  protected toggleFold(): void {
    this.rangeOpen.set(false);
    this.folds.toggle('pl');
  }

  private readonly barRef = viewChild<ElementRef<HTMLElement>>('bar');
  private savedLeft: string | null = null;
  private savedTop: string | null = null;

  readonly isPlayer = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole === PeerRole.Player;
  });

  private readonly widgets = inject(WidgetVisibilityService);

  /** Drawn for a player who has not hidden it from the widget menu. */
  protected readonly shown = computed(() => this.isPlayer() && this.widgets.plToolbar());

  readonly activeCharacter = computed<GameCharacter | null>(() => {
    const identifier = this.active.identifier();
    if (!identifier) return null;
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.versionOf(identifier)();
    this.objectChange.trackMyCursor();
    const character = this.objectStore.get(identifier);
    if (!(character instanceof GameCharacter)) return null;
    return isOwnedByUser(character, PeerCursor.myCursor?.userId ?? '') ? character : null;
  });

  readonly turnIndicator = turnIndicatorSignal();

  protected activeImageUrl(): string {
    return this.activeCharacter()?.imageFile?.url ?? '';
  }

  protected openActiveChatPalette(): void {
    const character = this.activeCharacter();
    if (character) this.objectPanels.openChatPalette(character);
  }

  protected toggleRangeMenu(): void {
    if (!this.activeCharacter()) {
      this.rangeOpen.set(false);
      this.openOwnedCharacterList();
      return;
    }
    this.rangeOpen.update((open) => !open);
  }

  protected createRange(typeName: string): void {
    const character = this.activeCharacter();
    this.rangeOpen.set(false);
    if (!character) return;
    const range = this.tabletopAction.createRangeArea(
      { x: character.location.x, y: character.location.y, z: character.posZ },
      typeName
    );
    range.followingCharacterIdentifier = character.identifier;
    range.following();
    SoundEffect.play(PresetSound.dicePut);
  }

  constructor() {
    effect((onCleanup) => {
      const el = this.barRef()?.nativeElement;
      if (!el) return;
      if (this.savedLeft !== null && this.savedTop !== null) {
        el.style.left = this.savedLeft;
        el.style.top = this.savedTop;
      } else {
        el.style.left = `${Math.max(8, (window.innerWidth - el.offsetWidth) / 2)}px`;
        el.style.top = '8px';
      }
      onCleanup(() => {
        this.savedLeft = el.style.left;
        this.savedTop = el.style.top;
      });
    });
  }

  protected openOwnedCharacterList(): void {
    this.roomPanels.open('ownedCharacters', { left: 100, top: 40 });
  }
}

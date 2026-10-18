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
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { getRangeMenuItems } from '@axe/application/tabletop/tabletop-action-helpers';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { MenuCommandService, MenuEntryView } from '@axe/features/menu/menu-command.service';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { ActiveCharacterService } from '@axe/features/pl-tools/active-character.service';
import { isOwnedByUser } from '@axe/features/pl-tools/owned-character-list/owned-characters';
import { UiButtonGuideComponent } from '@axe/ui/components/button-guide/button-guide.component';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { turnIndicatorSignal } from '@axe/ui/turn/turn-indicator.signal';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pl-toolbar',
  templateUrl: './pl-toolbar.component.html',
  imports: [DraggableDirective, SafePipe, TranslocoModule, UiButtonGuideComponent, UiIconButtonComponent],
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
  private readonly tabletop = inject(TabletopService);
  protected readonly active = inject(ActiveCharacterService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly menuCommands = inject(MenuCommandService);
  private readonly barLayout = inject(MenuLayoutService).layoutOf('plToolbar');

  /** The bar as this seat has it arranged, with what it is not offered left out. */
  protected readonly entries = computed<MenuEntryView[]>(() => this.menuCommands.entriesOf(this.barLayout()));

  /** What is written on an entry, with a word in front where the name alone would not say. */
  protected entryLabel(entry: MenuEntryView): string {
    if (entry.label) return entry.label;
    const name = this.t(entry.labelKey);
    return entry.prefixKey ? `${this.t(entry.prefixKey)}: ${name}` : name;
  }

  protected press(entry: MenuEntryView): void {
    this.menuCommands.run(entry.command);
  }

  protected readonly firstPersonOpen = signal(false);

  protected readonly firstPersonSeats = this.firstPerson.seats;

  protected readonly firstPersonForced = computed(() => this.firstPerson.forced());

  protected readonly firstPersonLeaves = computed(() => this.firstPerson.showing() && !this.firstPersonForced());

  protected readonly firstPersonDisabled = computed(
    () => this.firstPersonForced() || (!this.firstPersonLeaves() && this.firstPersonSeats().length < 1)
  );

  protected readonly firstPersonLabelKey = computed(() => {
    if (this.firstPersonForced()) return 'feature.firstPerson.sharedByGm';
    if (this.firstPersonLeaves()) return 'feature.firstPerson.exit';
    const seats = this.firstPersonSeats().length;
    if (seats < 1) return 'feature.firstPerson.noSeat';
    return seats > 1 ? 'feature.firstPerson.chooseSeat' : 'feature.firstPerson.enter';
  });

  protected toggleFirstPerson(): void {
    if (this.firstPersonForced()) return;
    if (this.firstPersonLeaves()) {
      this.firstPersonOpen.set(false);
      this.firstPerson.exitSeat();
      return;
    }

    const seats = this.firstPersonSeats();
    if (seats.length < 1) return;
    if (seats.length === 1) {
      this.firstPersonOpen.set(false);
      this.firstPerson.enterSeat(seats[0].identifier);
      return;
    }

    this.firstPersonOpen.update((open) => !open);
  }

  protected enterFirstPerson(identifier: string): void {
    this.firstPersonOpen.set(false);
    this.firstPerson.enterSeat(identifier);
  }

  protected readonly rangeMenuItems = getRangeMenuItems();
  protected readonly rangeOpen = signal(false);

  private readonly folds = inject(ToolbarFoldService);

  /** Whether this seat draws the resource bars and the buffs over the pieces, switched from here. */
  protected readonly overlay = inject(PieceOverlayPreferenceService);

  /** Whether the bar is folded down to its title. */
  protected readonly folded = computed(() => this.folds.isFolded('pl'));

  /** Whether the name of every button is written out beside the bar. */
  protected readonly guide = inject(ButtonGuideService);

  /** Folds the bar down to its title, or opens it again; what was open in it closes with it. */
  protected toggleFold(): void {
    this.rangeOpen.set(false);
    this.firstPersonOpen.set(false);
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
    range.following(this.tabletop.gridSize());
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
    this.roomPanels.open('ownedCharacters');
  }
}

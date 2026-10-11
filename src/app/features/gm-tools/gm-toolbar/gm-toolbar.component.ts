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
import { GUEST_PERSONA, VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { NpcBarService } from '@axe/application/ui/npc-bar.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { ToolbarFoldService } from '@axe/application/ui/toolbar-fold.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  FirstPersonShareChoice,
  firstPersonShareChoices,
} from '@axe/features/gm-tools/gm-toolbar/first-person-share-choices';
import { NpcBarComponent } from '@axe/features/gm-tools/npc-bar/npc-bar.component';
import { NpcDragService } from '@axe/features/gm-tools/npc-bar/npc-drag.service';
import { MenuCommandService, MenuEntryView } from '@axe/features/menu/menu-command.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiButtonGuideComponent } from '@axe/ui/components/button-guide/button-guide.component';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { turnIndicatorSignal } from '@axe/ui/turn/turn-indicator.signal';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gm-toolbar',
  templateUrl: './gm-toolbar.component.html',
  imports: [DraggableDirective, NpcBarComponent, TranslocoModule, UiButtonGuideComponent, UiIconButtonComponent],
})
export class GmToolbarComponent {
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly npcBar = inject(NpcBarService);
  protected readonly drag = inject(NpcDragService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly tabletopService = inject(TabletopService);
  private readonly visionService = inject(VisionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);
  private readonly firstPerson = inject(FirstPersonService);

  private readonly barRef = viewChild<ElementRef<HTMLElement>>('bar');
  private savedLeft: string | null = null;
  private savedTop: string | null = null;

  protected readonly personaOpen = signal(false);

  private readonly folds = inject(ToolbarFoldService);

  /** Whether this seat draws the resource bars and the buffs over the pieces, switched from here. */
  protected readonly overlay = inject(PieceOverlayPreferenceService);

  /** Whether the bar is folded down to its title. */
  protected readonly folded = computed(() => this.folds.isFolded('gm'));

  /** Whether the name of every button is written out beside the bar. */
  protected readonly guide = inject(ButtonGuideService);

  /** Folds the bar down to its title, or opens it again; what was open in it closes with it. */
  protected toggleFold(): void {
    this.personaOpen.set(false);
    this.shareOpen.set(false);
    this.folds.toggle('gm');
  }

  readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  private readonly widgets = inject(WidgetVisibilityService);

  /** Drawn for the game master unless they have hidden it from the widget menu. */
  protected readonly shown = computed(() => this.isGameMaster() && this.widgets.gmToolbar());

  /**
   * The players whose eyes the master may look through.
   *
   * Guests are left out: every one of them sees the same, and the guest preview stands for them all.
   */
  protected readonly personas = computed<PeerCursor[]>(() => {
    this.objectChange.collectionOf('PeerCursor')();
    return this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => !cursor.isGameMaster && !cursor.isGuest);
  });

  /** The preview that looks as a guest would, offered whether or not one is connected. */
  protected readonly guestPersona = GUEST_PERSONA;

  /** Whether the master is looking at the table as a guest would. */
  protected readonly previewingGuest = computed(() => this.visionService.previewAsUserId() === GUEST_PERSONA);

  protected readonly currentPersona = computed<PeerCursor | null>(() => {
    const userId = this.visionService.previewAsUserId();
    if (!userId) return null;
    return this.personas().find((cursor) => cursor.userId === userId) ?? null;
  });

  readonly turnIndicator = turnIndicatorSignal();

  protected turnPrev(): void {
    this.turnOrder.prev();
  }

  protected turnNext(): void {
    this.turnOrder.next();
  }

  protected readonly sharedView = computed(() => {
    if (!this.firstPerson.sharedPiece()) return null;
    return { missing: !this.firstPerson.sharedUsable() };
  });

  protected readonly shareOpen = signal(false);

  protected readonly shareChoices = computed<FirstPersonShareChoice[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    return firstPersonShareChoices(
      this.objectStore.getObjects<GameCharacter>(GameCharacter),
      this.firstPerson.sharedPiece(),
      (character) => this.firstPerson.canLookOutOf(character)
    );
  });

  protected readonly shareLabelKey = computed(() => {
    const shared = this.sharedView();
    if (shared?.missing) return 'feature.firstPerson.sharedMissing';
    return shared ? 'feature.firstPerson.sharing' : 'feature.firstPerson.shareMenu';
  });

  /**
   * Opens or closes the list of pieces to put everyone in. While the piece everyone was put in has
   * left the table, the press lets everyone go instead, as the button says.
   */
  protected toggleShareMenu(): void {
    if (this.sharedView()?.missing) {
      this.stopSharing();
      return;
    }
    this.shareOpen.update((open) => !open);
  }

  protected shareFirstPerson(identifier: string): void {
    this.shareOpen.set(false);
    this.firstPerson.share(identifier);
  }

  protected stopSharing(): void {
    this.shareOpen.set(false);
    this.firstPerson.share(null);
  }

  protected readonly darknessEnabled = computed(() => {
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    return table.darknessEnabled;
  });

  protected readonly fogEnabled = computed(() => {
    const table = this.tabletopService.currentTable;
    this.objectChange.versionOf(table.identifier)();
    return table.fogEnabled;
  });

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

  private readonly menuCommands = inject(MenuCommandService);
  private readonly barLayout = inject(MenuLayoutService).layoutOf('gmToolbar');

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

  protected togglePersona(): void {
    this.personaOpen.update((open) => !open);
  }

  protected selectPersona(userId: string | null): void {
    this.visionService.previewAsUserId.set(userId);
    this.personaOpen.set(false);
  }
}

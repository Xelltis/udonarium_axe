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
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { findOrphanedOwnership } from '@axe/domain/tabletop/ownership';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { NpcBarComponent } from '@axe/features/gm-tools/npc-bar/npc-bar.component';
import { NpcBarService } from '@axe/features/gm-tools/npc-bar/npc-bar.service';
import { NpcDragService } from '@axe/features/gm-tools/npc-bar/npc-drag.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { turnIndicatorSignal } from '@axe/ui/turn/turn-indicator.signal';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-gm-toolbar',
  templateUrl: './gm-toolbar.component.html',
  imports: [DraggableDirective, NpcBarComponent, TranslocoModule, UiIconButtonComponent],
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
  protected readonly handRail = inject(HandRailService);
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  private readonly barRef = viewChild<ElementRef<HTMLElement>>('bar');
  private savedLeft: string | null = null;
  private savedTop: string | null = null;

  protected readonly personaOpen = signal(false);

  readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  protected readonly personas = computed<PeerCursor[]>(() => {
    this.objectChange.collectionOf('PeerCursor')();
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).filter((cursor) => !cursor.isGameMaster);
  });

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

  protected toggleHandRail(): void {
    this.handRail.toggle();
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

  protected openObjectList(): void {
    this.roomPanels.open('objectList', { left: 100, top: 40 });
  }

  protected openPartyList(): void {
    this.roomPanels.open('partyList', { left: 120, top: 60 });
  }

  protected openBuffManager(): void {
    this.roomPanels.open('buffManager', { left: 160, top: 100 });
  }

  protected openEffectLibrary(): void {
    this.roomPanels.open('effectLibrary', { left: 140, top: 80 });
  }

  protected openMapEditor(): void {
    this.roomPanels.open('mapEditor', { left: 80, top: 60 });
  }

  protected openDungeonGenerator(): void {
    this.roomPanels.open('dungeonGenerator', { left: 100, top: 60 });
  }

  protected toggleNpcBar(): void {
    this.npcBar.toggle();
  }

  protected toggleDarkness(): void {
    const table = this.tabletopService.currentTable;
    table.darknessEnabled = !table.darknessEnabled;
    table.update();
    this.objectChange.notifyChanged(table.identifier);
  }

  protected toggleFog(): void {
    const table = this.tabletopService.currentTable;
    table.fogEnabled = !table.fogEnabled;
    table.update();
    this.objectChange.notifyChanged(table.identifier);
  }

  protected async releaseOrphanedOwnership(): Promise<void> {
    const orphaned = findOrphanedOwnership(this.objectStore.getObjects());
    if (orphaned.length === 0) return;
    if (!(await this.confirm.ask(this.t('app.fab.releaseOwnershipConfirm', { count: orphaned.length })))) return;
    for (const object of orphaned) object.owner = '';
  }

  protected togglePersona(): void {
    this.personaOpen.update((open) => !open);
  }

  protected selectPersona(userId: string | null): void {
    this.visionService.previewAsUserId.set(userId);
    this.personaOpen.set(false);
  }
}

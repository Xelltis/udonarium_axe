import { inject, Injector, Provider } from '@angular/core';
import {
  BOTTOM_SHEET_FRAME_COMPONENT,
  CARD_STACK_LIST_COMPONENT,
  CHAT_PORTRAIT_COMPONENT,
  CONFIRM_DIALOG_COMPONENT,
  CONTEXT_MENU_COMPONENT,
  FOUR_WAY_RADIAL_MENU_LOADER,
  LOAD_FAILURE_NOTICE,
  MODAL_FRAME_COMPONENT,
  PANEL_FRAME_COMPONENT,
} from '@axe/application/ui/overlay-components';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';
import { CardStackListImageComponent } from '@axe/features/card/card-stack-list-img/card-stack-list-img.component';
import { ChatPortraitImageComponent } from '@axe/features/chat/chat-portrait-img/chat-portrait-img.component';
import { BottomSheetComponent } from '@axe/ui/components/bottom-sheet/bottom-sheet.component';
import { ConfirmDialogComponent } from '@axe/ui/components/confirm-dialog/confirm-dialog.component';
import { ContextMenuComponent } from '@axe/ui/components/context-menu/context-menu.component';
import { ModalComponent } from '@axe/ui/components/modal/modal.component';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';
import { TOOLTIP_PANEL_LOADER } from '@axe/ui/directives/tooltip.directive';

/**
 * The components the panel, dialogue, menu and tooltip services put on screen, handed in from here
 * because the layers those services live in may not import them.
 *
 * What is seldom wanted is fetched the first time it is asked for, and a fetch that fails after a
 * release asks the reader to reload. The reload notice is looked up only when a fetch fails: what it
 * runs before a reload reaches back to the start room, which uses these loaders too, so taking the
 * notice up front would make each wait for the other.
 */
export const OVERLAY_PROVIDERS: Provider[] = [
  { provide: PANEL_FRAME_COMPONENT, useValue: UIPanelComponent },
  { provide: CHAT_PORTRAIT_COMPONENT, useValue: ChatPortraitImageComponent },
  { provide: CARD_STACK_LIST_COMPONENT, useValue: CardStackListImageComponent },
  { provide: MODAL_FRAME_COMPONENT, useValue: ModalComponent },
  { provide: CONTEXT_MENU_COMPONENT, useValue: ContextMenuComponent },
  { provide: BOTTOM_SHEET_FRAME_COMPONENT, useValue: BottomSheetComponent },
  { provide: CONFIRM_DIALOG_COMPONENT, useValue: ConfirmDialogComponent },
  {
    provide: FOUR_WAY_RADIAL_MENU_LOADER,
    useValue: () =>
      import('@axe/ui/components/four-way-radial-menu/four-way-radial-menu.component').then(
        (m) => m.FourWayRadialMenuComponent
      ),
  },

  {
    provide: TOOLTIP_PANEL_LOADER,
    useFactory: () => {
      const injector = inject(Injector);
      return () =>
        injector
          .get(ReloadNoticeService)
          .noticingFailure(() =>
            import('@axe/features/inventory/overview-panel/overview-panel.component').then(
              (m) => m.OverviewPanelComponent
            )
          )();
    },
  },
  {
    provide: LOAD_FAILURE_NOTICE,
    useFactory: () => {
      const injector = inject(Injector);
      return () => injector.get(ReloadNoticeService).tellReloadNeeded();
    },
  },
];

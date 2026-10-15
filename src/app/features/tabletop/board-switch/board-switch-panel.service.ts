import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { SwitchPressOutcome, SwitchPressService } from '@axe/application/tabletop/switch-press.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectNode } from '@axe/core/sync/object-node';
import { isInStore } from '@axe/core/sync/object-store';
import { switchOf } from '@axe/domain/tabletop/board-switch/board-switch';

/** Something on the table a switch can hang under, with the name it speaks under. */
export interface SwitchHostNode extends ObjectNode {
  readonly name: string;
}

/**
 * Opens the master's panel for a switch, and presses switches from the menus.
 *
 * One panel to a switch: opening it again replaces the open one rather than stacking a second on
 * top of it, where two would each write over what the other had just written. A switch gone, with
 * what it hung under, by the time its panel's code arrives opens nothing.
 */
@Injectable({ providedIn: 'root' })
export class BoardSwitchPanelService {
  private readonly panels = inject(PanelService);
  private readonly pointers = inject(PointerDeviceService);
  private readonly switches = inject(BoardSwitchService);
  private readonly presses = inject(SwitchPressService);
  private readonly t = inject(TRANSLATE_FN);

  /** Opens the panel for the switch on something, making the switch first where it has none. */
  open(host: SwitchHostNode): void {
    const target = this.switches.ensure(host);
    if (!target) return;
    const at = this.pointers.pointers[0];
    this.panels.openLazy(
      () =>
        import('@axe/features/tabletop/board-switch/board-switch-editor.component').then(
          (m) => m.BoardSwitchEditorComponent
        ),
      {
        title: this.t('feature.boardSwitch.panelTitle', { name: host.name }),
        left: at.x - 230,
        top: at.y - 150,
        width: 460,
        height: 520,
        single: `board-switch:${target.identifier}`,
        stillWanted: () => isInStore(target),
      },
      (editor) => editor.target.set(target)
    );
  }

  /** Tries the switch on something out, where it has one, without counting it as a press. */
  tryOut(host: SwitchHostNode): Promise<SwitchPressOutcome | null> {
    const target = switchOf(host);
    if (!target) return Promise.resolve(null);
    return this.presses.press(target, { trial: true });
  }
}

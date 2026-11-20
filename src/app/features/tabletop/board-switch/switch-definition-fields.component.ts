import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { Network } from '@axe/core/network/network';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import {
  clampSwitchRange,
  SWITCH_SPEAKERS,
  SwitchDefinition,
  SwitchSpeaker,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { asTriggerRepeat, TRIGGER_REPEATS } from '@axe/domain/tabletop/trigger-event';
import { SwitchActionListComponent } from '@axe/features/tabletop/board-switch/switch-action-list.component';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * What a switch is called, who it speaks as, what it asks of whoever presses it, and what it does.
 *
 * Shared by the master's panel for a block's switch and by the map editor's brush for painted
 * ground that is pressed. Each change goes out as the part that changed rather than as the whole,
 * so whoever holds the switch writes it onto what the switch says at that moment.
 */
@Component({
  selector: 'switch-definition-fields',
  templateUrl: './switch-definition-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwitchActionListComponent, TranslocoModule],
})
export class SwitchDefinitionFieldsComponent {
  private readonly visibleTabs = inject(VisibleChatTabsService).tabs;

  readonly definition = input.required<SwitchDefinition>();
  readonly changed = output<Partial<SwitchDefinition>>();

  protected readonly speakers = SWITCH_SPEAKERS;
  protected readonly repeats = TRIGGER_REPEATS;

  /**
   * The tabs a switch may be set to speak into: every tab this seat may read but the system's
   * noticeboard, so a tab kept from this seat's role is not named to it here either.
   */
  protected readonly tabs = computed<ChatTab[]>(() => this.visibleTabs().filter((tab) => !tab.isSystemTab));

  /** Whether a room server keeps watchers off every switch, whatever this one says. */
  protected get guestsKeptOutByServer(): boolean {
    return Network.authorityPeerId !== null;
  }

  protected emit<K extends keyof SwitchDefinition>(key: K, value: SwitchDefinition[K]): void {
    this.changed.emit({ [key]: value } as Partial<SwitchDefinition>);
  }

  protected setSpeaker(speaker: string): void {
    if ((SWITCH_SPEAKERS as readonly string[]).includes(speaker)) this.emit('speaker', speaker as SwitchSpeaker);
  }

  protected setRange(range: string): void {
    this.emit('range', clampSwitchRange(range));
  }

  protected setRepeat(repeat: string): void {
    this.emit('repeat', asTriggerRepeat(repeat));
  }
}

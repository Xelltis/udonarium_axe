import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
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
  selector: 'app-switch-definition-fields',
  templateUrl: './switch-definition-fields.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SwitchActionListComponent, TranslocoModule],
})
export class SwitchDefinitionFieldsComponent {
  private readonly chat = inject(ChatMessageService);
  private readonly objectChange = inject(ObjectChangeService);

  readonly definition = input.required<SwitchDefinition>();
  readonly changed = output<Partial<SwitchDefinition>>();

  protected readonly speakers = SWITCH_SPEAKERS;
  protected readonly repeats = TRIGGER_REPEATS;

  /** The tabs a switch may speak into: every tab but the system's noticeboard. */
  protected readonly tabs = computed<ChatTab[]>(() => {
    this.objectChange.collectionOf(ChatTab.aliasName)();
    return this.chat.chatTabs.filter((tab) => !tab.isSystemTab);
  });

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

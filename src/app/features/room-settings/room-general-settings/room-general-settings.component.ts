import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DiceBotCatalogService } from '@axe/application/dice/dice-bot-catalog.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import {
  ControllerResourcePick,
  controllerShowsResource,
  pickControllerResource,
} from '@axe/domain/character/controller-resource-pick';
import { GameCharacter } from '@axe/domain/character/game-character';
import { type ResourceCatalogEntry, resourceCatalogOf } from '@axe/domain/character/resource-catalog';
import { DataSummarySetting } from '@axe/domain/data/data-summary-setting';
import { asDiceStage, DICE_STAGES, DiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { Config } from '@axe/domain/peer/config';
import { RoomSettingsAccessService } from '@axe/features/room-settings/room-settings-access.service';
import { NgSelectWindowDirective } from '@axe/ui/directives/ng-select-window.directive';
import { TranslocoModule } from '@jsverse/transloco';
import { NgOptionComponent, NgSelectComponent } from '@ng-select/ng-select';

/**
 * The general part of the room settings: the dice the room rolls with and where they tumble, the
 * bubbles over the pieces, and the items the remotes show. Only the master changes any of them.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'room-general-settings',
  templateUrl: './room-general-settings.component.html',
  host: { class: 'contents' },
  imports: [FormsModule, NgSelectComponent, NgOptionComponent, NgSelectWindowDirective, TranslocoModule],
})
export class RoomGeneralSettingsComponent {
  private readonly access = inject(RoomSettingsAccessService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly diceBotCatalog = inject(DiceBotCatalogService);

  readonly isSharedReadOnly = this.access.isSharedReadOnly;

  /** The dice bots there are to choose the room's default from. */
  get diceBotInfos() {
    return this.diceBotCatalog.infos();
  }

  /** The dice bot everyone joining the room starts on. */
  readonly defaultDiceBot = this.access.configField('defaultDiceBot', 'shared');

  /**
   * Loads a dice bot as soon as it is picked, by fetching its help text in the background; the text
   * itself is not used here.
   */
  loadDiceBot(gameType: string): void {
    DiceBot.getHelpMessage(gameType).then(() => {});
  }

  /** Where the room can have its rolls' dice tumble. */
  readonly diceStages: readonly DiceStage[] = DICE_STAGES;

  /** Where the room has its rolls' dice tumble. */
  readonly diceStage = this.access.configField('diceStage', 'shared', asDiceStage);

  /** Whether what a character says shows in a bubble over its piece. */
  readonly speechBubbles = this.access.configField('speechBubblesEnabled', 'shared');

  /**
   * Every value and resource the pieces in the room carry, by name, which is what a remote could
   * offer to show.
   *
   * It is the list a remote builds its buttons from, taken over every piece rather than the ones
   * being worked on, so an item only an enemy in the graveyard carries can be picked too.
   */
  readonly controllerResourceChoices = computed<ResourceCatalogEntry[]>(() => {
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    this.objectChange.collectionOf('data')();
    this.objectChange.versionOf(DataSummarySetting.instance.identifier)();
    const characters = this.objectStore.getObjects(GameCharacter);
    for (const character of characters) this.objectChange.versionOf(character.identifier)();
    return resourceCatalogOf(characters, { listFirst: DataSummarySetting.instance.dataTags });
  });

  /** The items the room lets its remotes show, or null while it shows every one. */
  readonly controllerResourcePick = computed<ControllerResourcePick>(() => this.access.config().controllerResources);

  /** Whether the remotes show the item with this name. */
  showsControllerResource(name: string): boolean {
    return controllerShowsResource(this.controllerResourcePick(), name);
  }

  /** Shows or hides one item on every remote in the room; only the master can. */
  setControllerResourceShown(name: string, shown: boolean): void {
    if (this.isSharedReadOnly()) return;
    const offered = this.controllerResourceChoices().map((choice) => choice.name);
    Config.instance.controllerResources = pickControllerResource(this.controllerResourcePick(), name, shown, offered);
  }

  /** Lets the remotes show every item again, one written onto a sheet later included. */
  showEveryControllerResource(): void {
    if (this.isSharedReadOnly()) return;
    Config.instance.controllerResources = null;
  }

  /** Takes every item off the remotes until some are picked again. */
  hideEveryControllerResource(): void {
    if (this.isSharedReadOnly()) return;
    Config.instance.controllerResources = [];
  }
}

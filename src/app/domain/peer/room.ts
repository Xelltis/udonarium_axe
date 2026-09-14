import { networkSend } from '@axe/core/network/network-messaging';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { SyncObject } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Coin } from '@axe/domain/coin/coin';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { DiceTable } from '@axe/domain/dice/dice-table';
import { createDefaultEffectPresets } from '@axe/domain/effect/builtin-effect-presets';
import { EffectField } from '@axe/domain/effect/effect-field';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { createDefaultCutIns } from '@axe/domain/media/builtin-cut-ins';
import { CutIn } from '@axe/domain/media/cut-in';
import { Party } from '@axe/domain/party/party';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { GameTableScratchMask } from '@axe/domain/tabletop/game-table-scratch-mask';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { clearOwnership } from '@axe/domain/tabletop/ownership';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';

@SyncObject('room')
export class Room extends GameObject implements InnerXml {
  // GameObject Lifecycle
  /** A room only wraps a save file, so it takes itself back out of the object store and is never synced. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this); // ObjectStoreには登録しない
  }

  /** The shared check that asks before a loaded room overwrites the one in play. */
  get reloadCheck(): ReloadCheck {
    return ObjectStore.instance.get<ReloadCheck>('ReloadCheck')!;
  }

  /**
   * Writes everything on the table into the save file: tables, parties, characters, ranges, lights, notes,
   * card stacks, loose cards, dice, coins, cut-ins, dice tables, effect presets and effect fields.
   *
   * Cards inside a stack are written with their stack.
   */
  innerXml(): string {
    let xml = '';
    const objects: GameObject[] = [
      ...ObjectStore.instance.getObjects(GameTable),
      ...ObjectStore.instance.getObjects(Party),
      ...ObjectStore.instance.getObjects(GameCharacter),
      ...ObjectStore.instance.getObjects(RangeArea),
      ...ObjectStore.instance.getObjects(LightSource),
      ...ObjectStore.instance.getObjects(TextNote),
      ...ObjectStore.instance.getObjects(CardStack),
      ...ObjectStore.instance.getObjects(Card).filter((obj) => {
        return obj.parent === null;
      }),
      ...ObjectStore.instance.getObjects(DiceSymbol),
      ...ObjectStore.instance.getObjects(Coin),
      ...ObjectStore.instance.getObjects(CutIn),
      ...ObjectStore.instance.getObjects(DiceTable),
      ...ObjectStore.instance.getObjects(EffectPreset),
      ...ObjectStore.instance.getObjects(EffectField),
    ];

    for (const object of objects) {
      xml += object.toXml();
    }
    return xml;
  }

  /**
   * Replaces the room in play with a loaded one, once the user agrees to overwrite it.
   *
   * Destroys the current tables and everything on them, then reads in the saved objects. Effect presets and
   * cut-ins are kept when the save carries none, the default sets are made when neither side has any, and every
   * peek or hold on an object is cleared. Declining leaves the room untouched.
   */
  parseInnerXml(element: Element) {
    // Deleted and put back under the same identifiers, the others refuse them as the return of
    // what was deleted, and only whoever loaded the room still has them. So what is made under
    // a fixed identifier is left alone by a room that brings none of its own: the effect
    // library, which belongs to the toolbox rather than the table, and the sample cut-ins,
    // which a room saved before they existed knows nothing about.
    const brings = (aliasName: string): boolean =>
      Array.from(element.children).some((child) => child.nodeName === aliasName);
    const bringsPresets = brings(EffectPreset.aliasName);
    const bringsCutIns = brings(CutIn.aliasName);
    const objects: GameObject[] = [
      ...ObjectStore.instance.getObjects(GameTable),
      ...ObjectStore.instance.getObjects(GameTableMask),
      ...ObjectStore.instance.getObjects(GameTableScratchMask),
      ...ObjectStore.instance.getObjects(Terrain),
      ...ObjectStore.instance.getObjects(TableAmbience),
      ...ObjectStore.instance.getObjects(Party),
      ...ObjectStore.instance.getObjects(GameCharacter),
      ...ObjectStore.instance.getObjects(RangeArea),
      ...ObjectStore.instance.getObjects(LightSource),
      ...ObjectStore.instance.getObjects(TextNote),
      ...ObjectStore.instance.getObjects(CardStack),
      ...ObjectStore.instance.getObjects(Card),
      ...ObjectStore.instance.getObjects(DiceSymbol),
      ...ObjectStore.instance.getObjects(Coin),
      ...(bringsCutIns ? ObjectStore.instance.getObjects(CutIn) : []),
      ...ObjectStore.instance.getObjects(DiceTable),
      ...(bringsPresets ? ObjectStore.instance.getObjects(EffectPreset) : []),
      ...ObjectStore.instance.getObjects(EffectField),
    ];

    const reLoadOk = this.reloadCheck.answerCheck();
    if (reLoadOk) {
      for (const object of objects) {
        object.destroy();
      }
      this.announceWhatIsComingBack(element);
      for (let i = 0; i < element.children.length; i++) {
        ObjectSerializer.instance.parseXml(element.children[i]);
      }
      // The usual set is made only when there are none here and none brought in.
      if (ObjectStore.instance.getObjects(EffectPreset).length < 1) createDefaultEffectPresets();
      if (ObjectStore.instance.getObjects(CutIn).length < 1) createDefaultCutIns(ImageStorage.instance);
      clearOwnership(ObjectStore.instance.getObjects());
    }
  }

  /**
   * Says which names the room is bringing back, having just taken them away.
   *
   * Most of what a room carries is made afresh under a name of its own, and nobody minds. What
   * it carries under a name of its own keeping - the effect library, the sample cut-ins - was
   * deleted a moment ago in front of everybody, and a seat that watched that answers the first
   * word of it by having the loader delete it again. Naming them first is what stops that.
   */
  private announceWhatIsComingBack(element: Element): void {
    const returning = Array.from(element.querySelectorAll('[identifier]'))
      .map((child) => child.getAttribute('identifier') ?? '')
      .filter((identifier) => identifier.length > 0);
    if (returning.length < 1) return;

    ObjectStore.instance.forgetDeleted(returning);
    networkSend('FORGET_DELETED_OBJECTS', { identifiers: returning });
  }
}

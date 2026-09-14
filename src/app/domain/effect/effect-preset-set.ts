import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml, ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { takeIntoLibrary } from '@axe/domain/effect/effect-preset-merge';

/**
 * Carrying effects out and in, whether the whole shelf or one off it.
 *
 * It is the holder for handing them on rather than the whole room, and it is not kept in
 * the store; it exists across the export and the import alone.
 */
@SyncObject('effect-preset-set')
export class EffectPresetSet extends ObjectNode implements InnerXml {
  /** What to carry out. Null for the whole shelf, which is what the panel hands on. */
  private members: readonly EffectPreset[] | null = null;

  /** Carries the effects it was given rather than everything on the shelf. */
  static of(presets: readonly EffectPreset[]): EffectPresetSet {
    const set = new EffectPresetSet();
    set.members = [...presets];
    return set;
  }

  // GameObject Lifecycle
  /** Takes the holder straight back out of the store, so it is never shared with the room. */
  override onStoreAdded() {
    super.onStoreAdded();
    ObjectStore.instance.remove(this);
  }

  /** The effects to write out: those it was given, or every effect on the shelf. */
  override innerXml(): string {
    return (this.members ?? EffectPreset.list()).map((preset) => preset.toXml()).join('');
  }

  /**
   * Reading them back in adds what is new and refreshes what is there.
   *
   * Nothing already on the shelf is removed. An effect lands on itself where it is already
   * there and on the effect of its name where it is not, so the same file read twice leaves
   * one of each rather than two.
   */
  override parseInnerXml(element: Element) {
    for (const child of Array.from(element.children)) {
      const parsed = ObjectSerializer.instance.parseXml(child);
      if (parsed instanceof EffectPreset) takeIntoLibrary(parsed);
    }
  }
}

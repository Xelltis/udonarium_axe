import { SyncObject } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { formatStatusAilments, parseStatusAilments, StatusAilment } from '@axe/domain/character/status-ailment';

const CATALOG_IDENTIFIER = 'StatusAilmentCatalog';
/** The attribute that says whether putting a state on a piece plays the effect of the same name. */
const PLANT_EFFECT_ATTRIBUTE = 'plantEffect';

/**
 * The states a room keeps on hand, written one to a line.
 *
 * A node rather than a plain object because the list lives in the body of the element rather
 * than in an attribute: an attribute's newlines are folded into spaces when the xml is read
 * back, which would run every state onto one line.
 */
@SyncObject('status-ailment-catalog')
export class StatusAilmentCatalog extends ObjectNode {
  private static _instance: StatusAilmentCatalog | undefined;
  /**
   * The room's single catalog: the one in the object store, or one made and initialized under the
   * fixed identifier when there is none yet.
   */
  static get instance(): StatusAilmentCatalog {
    const stored = ObjectStore.instance.get<StatusAilmentCatalog>(CATALOG_IDENTIFIER);
    if (stored) return (StatusAilmentCatalog._instance = stored);
    if (!StatusAilmentCatalog._instance) StatusAilmentCatalog._instance = new StatusAilmentCatalog(CATALOG_IDENTIFIER);
    StatusAilmentCatalog._instance.initialize();
    return StatusAilmentCatalog._instance;
  }

  /**
   * Lets go of the one held here as it leaves the store, so that the next reader is given one made
   * anew, as for a room just started, rather than this one put back as it was.
   */
  override onStoreRemoved() {
    super.onStoreRemoved();
    if (StatusAilmentCatalog._instance === this) StatusAilmentCatalog._instance = undefined;
  }

  /**
   * Forgets the catalog held here, so that the next reader is given one made anew.
   *
   * The catalog is held here as well as in the store, and one that never reached the store, or was
   * taken out of it some other way than by being removed, would be put back as it was the moment it
   * is read. Only a test between two of its own has any reason to say this.
   */
  static forget(): void {
    StatusAilmentCatalog._instance = undefined;
  }

  /**
   * The states the catalog holds, read from its one-to-a-line text. Assigning a list rewrites that
   * text, which travels with the room.
   */
  /**
   * The icons of the states, which may each name a picture; a save keeps the ones that do, so that a
   * state whose picture nothing else in the room uses comes back with it.
   */
  get carriedImageIdentifiers(): readonly string[] {
    return this.ailments.map((ailment) => ailment.icon.trim()).filter((icon) => icon.length > 0);
  }

  get ailments(): StatusAilment[] {
    return parseStatusAilments(`${this.value}`);
  }

  set ailments(list: readonly StatusAilment[]) {
    this.value = formatStatusAilments(list);
  }

  /**
   * Whether putting a state on a piece plays the effect of the same name over it.
   *
   * Off unless the room has asked for it, as a resource plays no effect unless its field asks: a
   * room saved before this could be asked reads as not having asked. It travels and is saved with
   * the catalog, as an attribute of it.
   */
  get playsEffectOnPlant(): boolean {
    return this.getAttribute(PLANT_EFFECT_ATTRIBUTE) === 'true';
  }

  set playsEffectOnPlant(plays: boolean) {
    if (plays === this.playsEffectOnPlant) return;
    this.setAttribute(PLANT_EFFECT_ATTRIBUTE, plays ? 'true' : 'false');
  }

  /**
   * Reads a catalog from room data into the room's existing catalog and destroys the copy that was
   * loaded, so there is only ever one.
   */
  override parseInnerXml(element: Element) {
    super.parseInnerXml(element);
    // Updates the one the room already has rather than standing beside it, as the summary
    // setting does: both are made under a fixed identifier before any room is loaded.
    const catalog = StatusAilmentCatalog.instance;
    if (catalog === this) return;
    catalog.value = this.value;
    catalog.playsEffectOnPlant = this.playsEffectOnPlant;
    catalog.update();
    this.destroy();
  }
}

import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { type CutInSound, parseCutInSounds } from '@axe/domain/media/cut-in-sound';

/**
 * The layers a cut-in is built from, and how long they run.
 *
 * The scene is a node of its own rather than something the cut-in became, because
 * changing what a CutIn descends from would change the shape of what travels between
 * peers, and a room holding both an old build and a new one would come apart. As a
 * child written inside `<cut-in>`, an older build simply ignores it.
 *
 * The tie to the cut-in is by identifier. A scene read back out of XML is bound to
 * whichever copy of the cut-in read it, because an identifier is never written out.
 */

export const MIN_SCENE_MS = 100;
export const MAX_SCENE_MS = 60_000;
export const DEFAULT_SCENE_MS = 3_000;

@SyncObject('cut-in-scene')
export class CutInScene extends ObjectNode {
  @SyncVar() cutInIdentifier: string = '';
  /** How long one pass lasts, in ms. */
  @SyncVar() durationMs: number = DEFAULT_SCENE_MS;
  /** Whether the scene runs again from the top. Separate from the cut-in's own loop, which is the audio's. */
  @SyncVar() sceneLoop: boolean = false;
  /** What lies behind the layers. Empty leaves the cut-in's own picture or video showing. */
  @SyncVar() backgroundColor: string = '';
  /** The sounds dropped along the scene's own clock, as JSON. */
  @SyncVar() sounds: string = '';

  private soundsRaw = '';
  private soundsParsed: CutInSound[] = [];

  /** Read once per change rather than once per frame, as a layer reads its tracks. */
  get soundList(): CutInSound[] {
    const raw = this.sounds ?? '';
    if (raw !== this.soundsRaw) {
      this.soundsRaw = raw;
      this.soundsParsed = parseCutInSounds(raw);
    }
    return this.soundsParsed;
  }

  /** The scene's layers, in the order they are drawn, bottom first. */
  get layers(): CutInLayer[] {
    return this.children.filter((child): child is CutInLayer => child instanceof CutInLayer);
  }

  /** How long the scene runs, never shorter than the layer that finishes last. */
  get runningMs(): number {
    const wanted = Number(this.durationMs);
    const asked = Number.isFinite(wanted) ? wanted : DEFAULT_SCENE_MS;
    const lastMoment = this.layers.reduce((last, layer) => Math.max(last, layer.lastMomentMs), 0);
    return Math.min(MAX_SCENE_MS, Math.max(MIN_SCENE_MS, asked, lastMoment));
  }

  /** The scene belonging to a cut-in, or none where it has never been given one. */
  static of(cutInIdentifier: string): CutInScene | null {
    if (!cutInIdentifier) return null;
    return (
      ObjectStore.instance.getObjects(CutInScene).find((scene) => scene.cutInIdentifier === cutInIdentifier) ?? null
    );
  }
}

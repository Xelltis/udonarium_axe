import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';

/**
 * A scene: how a table looks and what the room hears, kept to be put on in one go, such as the
 * village by day, the village by night and the village burning, all on the one map.
 *
 * Each part holds an empty string for "leave it as it is", so a scene says only what it changes.
 * The pictures are named in fields ending in `ImageIdentifier`, which is how a save finds the
 * pictures to carry, and `none` there takes the picture away. The parts are read through
 * `board-scene-parts`; a field a peer never sent reads as empty, and so as leaving the part alone.
 *
 * Only the game master sees and puts on scenes, though they reach everyone, as a switch on the
 * board may put one on for whoever presses it.
 */
@SyncObject('board-scene')
export class BoardScene extends GameObject {
  @SyncVar() name = '';
  /** The folder the scene is filed in, as a path such as `第1話/村`; empty for none. */
  @SyncVar() folderName = '';
  /** Where the scene stands in the list, smaller first. */
  @SyncVar() order = 0;

  /** The table shown: by identifier, else by name where exactly one table goes by it. */
  @SyncVar() tableIdentifier = '';
  @SyncVar() tableName = '';

  @SyncVar() floorImageIdentifier = '';
  @SyncVar() backgroundImageIdentifier = '';
  /** `none`, `white` or `black`. */
  @SyncVar() backgroundFilter = '';
  @SyncVar() northWallImageIdentifier = '';
  @SyncVar() eastWallImageIdentifier = '';
  @SyncVar() southWallImageIdentifier = '';
  @SyncVar() westWallImageIdentifier = '';
  /** Which walls stand, as JSON such as `{"north":true}`, the sides left out left alone. */
  @SyncVar() wallsShown = '';
  @SyncVar() foregroundImageIdentifier = '';
  /** From 0 to 1, written as text so that empty can leave it alone. */
  @SyncVar() foregroundOpacity = '';
  @SyncVar() foregroundFit = '';
  /** The weather, as JSON of its kind, colour and density; an empty kind clears the sky. */
  @SyncVar() weather = '';
  /** `on` or `off`. */
  @SyncVar() darkness = '';
  /** `on` or `off`. */
  @SyncVar() fog = '';

  /** `stop`, `track` (playing {@link bgmIdentifier}) or `playlist` (playing the playlist named below). */
  @SyncVar() bgm = '';
  @SyncVar() bgmIdentifier = '';
  @SyncVar() bgmPlaylistIdentifier = '';
  @SyncVar() bgmPlaylistName = '';
  /** `replace` (playing just the sounds in {@link bgsIdentifiers}) or `stop`. */
  @SyncVar() bgs = '';
  /** The background sounds, by identifier, separated by commas. */
  @SyncVar() bgsIdentifiers = '';
  /** Cut-ins to play, separated by commas; one of several is drawn. */
  @SyncVar() cutInIdentifiers = '';
  /** Which part of the day the story's clock goes to, by its place among the parts, written as text. */
  @SyncVar() clockPeriod = '';
  /** What is said in the chat as the scene is put on, written in the chat's own marks. */
  @SyncVar() text = '';
  /** The tab it is said in; empty for the first tab. */
  @SyncVar() textTab = '';
  /** `true` to darken every screen for a moment while the scene changes. */
  @SyncVar() fade = '';

  /** Every scene in the room, in the order of the list. */
  static all(): BoardScene[] {
    return ObjectStore.instance
      .getObjects(BoardScene)
      .sort(
        (a, b) =>
          (Number(a.order) || 0) - (Number(b.order) || 0) ||
          (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0)
      );
  }

  /** The place after the last scene in the list. */
  static nextOrder(): number {
    return BoardScene.all().reduce((last, scene) => Math.max(last, Number(scene.order) || 0), 0) + 1;
  }

  /** What a save writes of the scene, with its identifier, as a switch or a hotbar slot names it by that. */
  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  /** Reads the scene back from a save under the identifier written with it. */
  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes);
  }
}

/**
 * How a screen darkens while a scene changes: dark within the first span, the scene put on as it is,
 * kept dark a moment longer for the change to reach every screen, then light again.
 */
export const SCENE_FADE = { inMs: 300, holdMs: 250, outMs: 450 } as const;

/** The music a scene puts on: none, a track, or a playlist from its first track. */
export type SceneBgm =
  | { readonly mode: 'stop' }
  | { readonly mode: 'track'; readonly identifier: string }
  | { readonly mode: 'playlist'; readonly identifier: string; readonly name: string };

/** A field of a scene as text, trimmed; a field a peer never sent reads as empty. */
function sceneText(value: unknown): string {
  return `${value ?? ''}`.trim();
}

/** The music a scene puts on, or null where it leaves the music alone or names nothing to play. */
export function sceneBgmOf(
  scene: Pick<BoardScene, 'bgm' | 'bgmIdentifier' | 'bgmPlaylistIdentifier' | 'bgmPlaylistName'>
): SceneBgm | null {
  const mode = sceneText(scene.bgm);
  if (mode === 'stop') return { mode };
  if (mode === 'track') {
    const identifier = sceneText(scene.bgmIdentifier);
    return identifier ? { mode, identifier } : null;
  }
  if (mode === 'playlist') {
    const identifier = sceneText(scene.bgmPlaylistIdentifier);
    const name = sceneText(scene.bgmPlaylistName);
    return identifier || name ? { mode, identifier, name } : null;
  }
  return null;
}

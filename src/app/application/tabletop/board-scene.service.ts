import { inject, Injectable } from '@angular/core';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { callSceneFade, emitSelectGameTable } from '@axe/core/event/domain-events';
import { GameObject } from '@axe/core/sync/game-object';
import { isInStore, ObjectStore } from '@axe/core/sync/object-store';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { Jukebox } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { parseCutInIdentifiers, pickCutInIdentifier, rollCutIn } from '@axe/domain/media/table-cut-in';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { BoardScene } from '@axe/domain/scene/board-scene';
import {
  BOARD_SCENE_FIELDS,
  BOARD_SCENE_PART_FIELDS,
  type BoardSceneFields,
  captureTableLook,
  SCENE_FADE,
  type SceneBgm,
  sceneBgmOf,
  type SceneBgs,
  sceneBgsOf,
  scenePartsOf,
  scenePeriodOf,
  sceneTableWrites,
} from '@axe/domain/scene/board-scene-parts';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';

/** What putting a scene on leaves out, and on whose word it is put on. */
export interface BoardSceneApplyOptions {
  /** False to leave the room's music as it is. */
  readonly bgm?: boolean;
  /** False to say nothing in the chat. */
  readonly text?: boolean;
  /** Put on by a switch the game master set up, for whoever pressed it, rather than by the master. */
  readonly trusted?: boolean;
}

/**
 * Puts scenes on, and makes them from the table as it stands. Only the game master does either,
 * but a switch the master set on the board puts its scene on for whoever presses it.
 *
 * A scene is put on in one go, with nothing awaited between: the table it shows is found first,
 * the look written to that table, then the table shown, then the sounds, the cut-in and the
 * story's clock, all in one batch, so the room never sees the old table in the new look. What the
 * scene says in the chat follows, after the new look.
 */
@Injectable({ providedIn: 'root' })
export class BoardSceneService {
  private readonly objectStore = inject(ObjectStore);
  private readonly permission = inject(RolePermissionService);
  private readonly cutIns = inject(CutInService);
  private readonly clock = inject(GameClockService);
  private readonly chat = inject(ChatMessageService);

  /** Whether this seat may put scenes on and make them, which only the game master does. */
  canUse(): boolean {
    return this.permission.isGameMaster();
  }

  /**
   * Puts a scene on, leaving out the music or the words where asked. A part naming something no
   * longer here, such as a deleted cut-in, is passed over. A scene whose table is gone writes its
   * look nowhere, rather than over the table being shown. A scene that fades darkens every screen
   * first and is put on once they are dark. Answers whether it was put on.
   */
  apply(scene: BoardScene, options: BoardSceneApplyOptions = {}): boolean {
    if (options.trusted ? PeerCursor.isMyselfKeptOffTable : !this.canUse()) return false;
    if (`${scene.fade ?? ''}` !== 'true') {
      this.putOn(scene, options);
      return true;
    }
    callSceneFade();
    setTimeout(() => {
      if (isInStore(scene)) this.putOn(scene, options);
    }, SCENE_FADE.inMs);
    return true;
  }

  /** Puts a scene on at once, as {@link apply} describes. */
  private putOn(scene: BoardScene, options: BoardSceneApplyOptions): void {
    const selecter = TableSelecter.instance;
    const named = this.tableOf(scene);
    const namesTable = `${scene.tableIdentifier ?? ''}`.trim() !== '' || `${scene.tableName ?? ''}`.trim() !== '';
    const table = named ?? (namesTable ? null : selecter.viewTable);
    const shows = named !== null && named.identifier !== selecter.viewTableIdentifier;
    const mayWrite = this.canUse() || options.trusted === true;
    const bgm = options.bgm === false ? null : sceneBgmOf(scene);
    const bgs = sceneBgsOf(scene);
    const cutIn = this.cutInOf(scene);
    const period = scenePeriodOf(scene.clockPeriod);

    GameObject.batch(() => {
      if (table) Object.assign(table, sceneTableWrites(scene, table));
      if (shows) emitSelectGameTable({ identifier: named.identifier });
      if (bgs) this.putOnBackgroundSounds(bgs);
      if (bgm) this.putOnMusic(bgm);
      if (cutIn) this.cutIns.launch(cutIn);
      if (period !== null) this.clock.setPeriod(period, { trusted: options.trusted });
      if (named && this.canUse()) this.settleTable(scene, named);
      if (mayWrite) Config.instance.boardScene = scene.identifier;
    });
    if (options.text !== false) this.say(scene);
  }

  /** Makes a scene of the table as it stands and what the room hears, under a name, last in the list. */
  create(name: string, folderName = ''): BoardScene | null {
    if (!this.canUse()) return null;
    const scene = new BoardScene();
    Object.assign(scene, this.capture());
    scene.name = name;
    scene.folderName = folderName;
    scene.order = BoardScene.nextOrder();
    scene.initialize();
    return scene;
  }

  /**
   * Writes the table as it stands, and what the room hears, over the parts the scene changes,
   * keeping its name, its words, its cut-ins and the rest. Music or sounds the room is not playing
   * now leave the scene's own as they were.
   */
  overwrite(scene: BoardScene): void {
    if (!this.canUse()) return;
    const now = this.capture();
    const parts = new Set(scenePartsOf(scene));
    const take = (fields: readonly (keyof BoardSceneFields)[]) => {
      for (const field of fields) {
        if (now[field] !== undefined) (scene as unknown as Record<string, unknown>)[field] = now[field];
      }
    };
    GameObject.batch(() => {
      for (const part of parts) {
        if (part === 'bgm' && !now.bgm) continue;
        if (part === 'bgs' && !now.bgs) continue;
        take(BOARD_SCENE_PART_FIELDS[part]);
      }
    });
  }

  /** Makes a copy of a scene under another name, just after the last in the list. */
  duplicate(scene: BoardScene, name: string): BoardScene | null {
    if (!this.canUse()) return null;
    const copy = new BoardScene();
    for (const field of BOARD_SCENE_FIELDS) (copy as unknown as Record<string, unknown>)[field] = scene[field];
    copy.name = name;
    copy.order = BoardScene.nextOrder();
    copy.initialize();
    return copy;
  }

  /** The scene of a name, by identifier first and then by a name only one scene goes by. */
  sceneNamed(identifier: string, name: string): BoardScene | null {
    return findByReference(BoardScene.all(), identifier, name)?.thing ?? null;
  }

  /**
   * The table as it stands and what the room hears, as the fields of a scene: the table shown and
   * every part of its look, and the music and background sounds only where the room plays any.
   */
  capture(): Partial<BoardSceneFields> {
    const table = TableSelecter.instance.viewTable;
    const fields: Partial<BoardSceneFields> = table
      ? { tableIdentifier: table.identifier, tableName: table.name, ...captureTableLook(table) }
      : {};
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (jukebox && jukebox.isPlaying === true && jukebox.audioIdentifier) {
      const chosen = jukebox.playlistIdentifier ? jukebox.playlist : null;
      if (chosen && !chosen.isDefault && chosen.hasEntry(jukebox.audioIdentifier)) {
        Object.assign(fields, {
          bgm: 'playlist',
          bgmIdentifier: '',
          bgmPlaylistIdentifier: chosen.identifier,
          bgmPlaylistName: chosen.name ?? '',
        });
      } else {
        Object.assign(fields, {
          bgm: 'track',
          bgmIdentifier: jukebox.audioIdentifier,
          bgmPlaylistIdentifier: '',
          bgmPlaylistName: '',
        });
      }
    }
    const sounds = BackgroundSound.playing().map((sound) => sound.audioIdentifier);
    if (sounds.length > 0) Object.assign(fields, { bgs: 'replace', bgsIdentifiers: sounds.join(',') });
    return fields;
  }

  /**
   * Has the scene name its table as it is now: by the identifier it goes by here, for a scene that
   * found it by name, as after a save read back, and by the name it goes by now, renamed since.
   */
  private settleTable(scene: BoardScene, table: GameTable): void {
    if (scene.tableIdentifier !== table.identifier) scene.tableIdentifier = table.identifier;
    if (scene.tableName !== table.name) scene.tableName = table.name;
  }

  private tableOf(scene: BoardScene): GameTable | null {
    return (
      findByReference(this.objectStore.getObjects(GameTable), scene.tableIdentifier, scene.tableName)?.thing ?? null
    );
  }

  private cutInOf(scene: BoardScene): CutIn | null {
    const identifiers = parseCutInIdentifiers(scene.cutInIdentifiers);
    const picked = pickCutInIdentifier(identifiers, (id) => this.objectStore.get(id) instanceof CutIn, rollCutIn);
    return picked ? this.objectStore.get<CutIn>(picked) : null;
  }

  /** Stops the background sounds the scene does not name, and starts those it names that are not on. */
  private putOnBackgroundSounds(bgs: SceneBgs): void {
    const kept = new Set(bgs.mode === 'replace' ? bgs.identifiers : []);
    for (const sound of BackgroundSound.playing()) {
      if (!kept.has(sound.audioIdentifier)) sound.stop();
    }
    for (const identifier of kept) {
      if (!BackgroundSound.of(identifier)?.isOn) BackgroundSound.start(identifier);
    }
  }

  /**
   * Puts the scene's music on, leaving a track already playing to go on rather than start again,
   * and a playlist already playing through to go on with it.
   */
  private putOnMusic(bgm: SceneBgm): void {
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (!jukebox) return;
    const launcher = this.objectStore.get<CutInLauncher>('CutInLauncher');
    if (bgm.mode === 'stop') {
      if (jukebox.isPlaying === true || jukebox.audioIdentifier) jukebox.stop();
      return;
    }
    if (bgm.mode === 'track') {
      if (jukebox.audioIdentifier === bgm.identifier) {
        if (jukebox.isPlaying !== true) jukebox.resume();
        return;
      }
      if (!isMusic(bgm.identifier)) return;
      launcher?.stopBlankTagCutIn();
      jukebox.play(bgm.identifier);
      return;
    }
    const playlist = findByReference(Playlist.all(), bgm.identifier, bgm.name)?.thing ?? null;
    if (!playlist || playlist.entries.length < 1) return;
    const goesOn =
      jukebox.isPlaying === true &&
      jukebox.playlist?.identifier === playlist.identifier &&
      jukebox.queue.includes(jukebox.audioIdentifier);
    if (goesOn) return;
    launcher?.stopBlankTagCutIn();
    jukebox.playPlaylist(playlist);
  }

  /** Says the scene's words in its tab, or in the first tab where it names none still here. */
  private say(scene: BoardScene): void {
    const words = `${scene.text ?? ''}`.trim();
    if (words.length < 1) return;
    const tabs = ChatTabList.instance.chatTabs;
    const tab = tabs.find((candidate) => candidate.identifier === scene.textTab) ?? tabs[0];
    if (tab) this.chat.sendVerbatim(tab, words, { kind: 'system' });
  }
}

/** Whether a sound is the room's music rather than a sound effect or a background sound. */
function isMusic(identifier: string): boolean {
  const tag = AudioTag.get(identifier)?.tag ?? 'BGM';
  return tag !== 'SE' && tag !== AUDIO_TAG_BGS;
}

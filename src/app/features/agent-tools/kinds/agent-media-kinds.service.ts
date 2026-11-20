import { inject, Injectable } from '@angular/core';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { CutInSizingService } from '@axe/application/media/cut-in-sizing.service';
import { PictureSizeService } from '@axe/application/media/picture-size.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import { getMyPeerId } from '@axe/core/network/peer-context-source';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { AILMENT_LOOKS } from '@axe/domain/effect/ailment-looks';
import { BEAM_LOOKS } from '@axe/domain/effect/beam-looks';
import { EFFECT_KINDS, type EffectKind, PROJECTILE_STYLES } from '@axe/domain/effect/effect-kind';
import { EFFECT_MOTE_OPTIONS } from '@axe/domain/effect/effect-motes';
import { BoundedPresetNumber, EffectPreset, PRESET_NUMBER_BOUNDS } from '@axe/domain/effect/effect-preset';
import { EFFECT_TARGETING_OPTIONS, SLASH_STYLE_OPTIONS } from '@axe/domain/effect/effect-preset-form';
import {
  EFFECT_STAGE_ROLES,
  type EffectStage,
  encodeEffectStages,
  MAX_BRANCHES,
  MAX_STAGE_MS,
  MAX_STAGES,
  MIN_STAGE_MS,
} from '@axe/domain/effect/effect-stage';
import { kindsForRole } from '@axe/domain/effect/effect-stage-form';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { defaultCutInIdentifiers } from '@axe/domain/media/builtin-cut-ins';
import { CUT_IN_EASING_NAMES, type CutInEasingName, DEFAULT_CUT_IN_EASING } from '@axe/domain/media/cubic-bezier';
import { CutIn } from '@axe/domain/media/cut-in';
import {
  applyEntrance,
  applyExit,
  CUT_IN_ENTRANCES,
  CUT_IN_EXITS,
  type CutInEntrance,
  type CutInExit,
  DEFAULT_PRESET_MS,
} from '@axe/domain/media/cut-in-animation-presets';
import { CUT_IN_CLIPS, type CutInClip } from '@axe/domain/media/cut-in-clip';
import { CUT_IN_EFFECTS, type CutInEffect } from '@axe/domain/media/cut-in-effect';
import {
  CUT_IN_FILL_SHAPES,
  type CutInFillShape,
  MAX_FILL_SCALE_PX,
  MIN_FILL_SCALE_PX,
} from '@axe/domain/media/cut-in-fill';
import {
  CUT_IN_TRACKS,
  type CutInKey,
  type CutInTrackName,
  type CutInTrackSet,
  encodeCutInTracks,
  MAX_KEYS_PER_TRACK,
} from '@axe/domain/media/cut-in-keyframe';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import {
  CUT_IN_LAYER_KINDS,
  CUT_IN_TEXT_ALIGNS,
  CutInLayer,
  type CutInLayerKind,
  type CutInTextAlign,
} from '@axe/domain/media/cut-in-layer';
import { applyLayerPreset, CUT_IN_LAYER_PRESETS } from '@axe/domain/media/cut-in-layer-presets';
import {
  LETTER_DURATION_MAX_MS,
  LETTER_DURATION_MIN_MS,
  LETTER_MOTIONS,
  LETTER_STAGGER_MAX_MS,
} from '@axe/domain/media/cut-in-letter-motion';
import { CutInScene, MAX_SCENE_MS, MIN_SCENE_MS } from '@axe/domain/media/cut-in-scene';
import { sceneDurationOf } from '@axe/domain/media/cut-in-scene-timeline';
import { type CutInSound, encodeCutInSounds, MAX_SOUNDS } from '@axe/domain/media/cut-in-sound';
import { SPEAKER_NAME_TOKEN } from '@axe/domain/media/cut-in-speaker';
import { CUT_IN_WIPES, type CutInWipe } from '@axe/domain/media/cut-in-wipe';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Jukebox, type RepeatMode } from '@axe/domain/media/jukebox';
import { Playlist } from '@axe/domain/media/playlist';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { VN_STAGE_TRANSITIONS, VnStage, vnStageOf, type VnStageTransition } from '@axe/domain/visual-novel/vn-stage';
import { findOne } from '@axe/features/agent-tools/agent-lookup';
import {
  type AgentArgs,
  type AgentKind,
  type AgentKindField,
  type AnyAgentKind,
  anyKind,
  choiceField,
  flagField,
  numberField,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';
import { BackgroundSoundPlaybackService } from '@axe/features/media/background-sound-playback.service';
import {
  addLayer,
  duplicateLayer,
  ensureScene,
  removeLayer,
  reorderLayers,
} from '@axe/features/media/cut-in-editor/cut-in-editor-ops';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';

/** The picture a cut-in made on the screen starts with. */
const NEW_CUT_IN_PICTURE = 'testTableBackgroundImage_image';

/** The name of each kind of layer a new one is given, by its translation key. */
const NEW_LAYER_NAMES: Readonly<Record<CutInLayerKind, string>> = {
  image: 'feature.media.cutInEditor.newImageLayer',
  text: 'feature.media.cutInEditor.newTextLayer',
  fill: 'feature.media.cutInEditor.newFillLayer',
};

/** A reference to a cut-in, as the kinds that hang off one take it. */
const CUT_IN_REFERENCE: AgentSchema = { type: 'string', description: 'The cut-in, by id or name.', minLength: 1 };

/** A reference to a sound of the room's library, as the actions that take one take it. */
const TRACK_REFERENCE: AgentSchema = {
  type: 'string',
  description: 'The sound, by id or name (see list_assets).',
  minLength: 1,
};

/** A place in an order, counted from 1. */
const POSITION: AgentSchema = { type: 'integer', minimum: 1, description: 'The place to move it to, counted from 1.' };

/** A sound dropped along a cut-in scene's own clock, as the AI reads and writes one. */
const SCENE_SOUND: AgentSchema = {
  type: 'object',
  properties: {
    at_ms: { type: 'integer', minimum: 0, description: 'When it sounds, in ms from the start of the scene.' },
    sound: { type: 'string', minLength: 1, description: 'The sound, by id or name.' },
    volume: { type: 'integer', minimum: 0, maximum: 100, description: 'How loud, from 0 to 100.' },
  },
  required: ['at_ms', 'sound'],
  additionalProperties: false,
};

/** The keys one property of a cut-in layer moves along. */
const TRACK_KEYS: AgentSchema = {
  type: 'array',
  maxItems: MAX_KEYS_PER_TRACK,
  items: {
    type: 'object',
    properties: {
      at_ms: { type: 'integer', minimum: 0, description: 'When, in ms from the start of the scene.' },
      value: { type: 'number', description: 'The value at that moment.' },
      easing: {
        type: 'string',
        enum: CUT_IN_EASING_NAMES,
        description: `The curve from this key into the next; ${DEFAULT_CUT_IN_EASING} when left out.`,
      },
    },
    required: ['at_ms', 'value'],
    additionalProperties: false,
  },
};

/** A stage of an effect preset's run, and the stages a spawn throws, which may not spawn again. */
function stageSchema(allowSpawn: boolean): AgentSchema {
  const roles = allowSpawn ? EFFECT_STAGE_ROLES : EFFECT_STAGE_ROLES.filter((role) => role !== 'spawn');
  return {
    type: 'object',
    properties: {
      role: { type: 'string', enum: roles, description: 'travel flies from the caster; the others land.' },
      kind: { type: 'string', enum: EFFECT_KINDS, description: 'The look this stage draws.' },
      durationMs: { type: 'integer', minimum: MIN_STAGE_MS, maximum: MAX_STAGE_MS },
      scale: { type: 'number', minimum: 0.01, maximum: 8 },
      grade: { type: 'integer', minimum: 1, maximum: 3 },
      colorPrimary: { type: 'string', maxLength: 50 },
      colorSecondary: { type: 'string', maxLength: 50 },
      ...(allowSpawn
        ? {
            branches: {
              type: 'integer',
              minimum: 2,
              maximum: MAX_BRANCHES,
              description: 'How many ways a spawn throws.',
            },
            spreadDeg: { type: 'integer', minimum: 10, maximum: 360, description: 'How wide a spawn throws.' },
            children: {
              type: 'array',
              maxItems: MAX_STAGES,
              items: stageSchema(false),
              description: 'What each branch of a spawn goes on to do, in order.',
            },
          }
        : {}),
    },
    required: ['role', 'kind', 'durationMs'],
    additionalProperties: false,
  };
}

/** One of the room's ambient sounds: a sound of the library tagged as one, or one playing as one. */
interface AmbientSound {
  readonly audioIdentifier: string;
}

/** What the room's music is doing, as the AI reads it. */
type MusicState = 'playing' | 'paused' | 'stopped';

/** The repeat modes, in the order the screen's button steps through them. */
const REPEAT_MODES: readonly RepeatMode[] = ['none', 'all', 'one'];

/**
 * The kinds of what is seen and heard: cut-ins with their scenes and layers, the visual novel stage, the
 * jukebox, ambient sounds, playlists and effect presets, as the AI link's generic tools offer them. Each is
 * changed through what the screen's own controls go through, and what plays for the room is started by an
 * action, as a field written would not start it on the writer's own screen.
 */
/** The fields of a cut-in that size it, which its picture's own size is read for first. */
const SIZING_FIELDS: readonly string[] = [
  'picture',
  'video',
  'video_url',
  'original_size',
  'keep_aspect',
  'width',
  'height',
];

@Injectable({ providedIn: 'root' })
export class AgentMediaKinds {
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);
  private readonly cutIns = inject(CutInService);
  private readonly music = inject(JukeboxPlaybackService);
  private readonly ambient = inject(BackgroundSoundPlaybackService);
  private readonly effects = inject(EffectLibraryService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly pictureSizes = inject(PictureSizeService);
  private readonly sizing = inject(CutInSizingService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly t = inject(TRANSLATE_FN);

  /** The identifiers the sample cut-ins, their scenes and their layers are made under. */
  private readonly builtIn = new Set(defaultCutInIdentifiers());

  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.cutIn()),
    anyKind(this.cutInScene()),
    anyKind(this.cutInLayer()),
    anyKind(this.vnStage()),
    anyKind(this.jukebox()),
    anyKind(this.backgroundSound()),
    anyKind(this.playlist()),
    anyKind(this.effectPreset()),
  ];

  /**
   * The reading of the pictures a cut-in's size is worked from, where a call writes a field that sizes
   * it (`SIZING_FIELDS`, see `CutInSizingService`) on one that follows its own proportions or size, or
   * will: the one it shows and the one it is given, those not read yet; null where none has to be read
   * first (see `PictureSizeService`), so the call answers with the size it comes to.
   */
  private picturesSized(cutIn: CutIn | null, fields: Readonly<Record<string, unknown>>): Promise<unknown> | null {
    if (!SIZING_FIELDS.some((name) => name in fields)) return null;
    const followsOwn =
      !cutIn ||
      cutIn.keepImageAspect ||
      cutIn.originalSize ||
      fields['keep_aspect'] === true ||
      fields['original_size'] === true ||
      'video' in fields ||
      'video_url' in fields;
    if (!followsOwn) return null;
    const unread = [cutIn?.imageIdentifier ?? '', this.pictureOrNone(fields['picture'])]
      .map((identifier) => (identifier ? (this.imageStorage.get(identifier)?.url ?? '') : ''))
      .filter((url) => url && !this.pictureSizes.sizeOf(url));
    return unread.length > 0 ? Promise.all(unread.map((url) => this.pictureSizes.read(url))) : null;
  }

  /** The picture a reference names, or none where it is no text or names none, which its field refuses in turn. */
  private pictureOrNone(reference: unknown): string {
    if (typeof reference !== 'string') return '';
    try {
      return this.picture(reference);
    } catch (error) {
      if (error instanceof AgentToolError) return '';
      throw error;
    }
  }

  /**
   * The picture a reference names among those this seat may come across, as the screen's picker lists
   * them; empty for none.
   */
  private picture(reference: string): string {
    if (!reference.trim()) return '';
    return findOne(
      ImageTag.searchImages([], this.tagLock.sight()),
      reference,
      (image) => image.identifier,
      (image) => image.name,
      'picture'
    ).identifier;
  }

  /** The sound a reference names among the library's sounds the screen lists, which leaves out its own. */
  private listedSound(reference: string): AudioFile {
    return findOne(
      this.audioStorage.audios.filter((audio) => !audio.isHidden),
      reference,
      (audio) => audio.identifier,
      (audio) => audio.name,
      'sound'
    );
  }

  /** The sound a reference names among every sound the room holds, its own built-in ones included. */
  private anySound(reference: string): AudioFile {
    return findOne(
      this.audioStorage.audios,
      reference,
      (audio) => audio.identifier,
      (audio) => audio.name,
      'sound'
    );
  }

  private soundName(identifier: string): string {
    return this.audioStorage.get(identifier)?.name ?? '';
  }

  private cutInNamed(reference: string): CutIn {
    return findOne(
      this.objectStore.getObjects<CutIn>(CutIn),
      reference,
      (cutIn) => cutIn.identifier,
      (cutIn) => cutIn.name,
      'cut-in'
    );
  }

  private ownerOf(scene: CutInScene): CutIn | null {
    const owner = this.objectStore.get(scene.cutInIdentifier);
    return owner instanceof CutIn ? owner : null;
  }

  private sceneOf(layer: CutInLayer): CutInScene | null {
    return layer.parent instanceof CutInScene ? layer.parent : null;
  }

  private cutInOf(layer: CutInLayer): CutIn | null {
    const scene = this.sceneOf(layer);
    return scene ? this.ownerOf(scene) : null;
  }

  private cutIn(): AgentKind<CutIn> {
    const isVideo = (cutIn: CutIn) => cutIn.playsVideo;
    const sizeFollowsPicture = (cutIn: CutIn) =>
      cutIn.originalSize ? 'Its size follows its own picture while original_size is on; turn that off first.' : null;
    const resizingOnKindChange = (cutIn: CutIn, write: () => void) => this.sizing.changeKind(cutIn, write);
    const setWidth = (cutIn: CutIn, value: number) => this.sizing.resize(cutIn, 'width', value);
    const setHeight = (cutIn: CutIn, value: number) => this.sizing.resize(cutIn, 'height', value);
    const sizeRefusal = (side: 'wide' | 'tall') => (cutIn: CutIn, value: unknown) => {
      const followed = sizeFollowsPicture(cutIn);
      if (followed) return followed;
      const video = isVideo(cutIn);
      const least = side === 'wide' ? cutIn.minSizeWidth(video) : cutIn.minSizeHeight(video);
      const most = side === 'wide' ? cutIn.maxSizeWidth(video) : cutIn.maxSizeHeight(video);
      const size = value as number;
      return size < least || size > most
        ? `A ${video ? 'video' : 'picture'} cut-in is ${least} to ${most} pixels ${side}.`
        : null;
    };
    return {
      kind: CutIn.aliasName,
      description:
        "A cut-in: a picture or a YouTube video, with an optional sound, shown over everyone's screen when played. " +
        "Its layered animation is its cut-in-scene and that scene's cut-in-layers. Play and stop it with the actions.",
      list: () => this.objectStore.getObjects<CutIn>(CutIn),
      ready: (cutIn, fields) => this.picturesSized(cutIn, fields),
      idOf: (cutIn) => cutIn.identifier,
      nameOf: (cutIn) => cutIn.name,
      fields: [
        textField<CutIn>(
          'name',
          'Its name. A cut-in set to play from chat plays when a line ends with this name.',
          'write',
          (cutIn) => cutIn.name,
          (cutIn, value) => {
            cutIn.name = value;
          },
          200
        ),
        {
          ...textField<CutIn>(
            'picture',
            'The picture it shows, by id (a name is taken when written; see list_assets). Empty for none.',
            'write',
            (cutIn) => cutIn.imageIdentifier,
            (cutIn, value) => this.sizing.setPicture(cutIn, this.picture(value)),
            200
          ),
          refuse: (_cutIn, value) => refusalOf(() => this.picture(value as string)),
        },
        flagField<CutIn>(
          'video',
          'Whether it plays the YouTube video at video_url instead of showing its picture. Becoming a video sets the size to 640 by 360, and becoming a picture again sizes it to its picture.',
          'write',
          (cutIn) => cutIn.isVideoCutIn,
          (cutIn, value) => resizingOnKindChange(cutIn, () => (cutIn.isVideoCutIn = value))
        ),
        textField<CutIn>(
          'video_url',
          'The YouTube video it plays while video is on: a watch, shorts or youtu.be link.',
          'write',
          (cutIn) => cutIn.videoUrl,
          (cutIn, value) => resizingOnKindChange(cutIn, () => (cutIn.videoUrl = value)),
          2000
        ),
        {
          ...numberField<CutIn>(
            'width',
            'How wide it is shown, in pixels: 10 to 1920 for a picture, 448 to 1920 for a video. With keep_aspect on, the height follows.',
            'write',
            { minimum: 10, maximum: 1920, integer: true },
            (cutIn) => cutIn.width,
            setWidth
          ),
          refuse: sizeRefusal('wide'),
        },
        {
          ...numberField<CutIn>(
            'height',
            'How tall it is shown, in pixels: 10 to 1200 for a picture, 252 to 1080 for a video. With keep_aspect on, the width follows.',
            'write',
            { minimum: 10, maximum: 1200, integer: true },
            (cutIn) => cutIn.height,
            setHeight
          ),
          refuse: sizeRefusal('tall'),
        },
        flagField<CutIn>(
          'original_size',
          "Whether it is shown at its picture's own size, which it is then sized to and which holds width, height and keep_aspect as they are.",
          'write',
          (cutIn) => cutIn.originalSize,
          (cutIn, value) => this.sizing.setOriginalSize(cutIn, value)
        ),
        {
          ...flagField<CutIn>(
            'keep_aspect',
            'Whether changing its width or height changes the other to keep its proportions (16:9 for a video).',
            'write',
            (cutIn) => cutIn.keepImageAspect,
            (cutIn, value) => this.sizing.keepAspect(cutIn, value)
          ),
          refuse: sizeFollowsPicture,
        },
        flagField<CutIn>(
          'frameless',
          'Whether it is shown without a window frame and title bar.',
          'write',
          (cutIn) => cutIn.frameless,
          (cutIn, value) => {
            cutIn.frameless = value;
          }
        ),
        numberField<CutIn>(
          'position_x',
          'Where it stands across the screen: 0 at the left edge, 100 at the right.',
          'write',
          { minimum: 0, maximum: 100 },
          (cutIn) => cutIn.x_pos,
          (cutIn, value) => {
            cutIn.x_pos = value;
          }
        ),
        numberField<CutIn>(
          'position_y',
          'Where it stands down the screen: 0 at the top edge, 100 at the bottom.',
          'write',
          { minimum: 0, maximum: 100 },
          (cutIn) => cutIn.y_pos,
          (cutIn, value) => {
            cutIn.y_pos = value;
          }
        ),
        {
          ...textField<CutIn>(
            'sound',
            'The sound it plays, by id (a name is taken when written). Empty for none.',
            'write',
            (cutIn) => cutIn.audioIdentifier,
            (cutIn, value) => {
              const audio = value.trim() ? this.listedSound(value) : null;
              cutIn.audioIdentifier = audio?.identifier ?? '';
              cutIn.audioName = audio?.name ?? '';
            },
            200
          ),
          refuse: (_cutIn, value) =>
            (value as string).trim() ? refusalOf(() => this.listedSound(value as string)) : null,
        },
        textField<CutIn>(
          'tag',
          'Playing it stops any other cut-in of the same tag. With no tag and a sound of its own, playing it stops the music.',
          'write',
          (cutIn) => cutIn.tagName,
          (cutIn, value) => {
            cutIn.tagName = value;
          },
          200
        ),
        flagField<CutIn>(
          'loop',
          'Whether it stays up, its sound looping, until stopped. Turning it on clears out_time.',
          'write',
          (cutIn) => cutIn.isLoop,
          (cutIn, value) => {
            cutIn.isLoop = value;
            if (value) cutIn.outTime = 0;
          }
        ),
        {
          ...numberField<CutIn>(
            'out_time',
            'How many seconds it stays up before closing by itself; 0 for until its sound ends or it is stopped.',
            'write',
            { minimum: 0 },
            (cutIn) => cutIn.outTime,
            (cutIn, value) => {
              cutIn.outTime = value;
            }
          ),
          refuse: (cutIn) => (cutIn.isLoop ? 'It stays up until stopped while loop is on; turn loop off first.' : null),
        },
        flagField<CutIn>(
          'from_chat',
          'Whether a chat line ending with its name plays it (ending with @ and its name plays its sound alone).',
          'write',
          (cutIn) => cutIn.chatActivate,
          (cutIn, value) => {
            cutIn.chatActivate = value;
          }
        ),
        numberField<CutIn>(
          'video_volume',
          'How loud its video plays, from 0 to 100.',
          'write',
          { minimum: 0, maximum: 100, integer: true },
          (cutIn) => cutIn.videoVolume,
          (cutIn, value) => {
            cutIn.videoVolume = value;
          }
        ),
        flagField<CutIn>(
          'sample',
          'Whether it is one of the samples a room starts with. One taken away, or a layer taken out of one, can be put back from the cut-in list on the screen.',
          null,
          (cutIn) => this.builtIn.has(cutIn.identifier)
        ),
        textField<CutIn>(
          'scene',
          'The id of its cut-in-scene, which holds its layers; empty while it has none.',
          null,
          (cutIn) => cutIn.scene?.identifier ?? ''
        ),
      ],
      create: {
        access: 'write',
        description: 'Makes a cut-in showing the sample picture, as the cut-in list makes one.',
        input: objectInput(),
        make: () => {
          const cutIn = new CutIn();
          cutIn.name = this.t('feature.media.cutIn.defaultName');
          cutIn.imageIdentifier = NEW_CUT_IN_PICTURE;
          cutIn.initialize();
          return cutIn;
        },
      },
      remove: { access: 'write', take: (cutIn) => cutIn.destroy() },
      actions: [
        {
          name: 'play',
          description:
            "Plays it on everyone's screen, stopping the music where it brings a sound of its own and has no tag.",
          access: 'write',
          input: objectInput({
            sound_only: { type: 'boolean', description: 'Play only its sound, as a chat line ending with @name does.' },
          }),
          run: (cutIn, args) => {
            const soundOnly = args['sound_only'] === true;
            const played = soundOnly ? this.cutIns.launchSoundOnly(cutIn) : this.cutIns.launch(cutIn);
            if (!played) {
              throw new AgentToolError(
                'not_allowed',
                `${cutIn.name} could not be played: a guest on a room server plays no cut-in.`
              );
            }
            return { playing: cutIn.name, sound_only: soundOnly };
          },
        },
        {
          name: 'stop',
          description: "Stops it on everyone's screen.",
          access: 'write',
          input: objectInput(),
          run: (cutIn) => {
            if (PeerCursor.isMyselfKeptOffTable) {
              throw new AgentToolError('not_allowed', 'A guest on a room server stops no cut-in.');
            }
            const launcher = this.objectStore.get('CutInLauncher');
            if (!(launcher instanceof CutInLauncher)) {
              throw new AgentToolError('failed', 'The room has no cut-in launcher.');
            }
            launcher.stopCutIn(cutIn);
            return { stopped: cutIn.name };
          },
        },
      ],
    };
  }

  private cutInScene(): AgentKind<CutInScene> {
    return {
      kind: CutInScene.aliasName,
      description:
        "A cut-in's scene: how long its layered animation runs, whether it loops, what lies behind its layers " +
        'and the sounds dropped along it. Its layers are the cut-in-layers of it. It goes when its cut-in goes.',
      list: () => this.objectStore.getObjects<CutInScene>(CutInScene).filter((scene) => this.ownerOf(scene) !== null),
      idOf: (scene) => scene.identifier,
      nameOf: (scene) => this.ownerOf(scene)?.name ?? '',
      fields: [
        {
          name: 'cut_in',
          description: 'The cut-in it belongs to.',
          schema: { type: 'object', properties: {} },
          access: null,
          read: (scene) => {
            const owner = this.ownerOf(scene);
            return owner ? { id: owner.identifier, name: owner.name } : null;
          },
        },
        numberField<CutInScene>(
          'duration_ms',
          'How long one pass lasts, in ms. It runs at least until its last layer is done.',
          'write',
          { minimum: MIN_SCENE_MS, maximum: MAX_SCENE_MS, integer: true },
          (scene) => scene.durationMs,
          (scene, value) => {
            scene.durationMs = value;
          }
        ),
        numberField<CutInScene>(
          'running_ms',
          'How long it actually runs, in ms, its layers taken into account.',
          null,
          {},
          (scene) => scene.runningMs
        ),
        flagField<CutInScene>(
          'loop',
          "Whether the animation starts again from the top when it ends. The cut-in's own loop is its sound's.",
          'write',
          (scene) => scene.sceneLoop,
          (scene, value) => {
            scene.sceneLoop = value;
          }
        ),
        textField<CutInScene>(
          'background_color',
          "A colour behind the layers, such as #000000. Empty leaves the cut-in's own picture or video showing.",
          'write',
          (scene) => scene.backgroundColor,
          (scene, value) => {
            scene.backgroundColor = value;
          },
          50
        ),
        {
          name: 'sounds',
          description: `The sounds dropped along the animation, at most ${MAX_SOUNDS}. Writing it replaces them all.`,
          schema: { type: 'array', maxItems: MAX_SOUNDS, items: SCENE_SOUND },
          access: 'write',
          read: (scene) => scene.soundList.map((sound) => ({ at_ms: sound.t, sound: sound.a, volume: sound.v })),
          refuse: (_scene, value) =>
            (value as { sound: string }[])
              .map((sound) => refusalOf(() => this.anySound(sound.sound)))
              .find((reason) => reason !== null) ?? null,
          put: (scene, value) => {
            const given = value as { at_ms: number; sound: string; volume?: number }[];
            const sounds: CutInSound[] = given.map((sound) => ({
              t: sound.at_ms,
              a: this.anySound(sound.sound).identifier,
              v: sound.volume ?? 100,
            }));
            scene.sounds = encodeCutInSounds(sounds);
          },
        },
      ],
      create: {
        access: 'write',
        description:
          'Gives a cut-in its scene, which its layers are laid in, as opening its scene editor does. ' +
          'One that has a scene already gives that back.',
        input: objectInput({ cut_in: CUT_IN_REFERENCE }, ['cut_in']),
        make: (args) => ensureScene(this.cutInNamed(args['cut_in'] as string)),
      },
    };
  }

  private cutInLayer(): AgentKind<CutInLayer> {
    const field = <V>(
      name: string,
      description: string,
      schema: AgentSchema,
      read: (layer: CutInLayer) => unknown,
      put: (layer: CutInLayer, value: V) => void
    ): AgentKindField<CutInLayer> => ({
      name,
      description,
      schema,
      access: 'write',
      read,
      put: (layer, value) => put(layer, value as V),
    });
    const text = (
      name: string,
      description: string,
      read: (layer: CutInLayer) => string,
      write: (layer: CutInLayer, value: string) => void,
      maxLength = 200
    ) => field<string>(name, description, { type: 'string', maxLength }, read, write);
    const amount = (
      name: string,
      description: string,
      bounds: { minimum?: number; maximum?: number; integer?: boolean },
      read: (layer: CutInLayer) => number,
      write: (layer: CutInLayer, value: number) => void
    ) => numberField<CutInLayer>(name, description, 'write', bounds, read, write);
    const flag = (
      name: string,
      description: string,
      read: (layer: CutInLayer) => boolean,
      write: (layer: CutInLayer, value: boolean) => void
    ) => flagField<CutInLayer>(name, description, 'write', read, write);
    const choice = <C extends string>(
      name: string,
      description: string,
      choices: readonly C[],
      read: (layer: CutInLayer) => string,
      write: (layer: CutInLayer, value: C) => void
    ) => choiceField<CutInLayer, C>(name, description, 'write', choices, read, write);
    const resting = (
      name: string,
      description: string,
      tracks: readonly CutInTrackName[],
      bounds: { minimum?: number; maximum?: number },
      read: (layer: CutInLayer) => number,
      write: (layer: CutInLayer, value: number) => void
    ): AgentKindField<CutInLayer> => ({
      ...amount(name, `${description} Where it rests; keys in tracks override it while they run.`, bounds, read, write),
      refuse: (layer) =>
        tracks.some((track) => (layer.trackSet[track] ?? []).length > 0)
          ? `Its ${name} moves along keys in tracks; change those keys instead.`
          : null,
    });
    const stageOf = (layer: CutInLayer) => {
      const cutIn = this.cutInOf(layer);
      return { width: cutIn?.width ?? 0, height: cutIn?.height ?? 0 };
    };
    const presetMs: AgentSchema = {
      type: 'integer',
      minimum: 1,
      maximum: 10000,
      description: `How long it takes, in ms; ${DEFAULT_PRESET_MS} when left out.`,
    };
    return {
      kind: CutInLayer.aliasName,
      description:
        "One layer of a cut-in's scene: a picture, some words, or a band of colour, placed in the cut-in's own " +
        'pixels from its top left. Layers are drawn bottom first. Fields that only one kind of layer uses say so.',
      list: () =>
        this.objectStore
          .getObjects<CutInScene>(CutInScene)
          .filter((scene) => this.ownerOf(scene) !== null)
          .flatMap((scene) => scene.layers),
      idOf: (layer) => layer.identifier,
      nameOf: (layer) => layer.name,
      fields: [
        {
          name: 'cut_in',
          description: 'The cut-in whose scene it is in.',
          schema: { type: 'object', properties: {} },
          access: null,
          read: (layer) => {
            const cutIn = this.cutInOf(layer);
            return cutIn ? { id: cutIn.identifier, name: cutIn.name } : null;
          },
        },
        choiceField<CutInLayer, CutInLayerKind>(
          'kind',
          'What it is: a picture, some words, or a band of colour.',
          null,
          CUT_IN_LAYER_KINDS,
          (layer) => layer.kind
        ),
        numberField<CutInLayer>(
          'position',
          'Where it is drawn among the layers, counted from 1 at the bottom. The move action moves it.',
          null,
          { minimum: 1, integer: true },
          (layer) => (this.sceneOf(layer)?.layers.indexOf(layer) ?? 0) + 1
        ),
        text(
          'name',
          'Its name in the editor.',
          (layer) => layer.name,
          (layer, value) => (layer.name = value)
        ),
        flag(
          'hidden',
          "Whether it is kept out of the editor's way; it plays all the same.",
          (layer) => layer.hidden,
          (layer, value) => (layer.hidden = value)
        ),
        flag(
          'locked',
          "Whether it is held against dragging on the editor's stage and timeline.",
          (layer) => layer.locked,
          (layer, value) => (layer.locked = value)
        ),
        resting(
          'x',
          'Its left edge, in pixels.',
          ['x'],
          {},
          (layer) => layer.x,
          (layer, value) => (layer.x = value)
        ),
        resting(
          'y',
          'Its top edge, in pixels.',
          ['y'],
          {},
          (layer) => layer.y,
          (layer, value) => (layer.y = value)
        ),
        amount(
          'width',
          'How wide its box is, in pixels.',
          { minimum: 1 },
          (layer) => layer.width,
          (layer, value) => (layer.width = value)
        ),
        amount(
          'height',
          'How tall its box is, in pixels.',
          { minimum: 1 },
          (layer) => layer.height,
          (layer, value) => (layer.height = value)
        ),
        resting(
          'scale',
          'How much it is grown, 1 for its own size.',
          ['scaleX', 'scaleY'],
          { minimum: 0.01 },
          (layer) => layer.scaleX,
          (layer, value) => {
            layer.scaleX = value;
            layer.scaleY = value;
          }
        ),
        resting(
          'rotation',
          'How far it is turned, in degrees.',
          ['rotation'],
          {},
          (layer) => layer.rotation,
          (layer, value) => (layer.rotation = value)
        ),
        resting(
          'opacity',
          'How solid it is, from 0 (unseen) to 1.',
          ['opacity'],
          { minimum: 0, maximum: 1 },
          (layer) => layer.opacity,
          (layer, value) => (layer.opacity = value)
        ),
        resting(
          'blur',
          'How blurred it is, in pixels.',
          ['blur'],
          { minimum: 0 },
          (layer) => layer.blur,
          (layer, value) => (layer.blur = value)
        ),
        amount(
          'skew_x',
          'How far it leans sideways, in degrees.',
          { minimum: -80, maximum: 80 },
          (layer) => layer.skewXDeg,
          (layer, value) => (layer.skewXDeg = value)
        ),
        amount(
          'skew_y',
          'How far it leans up or down, in degrees.',
          { minimum: -80, maximum: 80 },
          (layer) => layer.skewYDeg,
          (layer, value) => (layer.skewYDeg = value)
        ),
        choice<CutInClip>(
          'clip',
          'The outline it is cut down to.',
          CUT_IN_CLIPS,
          (layer) => layer.clip,
          (layer, value) => (layer.clip = value)
        ),
        choice<CutInWipe>(
          'wipe_shape',
          'Which way it is let in a part at a time; none for all at once.',
          CUT_IN_WIPES,
          (layer) => layer.wipeShape,
          (layer, value) => {
            layer.wipeShape = value;
            if (value !== 'none' && (layer.trackSet.wipe ?? []).length < 1) layer.wipe = 1;
          }
        ),
        resting(
          'wipe',
          'How much of it is let in by its wipe, from 0 to 1.',
          ['wipe'],
          { minimum: 0, maximum: 1 },
          (layer) => layer.wipe,
          (layer, value) => (layer.wipe = value)
        ),
        choice<CutInWipe>(
          'crumble_shape',
          'Which way it crumbles away; none for not at all.',
          CUT_IN_WIPES,
          (layer) => layer.crumbleShape,
          (layer, value) => {
            layer.crumbleShape = value;
            if (value !== 'none' && (layer.trackSet.crumble ?? []).length < 1) layer.crumble = 1;
          }
        ),
        resting(
          'crumble',
          'How much of it is still whole, from 0 to 1.',
          ['crumble'],
          { minimum: 0, maximum: 1 },
          (layer) => layer.crumble,
          (layer, value) => (layer.crumble = value)
        ),
        amount(
          'start_ms',
          'When it comes on, in ms from the start of the scene.',
          { minimum: 0 },
          (layer) => layer.startMs,
          (layer, value) => (layer.startMs = value)
        ),
        amount(
          'end_ms',
          'When it goes off, in ms; 0 for at the end of the scene.',
          { minimum: 0 },
          (layer) => layer.endMs,
          (layer, value) => (layer.endMs = value)
        ),
        {
          ...text(
            'picture',
            'Picture layer: the picture, by id (a name is taken when written). Empty for none.',
            (layer) => layer.imageIdentifier,
            (layer, value) => (layer.imageIdentifier = this.picture(value))
          ),
          refuse: (_layer, value) => refusalOf(() => this.picture(value as string)),
        },
        flag(
          'crop',
          'Picture layer: whether the picture fills its box, cropped, rather than fitting inside it.',
          (layer) => layer.objectFit === 'cover',
          (layer, value) => (layer.objectFit = value ? 'cover' : 'contain')
        ),
        amount(
          'crop_x',
          'Picture layer: which part of a cropped picture stays in view across, 0 (left) to 100.',
          { minimum: 0, maximum: 100 },
          (layer) => layer.objectPosX,
          (layer, value) => (layer.objectPosX = value)
        ),
        amount(
          'crop_y',
          'Picture layer: which part of a cropped picture stays in view down, 0 (top) to 100.',
          { minimum: 0, maximum: 100 },
          (layer) => layer.objectPosY,
          (layer, value) => (layer.objectPosY = value)
        ),
        flag(
          'portrait_slot',
          'Picture layer: whether it shows the portrait of whoever the cut-in is played for, its picture standing in for nobody.',
          (layer) => layer.portraitSlot,
          (layer, value) => (layer.portraitSlot = value)
        ),
        text(
          'text',
          `Words layer: the words; ${SPEAKER_NAME_TOKEN} is replaced by the name of whoever it is played for.`,
          (layer) => layer.text,
          (layer, value) => (layer.text = value),
          10000
        ),
        amount(
          'font_size',
          'Words layer: the size of the letters, in pixels.',
          { minimum: 1 },
          (layer) => layer.fontSizePx,
          (layer, value) => (layer.fontSizePx = value)
        ),
        amount(
          'font_weight',
          'Words layer: how bold, from 100 to 900.',
          { minimum: 100, maximum: 900, integer: true },
          (layer) => layer.fontWeight,
          (layer, value) => (layer.fontWeight = value)
        ),
        text(
          'font_family',
          'Words layer: the CSS font family; empty for the default.',
          (layer) => layer.fontFamily,
          (layer, value) => (layer.fontFamily = value),
          500
        ),
        text(
          'color',
          'Words layer: the colour of the letters, such as #ffffff.',
          (layer) => layer.color,
          (layer, value) => (layer.color = value),
          50
        ),
        choice<CutInTextAlign>(
          'text_align',
          'Words layer: how the lines are aligned.',
          CUT_IN_TEXT_ALIGNS,
          (layer) => layer.textAlign,
          (layer, value) => (layer.textAlign = value)
        ),
        text(
          'stroke_color',
          'Words layer: the colour of the outline round the letters.',
          (layer) => layer.strokeColor,
          (layer, value) => (layer.strokeColor = value),
          50
        ),
        amount(
          'stroke_width',
          'Words layer: how thick the outline is, in pixels; 0 for none.',
          { minimum: 0 },
          (layer) => layer.strokeWidthPx,
          (layer, value) => (layer.strokeWidthPx = value)
        ),
        amount(
          'letter_spacing',
          'Words layer: extra space between letters, in pixels; negative draws them closer.',
          {},
          (layer) => layer.letterSpacingPx,
          (layer, value) => (layer.letterSpacingPx = value)
        ),
        amount(
          'line_height',
          'Words layer: how far apart lines sit, as a multiple of the letter size.',
          { minimum: 0.4, maximum: 4 },
          (layer) => layer.lineHeight,
          (layer, value) => (layer.lineHeight = value)
        ),
        flag(
          'vertical',
          'Words layer: whether the words run down rather than across.',
          (layer) => layer.vertical,
          (layer, value) => (layer.vertical = value)
        ),
        choice<string>(
          'letter_motion',
          'Words layer: how the letters come on one at a time; empty for all at once.',
          ['', ...LETTER_MOTIONS],
          (layer) => layer.letterMotion,
          (layer, value) => (layer.letterMotion = value)
        ),
        amount(
          'letter_stagger_ms',
          "Words layer: how far apart the letters come on, in ms; 0 for the motion's own.",
          { minimum: 0, maximum: LETTER_STAGGER_MAX_MS, integer: true },
          (layer) => layer.letterStaggerMs,
          (layer, value) => (layer.letterStaggerMs = value)
        ),
        amount(
          'letter_duration_ms',
          `Words layer: how long one letter takes to come on, in ms (${LETTER_DURATION_MIN_MS} to ${LETTER_DURATION_MAX_MS}); 0 for the motion's own.`,
          { minimum: 0, maximum: LETTER_DURATION_MAX_MS, integer: true },
          (layer) => layer.letterDurationMs,
          (layer, value) => (layer.letterDurationMs = value <= 0 ? 0 : Math.max(LETTER_DURATION_MIN_MS, value))
        ),
        choice<CutInFillShape>(
          'fill_shape',
          'Band layer: the pattern it is painted with.',
          CUT_IN_FILL_SHAPES,
          (layer) => layer.fillShape,
          (layer, value) => (layer.fillShape = value)
        ),
        text(
          'fill_from',
          'Band layer: the colour it starts from, the whole of a flat one.',
          (layer) => layer.fillFrom,
          (layer, value) => (layer.fillFrom = value),
          50
        ),
        text(
          'fill_mid',
          'Band layer: a colour passed through on the way; empty for a straight run.',
          (layer) => layer.fillMid,
          (layer, value) => (layer.fillMid = value),
          50
        ),
        text(
          'fill_to',
          'Band layer: the colour it ends in; empty for one flat colour.',
          (layer) => layer.fillTo,
          (layer, value) => (layer.fillTo = value),
          50
        ),
        amount(
          'fill_angle',
          'Band layer: which way it runs, in degrees.',
          {},
          (layer) => layer.fillAngleDeg,
          (layer, value) => (layer.fillAngleDeg = value)
        ),
        amount(
          'fill_scale',
          'Band layer: how far apart a repeating pattern repeats, in pixels.',
          { minimum: MIN_FILL_SCALE_PX, maximum: MAX_FILL_SCALE_PX },
          (layer) => layer.fillScalePx,
          (layer, value) => (layer.fillScalePx = value)
        ),
        choice<CutInEffect>(
          'effect',
          'A touch that runs the whole time it is on screen.',
          CUT_IN_EFFECTS,
          (layer) => layer.effect,
          (layer, value) => (layer.effect = value)
        ),
        amount(
          'effect_strength',
          'How strong the touch is, from 0 to 3.',
          { minimum: 0, maximum: 3 },
          (layer) => layer.effectStrength,
          (layer, value) => (layer.effectStrength = value)
        ),
        text(
          'effect_color',
          'The colour of a glow.',
          (layer) => layer.effectColor,
          (layer, value) => (layer.effectColor = value),
          50
        ),
        field<Readonly<Record<string, readonly { at_ms: number; value: number; easing?: CutInEasingName }[]>>>(
          'tracks',
          'How it moves over time: for each property it animates, its keys in time order. ' +
            'scaleX and scaleY grow it, opacity, wipe and crumble run from 0 to 1. Writing it replaces every key.',
          {
            type: 'object',
            properties: Object.fromEntries(CUT_IN_TRACKS.map((track) => [track, TRACK_KEYS])),
            additionalProperties: false,
          },
          (layer) =>
            Object.fromEntries(
              Object.entries(layer.trackSet).map(([track, keys]) => [
                track,
                (keys ?? []).map((key: CutInKey) => ({
                  at_ms: key.t,
                  value: key.v,
                  ...(key.e ? { easing: key.e } : {}),
                })),
              ])
            ),
          (layer, value) => {
            const tracks: CutInTrackSet = {};
            for (const track of CUT_IN_TRACKS) {
              const keys = value[track];
              if (keys)
                tracks[track] = keys.map((key) => ({
                  t: key.at_ms,
                  v: key.value,
                  ...(key.easing ? { e: key.easing } : {}),
                }));
            }
            layer.tracks = encodeCutInTracks(tracks);
          }
        ),
      ],
      create: {
        access: 'write',
        description:
          "Lays a new layer on top of a cut-in's others, sized to sit inside it, giving the cut-in a scene first where it has none.",
        input: objectInput(
          {
            cut_in: CUT_IN_REFERENCE,
            kind: {
              type: 'string',
              enum: CUT_IN_LAYER_KINDS,
              description: 'What it is: a picture, some words, or a band of colour.',
            },
          },
          ['cut_in', 'kind']
        ),
        make: (args) => {
          const cutIn = this.cutInNamed(args['cut_in'] as string);
          const kind = args['kind'] as CutInLayerKind;
          const layer = addLayer(ensureScene(cutIn), kind, this.t(NEW_LAYER_NAMES[kind]), cutIn.shownSize);
          cutIn.originalSize = false;
          return layer;
        },
      },
      remove: {
        access: 'write',
        take: (layer) => {
          const scene = this.sceneOf(layer);
          if (scene) removeLayer(scene, layer);
        },
      },
      actions: [
        {
          name: 'duplicate',
          description: 'Lays a copy of it directly on top of it.',
          access: 'write',
          input: objectInput(),
          run: (layer) => {
            const scene = this.sceneOf(layer);
            const copy = scene ? duplicateLayer(scene, layer) : null;
            if (!copy) throw new AgentToolError('failed', `${layer.name} could not be copied.`);
            return { id: copy.identifier, name: copy.name };
          },
        },
        {
          name: 'move',
          description: 'Moves it to another place among the layers, counted from 1 at the bottom.',
          access: 'write',
          input: objectInput({ to: POSITION }, ['to']),
          run: (layer, args) => {
            const scene = this.sceneOf(layer);
            if (!scene) throw new AgentToolError('failed', `${layer.name} is in no scene.`);
            const layers = scene.layers;
            const from = layers.indexOf(layer);
            const to = Math.min(layers.length, args['to'] as number) - 1;
            if (to !== from) reorderLayers(scene, layer, layers[to], to > from ? 'after' : 'before');
            return { position: scene.layers.indexOf(layer) + 1 };
          },
        },
        {
          name: 'apply_entrance',
          description: 'Lays keys onto its tracks for a ready-made way of arriving, starting at its start_ms.',
          access: 'write',
          input: objectInput({ entrance: { type: 'string', enum: CUT_IN_ENTRANCES }, ms: presetMs }, ['entrance']),
          run: (layer, args) => {
            applyEntrance(layer, args['entrance'] as CutInEntrance, stageOf(layer), presetMsOf(args));
            return { tracks: Object.keys(layer.trackSet) };
          },
        },
        {
          name: 'apply_exit',
          description: 'Lays keys onto its tracks for a ready-made way of leaving, ending as it goes off.',
          access: 'write',
          input: objectInput({ exit: { type: 'string', enum: CUT_IN_EXITS }, ms: presetMs }, ['exit']),
          run: (layer, args) => {
            const scene = this.sceneOf(layer);
            applyExit(layer, args['exit'] as CutInExit, stageOf(layer), sceneDurationOf(scene), presetMsOf(args));
            return { tracks: Object.keys(layer.trackSet) };
          },
        },
        {
          name: 'apply_look',
          description:
            'Gives it a whole ready-made look: how it arrives, how it leaves and the touch it runs meanwhile.',
          access: 'write',
          input: objectInput({ look: { type: 'string', enum: CUT_IN_LAYER_PRESETS.map((preset) => preset.id) } }, [
            'look',
          ]),
          run: (layer, args) => {
            applyLayerPreset(layer, args['look'] as string, stageOf(layer), sceneDurationOf(this.sceneOf(layer)));
            return { tracks: Object.keys(layer.trackSet), effect: layer.effect };
          },
        },
      ],
    };
  }

  private vnStage(): AgentKind<VnStage> {
    const directorOf = (stage: VnStage) =>
      stage.isDirected ? (PeerCursor.findByPeerId(stage.directorPeerId)?.name ?? '') : null;
    const transitionArg: AgentSchema = {
      type: 'string',
      enum: VN_STAGE_TRANSITIONS,
      description: "The transition to play; the stage's own when left out.",
    };
    return {
      kind: VnStage.aliasName,
      description:
        "The visual novel stage everyone's novel view shares: its background picture, the transition played as it " +
        'changes, and whether a seat is directing, every other screen following the line it reads. The game master changes it.',
      list: () => {
        const stage = vnStageOf(this.objectStore);
        return stage ? [stage] : [];
      },
      idOf: (stage) => stage.identifier,
      nameOf: () => 'Novel stage',
      fields: [
        textField<VnStage>(
          'background',
          'The id of the picture behind the stage; empty for none. set_background changes it.',
          null,
          (stage) => stage.backgroundImageIdentifier
        ),
        choiceField<VnStage, VnStageTransition>(
          'transition',
          'The transition played as the background changes.',
          'gm',
          VN_STAGE_TRANSITIONS,
          (stage) => stage.transition,
          (stage, value) => {
            stage.transition = value;
            stage.update();
          }
        ),
        flagField<VnStage>('directed', 'Whether a seat is directing the stage.', null, (stage) => stage.isDirected),
        textField<VnStage>('director', 'The name of the seat directing it, or null while nobody is.', null, directorOf),
      ],
      actions: [
        {
          name: 'set_background',
          description: 'Puts a picture behind the stage for everyone, playing the transition.',
          access: 'gm',
          input: objectInput(
            {
              picture: { type: 'string', minLength: 1, description: 'The picture, by id or name (see list_assets).' },
              transition: transitionArg,
            },
            ['picture']
          ),
          run: (stage, args) => {
            const transition = (args['transition'] as VnStageTransition | undefined) ?? stage.transition;
            stage.setBackground(this.picture(args['picture'] as string), transition);
            return { background: stage.backgroundImageIdentifier, transition: stage.transition };
          },
        },
        {
          name: 'clear_background',
          description: 'Takes the picture away from behind the stage for everyone, with the transition.',
          access: 'gm',
          input: objectInput(),
          run: (stage) => {
            stage.clearBackground();
            return { background: '' };
          },
        },
        {
          name: 'play_transition',
          description: 'Plays a transition on every screen without changing the background.',
          access: 'gm',
          input: objectInput({ transition: transitionArg }),
          run: (stage, args) => {
            stage.playTransition((args['transition'] as VnStageTransition | undefined) ?? stage.transition);
            return { transition: stage.transition };
          },
        },
        {
          name: 'start_directing',
          description:
            "Directs the stage from this seat, taking it over from whoever directed it: every other screen's novel view follows the line this seat's reads.",
          access: 'gm',
          input: objectInput(),
          run: (stage) => {
            if (!(stage.isDirected && stage.directorPeerId === getMyPeerId())) stage.startDirecting(getMyPeerId());
            return { directed: true, director: directorOf(stage) };
          },
        },
        {
          name: 'stop_directing',
          description: 'Stops this seat directing the stage, every screen going back to reading on its own.',
          access: 'gm',
          input: objectInput(),
          run: (stage) => {
            if (!stage.isDirected || stage.directorPeerId !== getMyPeerId()) {
              throw new AgentToolError(
                'not_allowed',
                'This seat is not directing the stage; only the seat directing it stops it (start_directing takes it over).'
              );
            }
            stage.stopDirecting();
            return { directed: false };
          },
        },
      ],
    };
  }

  private musicState(jukebox: Jukebox): MusicState {
    if (jukebox.isPlaying === true) return 'playing';
    return jukebox.isPaused ? 'paused' : 'stopped';
  }

  /** What the jukebox is doing, as its actions answer it. */
  private musicNow(jukebox: Jukebox): Record<string, unknown> {
    const playlist = jukebox.playlist;
    return {
      track: jukebox.audioIdentifier
        ? { id: jukebox.audioIdentifier, name: this.soundName(jukebox.audioIdentifier) }
        : null,
      state: this.musicState(jukebox),
      playlist: playlist ? { id: playlist.identifier, name: this.music.labelOf(playlist) } : null,
      repeat: jukebox.repeatMode,
      shuffle: jukebox.shuffles,
      seek_locked: jukebox.isSeekLocked,
    };
  }

  private jukebox(): AgentKind<Jukebox> {
    const now = (read: (view: Record<string, unknown>) => unknown) => (jukebox: Jukebox) =>
      read(this.musicNow(jukebox));
    const act = (
      name: string,
      description: string,
      run: (jukebox: Jukebox, args: AgentArgs) => void,
      input = objectInput(),
      access: 'write' | 'gm' = 'write'
    ) => ({
      name,
      description,
      access,
      input,
      run: (jukebox: Jukebox, args: AgentArgs) => {
        run(jukebox, args);
        return this.musicNow(jukebox);
      },
    });
    return {
      kind: Jukebox.aliasName,
      description:
        "The room's music player: what plays for everyone, the playlist it goes on through, and how it repeats " +
        'and shuffles. It is worked through its actions, which answer what it is doing after.',
      list: () => {
        const jukebox = this.objectStore.get('Jukebox');
        return jukebox instanceof Jukebox ? [jukebox] : [];
      },
      idOf: (jukebox) => jukebox.identifier,
      nameOf: () => 'Jukebox',
      fields: [
        {
          name: 'track',
          description: 'The track it is set to, playing or paused: its id and name; null for none.',
          schema: { type: 'object', properties: {} },
          access: null,
          read: now((view) => view['track']),
        },
        choiceField<Jukebox, MusicState>(
          'state',
          'Whether the track is playing, paused to go on from where it stopped, or stopped.',
          null,
          ['playing', 'paused', 'stopped'],
          now((view) => view['state'])
        ),
        {
          name: 'playlist',
          description: 'The playlist it goes on through: its id and name.',
          schema: { type: 'object', properties: {} },
          access: null,
          read: now((view) => view['playlist']),
        },
        {
          name: 'queue',
          description:
            'The tracks it goes on through, in the order they play: the playlist, or every music track while that is empty.',
          schema: { type: 'array', items: { type: 'object', properties: {} } },
          access: null,
          read: (jukebox) =>
            jukebox.playOrder
              .map((identifier) => this.audioStorage.get(identifier))
              .filter((audio): audio is AudioFile => audio !== null && !audio.isHidden)
              .map((audio) => ({ id: audio.identifier, name: audio.name })),
        },
        choiceField<Jukebox, RepeatMode>(
          'repeat',
          'none plays the queue through once, all goes round it, one repeats the track.',
          null,
          REPEAT_MODES,
          now((view) => view['repeat'])
        ),
        flagField<Jukebox>(
          'shuffle',
          'Whether the queue plays shuffled.',
          null,
          now((view) => view['shuffle'])
        ),
        flagField<Jukebox>(
          'seek_locked',
          "Whether the room's seek bar is locked against moving the track.",
          null,
          now((view) => view['seek_locked'])
        ),
      ],
      actions: [
        act(
          'play',
          'Plays a track for everyone in place of what plays. A track tagged SE plays once over it as a sound effect, and one tagged BGS starts beneath it as an ambient sound.',
          (_jukebox, args) => this.music.play(this.listedSound(args['track'] as string)),
          objectInput({ track: TRACK_REFERENCE }, ['track'])
        ),
        act(
          'play_playlist',
          'Makes a playlist the one it goes on through and plays it from the top, or from one of its tracks.',
          (_jukebox, args) => {
            const playlist = this.playlistNamed(args['playlist'] as string);
            const track = args['track'] as string | undefined;
            if (!track) {
              this.music.playPlaylist(playlist.identifier);
              return;
            }
            const audio = this.listedSound(track);
            if (!playlist.hasEntry(audio.identifier)) {
              throw new AgentToolError('invalid_input', `${audio.name} is not on ${this.music.labelOf(playlist)}.`);
            }
            this.music.playFromPlaylist(playlist, audio);
          },
          objectInput(
            {
              playlist: { type: 'string', minLength: 1, description: 'The playlist, by id or name.' },
              track: { type: 'string', description: 'A track of it to start from, by id or name.' },
            },
            ['playlist']
          )
        ),
        act('pause', 'Pauses the track where it is, to go on from there.', (jukebox) => {
          if (jukebox.isPlaying !== true) throw new AgentToolError('failed', 'Nothing is playing to pause.');
          this.music.togglePlayPause();
        }),
        act('resume', 'Goes on with a paused track, or starts the queue when nothing is held.', (jukebox) => {
          if (jukebox.isPlaying !== true) this.music.togglePlayPause();
        }),
        act('stop', 'Stops the track and lets it go.', () => this.music.stop()),
        act(
          'stop_sound_effect',
          'Stops a sound effect for everyone while it sounds.',
          (jukebox, args) => jukebox.stopSE(this.listedSound(args['sound'] as string).identifier),
          objectInput({ sound: TRACK_REFERENCE }, ['sound'])
        ),
        act('next', 'Plays the next track of the queue.', () => this.music.next()),
        act(
          'previous',
          'Plays the previous track, or the current one again from the top when it is a few seconds in.',
          () => this.music.previous()
        ),
        act(
          'seek',
          "Moves the track to a point, for everyone; refused while the room's seek bar is locked.",
          (jukebox, args) => {
            if (jukebox.isSeekLocked) {
              throw new AgentToolError(
                'not_allowed',
                "The room's seek bar is locked; unlock it with set_seek_lock first."
              );
            }
            this.music.seek(args['seconds'] as number);
          },
          objectInput(
            { seconds: { type: 'number', minimum: 0, description: 'Seconds from the start of the track.' } },
            ['seconds']
          )
        ),
        act(
          'set_seek_lock',
          "Locks or unlocks the room's seek bar.",
          (jukebox, args) => {
            if (jukebox.isSeekLocked !== args['locked']) this.music.toggleSeekLock();
          },
          objectInput({ locked: { type: 'boolean' } }, ['locked'])
        ),
        act(
          'set_shuffle',
          'Turns shuffle on or off for the room; the system log says who did.',
          (jukebox, args) => {
            if (jukebox.shuffles !== args['on']) this.music.toggleShuffle();
          },
          objectInput({ on: { type: 'boolean' } }, ['on']),
          'gm'
        ),
        act(
          'set_repeat',
          "Sets how the room's music repeats, stepping the screen's button round to it; the system log says who did.",
          (jukebox, args) => {
            for (let step = 0; step < REPEAT_MODES.length && jukebox.repeatMode !== args['mode']; step++) {
              this.music.cycleRepeatMode();
            }
          },
          objectInput({ mode: { type: 'string', enum: REPEAT_MODES } }, ['mode']),
          'gm'
        ),
      ],
    };
  }

  private backgroundSound(): AgentKind<AmbientSound> {
    const soundOf = (ambient: AmbientSound) => BackgroundSound.of(ambient.audioIdentifier);
    const now = (ambient: AmbientSound) => ({
      playing: soundOf(ambient)?.isOn ?? false,
      volume: soundOf(ambient)?.level ?? 1,
    });
    return {
      kind: BackgroundSound.aliasName,
      description:
        'An ambient sound, such as rain or a crowd, looping for everyone beneath the music; several play at once. ' +
        'Listed are the sounds tagged BGS and any playing. Start and stop them with the actions.',
      list: () => {
        const playing = BackgroundSound.playing().map((sound) => sound.audioIdentifier);
        const tagged = this.audioStorage.audios
          .filter((audio) => !audio.isHidden && AudioTag.isBackgroundSound(audio.identifier))
          .map((audio) => audio.identifier);
        return [...new Set([...playing, ...tagged])].map((audioIdentifier) => ({ audioIdentifier }));
      },
      idOf: (ambient) => BackgroundSound.identifierOf(ambient.audioIdentifier),
      nameOf: (ambient) => this.soundName(ambient.audioIdentifier),
      fields: [
        textField<AmbientSound>('sound', 'The id of its sound.', null, (ambient) => ambient.audioIdentifier),
        flagField<AmbientSound>(
          'playing',
          'Whether it is playing for the room.',
          null,
          (ambient) => now(ambient).playing
        ),
        numberField<AmbientSound>(
          'volume',
          "How loud it plays for the room, from 0 to 1, before each seat's own volume.",
          null,
          { minimum: 0, maximum: 1 },
          (ambient) => now(ambient).volume
        ),
      ],
      actions: [
        {
          name: 'start',
          description: 'Starts it looping for everyone; one playing already goes on as it is.',
          access: 'write',
          input: objectInput(),
          run: (ambient) => {
            BackgroundSound.keepPlaying(ambient.audioIdentifier);
            return now(ambient);
          },
        },
        {
          name: 'stop',
          description: 'Stops it for everyone, letting it die away.',
          access: 'write',
          input: objectInput(),
          run: (ambient) => {
            this.ambient.stop(ambient.audioIdentifier);
            return now(ambient);
          },
        },
        {
          name: 'set_volume',
          description: 'Sets how loud it plays for the room while it plays.',
          access: 'write',
          input: objectInput({ volume: { type: 'number', minimum: 0, maximum: 1, description: 'From 0 to 1.' } }, [
            'volume',
          ]),
          run: (ambient, args) => {
            if (!now(ambient).playing) {
              throw new AgentToolError('not_allowed', 'Its volume is set while it plays; start it first.');
            }
            this.ambient.commitVolume(ambient.audioIdentifier, args['volume'] as number);
            return now(ambient);
          },
        },
      ],
    };
  }

  private playlistNamed(reference: string): Playlist {
    return findOne(
      Playlist.all(),
      reference,
      (playlist) => playlist.identifier,
      (playlist) => this.music.labelOf(playlist),
      'playlist'
    );
  }

  private playlist(): AgentKind<Playlist> {
    const tracksOf = (playlist: Playlist) =>
      playlist.entries.map((identifier) => ({ id: identifier, name: this.soundName(identifier) }));
    const entryOf = (playlist: Playlist, reference: string) =>
      findOne(
        tracksOf(playlist),
        reference,
        (track) => track.id,
        (track) => track.name,
        'track on the playlist'
      ).id;
    const isActive = (playlist: Playlist) => {
      const jukebox = this.objectStore.get('Jukebox');
      return jukebox instanceof Jukebox && jukebox.playlist === playlist;
    };
    return {
      kind: Playlist.aliasName,
      description:
        "A playlist of music tracks the jukebox can go on through. The room's first one cannot be taken away. " +
        'Only tracks tagged BGM go on a playlist. Play one through the jukebox.',
      list: () => Playlist.all(),
      idOf: (playlist) => playlist.identifier,
      nameOf: (playlist) => this.music.labelOf(playlist),
      fields: [
        textField<Playlist>(
          'name',
          'The name it was given; empty puts back the stand-in it goes by.',
          'write',
          (playlist) => playlist.name,
          (playlist, value) => {
            const next = value.trim();
            if (playlist.name !== next) playlist.name = next;
          },
          200
        ),
        {
          name: 'tracks',
          description: 'Its tracks in order: each id and name. The actions add, take off and move them.',
          schema: { type: 'array', items: { type: 'object', properties: {} } },
          access: null,
          read: tracksOf,
        },
        flagField<Playlist>('active', 'Whether the jukebox goes on through it.', null, isActive),
        flagField<Playlist>(
          'first',
          "Whether it is the room's first playlist.",
          null,
          (playlist) => playlist.isDefault
        ),
      ],
      create: {
        access: 'write',
        description: 'Makes a new, empty playlist.',
        input: objectInput(),
        make: () =>
          Playlist.create(this.t('feature.media.jukebox.playlistNewName', { number: Playlist.all().length + 1 })),
      },
      remove: {
        access: 'write',
        take: (playlist) => {
          if (playlist.isDefault) {
            throw new AgentToolError('not_allowed', "The room's first playlist cannot be taken away.");
          }
          const jukebox = this.objectStore.get('Jukebox');
          if (jukebox instanceof Jukebox && jukebox.playlistIdentifier === playlist.identifier) {
            jukebox.playlistIdentifier = '';
          }
          playlist.destroy();
        },
      },
      actions: [
        {
          name: 'add_track',
          description: 'Adds a music track to the end of it; one already on it stays where it is.',
          access: 'write',
          input: objectInput({ track: TRACK_REFERENCE }, ['track']),
          run: (playlist, args) => {
            const audio = this.listedSound(args['track'] as string);
            if ((AudioTag.get(audio.identifier)?.tag || 'BGM') !== 'BGM') {
              throw new AgentToolError(
                'not_allowed',
                `Only music goes on a playlist, and ${audio.name} is not tagged BGM.`
              );
            }
            playlist.addEntry(audio.identifier);
            return { tracks: tracksOf(playlist) };
          },
        },
        {
          name: 'remove_track',
          description: 'Takes a track off it.',
          access: 'write',
          input: objectInput({ track: TRACK_REFERENCE }, ['track']),
          run: (playlist, args) => {
            playlist.removeEntry(entryOf(playlist, args['track'] as string));
            return { tracks: tracksOf(playlist) };
          },
        },
        {
          name: 'move_track',
          description: 'Moves a track of it to another place, counted from 1.',
          access: 'write',
          input: objectInput({ track: TRACK_REFERENCE, to: POSITION }, ['track', 'to']),
          run: (playlist, args) => {
            const from = playlist.entries.indexOf(entryOf(playlist, args['track'] as string));
            playlist.moveEntry(from, Math.min(playlist.entries.length, args['to'] as number) - 1);
            return { tracks: tracksOf(playlist) };
          },
        },
      ],
    };
  }

  private effectPreset(): AgentKind<EffectPreset> {
    const amount = (
      name: string,
      description: string,
      bounds: { minimum?: number; maximum?: number; integer?: boolean },
      read: (preset: EffectPreset) => number,
      write: (preset: EffectPreset, value: number) => void
    ) => numberField<EffectPreset>(name, description, 'write', bounds, read, write);
    const within = (key: BoundedPresetNumber) => {
      const bounds = PRESET_NUMBER_BOUNDS[key];
      return { minimum: bounds.min, maximum: bounds.max, integer: bounds.integer };
    };
    const choice = <C extends string>(
      name: string,
      description: string,
      choices: readonly C[],
      read: (preset: EffectPreset) => string,
      write: (preset: EffectPreset, value: C) => void
    ) => choiceField<EffectPreset, C>(name, description, 'write', choices, read, write);
    const text = (
      name: string,
      description: string,
      read: (preset: EffectPreset) => string,
      write: (preset: EffectPreset, value: string) => void,
      maxLength = 200
    ) => textField<EffectPreset>(name, description, 'write', read, write, maxLength);
    const sound = (reference: string) => (reference.trim() ? this.anySound(reference).identifier : '');
    return {
      kind: EffectPreset.aliasName,
      description:
        "An effect of the room's library, fired at pieces or squares (see fire_effect): its look, colours, timing, " +
        'targets and sounds, or a run of stages. One kept for the game master is not listed for anyone else.',
      list: () => this.effects.shownPresets(),
      idOf: (preset) => preset.identifier,
      nameOf: (preset) => preset.name,
      fields: [
        text(
          'name',
          'Its name, which chat and the sheets fire it by.',
          (preset) => preset.name,
          (preset, value) => (preset.name = value)
        ),
        text(
          'family',
          'The family it is filed under in the library.',
          (preset) => preset.tagName,
          (preset, value) => (preset.tagName = value)
        ),
        choice<EffectKind>(
          'kind',
          'The look it draws (while it has no stages).',
          EFFECT_KINDS,
          (preset) => preset.kind,
          (preset, value) => (preset.kind = value)
        ),
        text(
          'color_primary',
          'Its main colour, such as #ffd27f.',
          (preset) => preset.colorPrimary,
          (preset, value) => (preset.colorPrimary = value),
          50
        ),
        text(
          'color_secondary',
          'Its second colour.',
          (preset) => preset.colorSecondary,
          (preset, value) => (preset.colorSecondary = value),
          50
        ),
        amount(
          'duration_ms',
          "How long one target's playback lasts, in ms (while it has no stages).",
          within('durationMs'),
          (preset) => preset.durationMs,
          (preset, value) => (preset.durationMs = value)
        ),
        amount(
          'stagger_ms',
          'How long each target waits after the one before, in ms.',
          within('staggerMs'),
          (preset) => preset.staggerMs,
          (preset, value) => (preset.staggerMs = value)
        ),
        amount(
          'scale',
          'How large it is drawn against a piece.',
          within('scale'),
          (preset) => preset.scale,
          (preset, value) => (preset.scale = value)
        ),
        flagField<EffectPreset>(
          'follow_target',
          'Whether it follows a target that moves.',
          'write',
          (preset) => preset.followTarget,
          (preset, value) => (preset.followTarget = value)
        ),
        choice(
          'targeting',
          'self casts on the caster, single on one target, multi on several.',
          EFFECT_TARGETING_OPTIONS,
          (preset) => preset.targeting,
          (preset, value) => (preset.targeting = value)
        ),
        amount(
          'max_targets',
          'How many targets one cast takes when targeting is multi.',
          within('maxTargets'),
          (preset) => preset.maxTargets,
          (preset, value) => (preset.maxTargets = value)
        ),
        amount(
          'area_radius',
          'How far it reaches, in squares, when targeting is multi; 0 to choose targets one at a time.',
          within('areaRadius'),
          (preset) => preset.areaRadius,
          (preset, value) => (preset.areaRadius = value)
        ),
        amount(
          'grade',
          'Its grade from 1 to 3: higher is thicker and runs longer.',
          within('grade'),
          (preset) => preset.grade,
          (preset, value) => (preset.grade = value)
        ),
        choice<string>(
          'particles',
          "The particles scattered along the way; empty for the look's own.",
          [...EFFECT_MOTE_OPTIONS, ...BEAM_LOOKS, ...AILMENT_LOOKS],
          (preset) => preset.moteStyle,
          (preset, value) => (preset.moteStyle = value)
        ),
        choice(
          'projectile_style',
          'For a projectile: what flies.',
          PROJECTILE_STYLES,
          (preset) => preset.projectileStyle,
          (preset, value) => (preset.projectileStyle = value)
        ),
        amount(
          'shots',
          'For a projectile: how many shots one firing makes.',
          within('shots'),
          (preset) => preset.shots,
          (preset, value) => (preset.shots = value)
        ),
        amount(
          'shot_interval',
          'For a projectile: ms between shots; 0 spreads them evenly.',
          within('shotInterval'),
          (preset) => preset.shotInterval,
          (preset, value) => (preset.shotInterval = value)
        ),
        choice<string>(
          'impact_kind',
          'For a projectile: the look it lands in; empty for an explosion.',
          ['', ...EFFECT_KINDS],
          (preset) => preset.impactKind,
          (preset, value) => (preset.impactKind = value)
        ),
        choice(
          'slash_style',
          'For a slash: the form of the cut.',
          SLASH_STYLE_OPTIONS,
          (preset) => preset.slashStyle,
          (preset, value) => (preset.slashStyle = value)
        ),
        {
          ...text(
            'sound',
            'The sound it fires with, by id (a name is taken when written); empty for none.',
            (preset) => preset.soundIdentifier,
            (preset, value) => (preset.soundIdentifier = sound(value))
          ),
          refuse: (_preset, value) => refusalOf(() => sound(value as string)),
        },
        {
          ...text(
            'impact_sound',
            'The sound of its landing, by id (a name is taken when written); empty for none.',
            (preset) => preset.impactSoundIdentifier,
            (preset, value) => (preset.impactSoundIdentifier = sound(value))
          ),
          refuse: (_preset, value) => refusalOf(() => sound(value as string)),
        },
        flagField<EffectPreset>(
          'gm_only',
          'Whether it is kept for the game master: no other seat lists or fires it.',
          'write',
          (preset) => preset.gmOnly,
          (preset, value) => (preset.gmOnly = value)
        ),
        {
          name: 'stages',
          description:
            'A run of stages that replaces the one look: travel (a look that flies), impact, field (left behind) and ' +
            `spawn (throws branches that each run its children). At most ${MAX_STAGES}; empty for the one look.`,
          schema: { type: 'array', maxItems: MAX_STAGES, items: stageSchema(true) },
          access: 'write',
          read: (preset) => preset.stageList,
          refuse: (_preset, value) => {
            const stages = value as EffectStage[];
            const wrong = [...stages, ...stages.flatMap((each) => each.children ?? [])].find(
              (stage) => !kindsForRole(stage.role).includes(stage.kind)
            );
            return wrong ? `A ${wrong.role} stage cannot draw ${wrong.kind}.` : null;
          },
          put: (preset, value) => {
            preset.stages = encodeEffectStages(value as EffectStage[]);
          },
        },
      ],
      create: {
        access: 'write',
        description: "Makes a blank effect, as the library's new-effect button does.",
        input: objectInput(),
        make: () => this.effects.create(this.t('feature.effect.newPresetName')),
      },
      remove: { access: 'write', take: (preset) => this.effects.remove(preset) },
      actions: [
        {
          name: 'duplicate',
          description: 'Makes a copy of it under a name of its own, which is how to alter one without losing it.',
          access: 'write',
          input: objectInput(),
          run: (preset) => {
            const copy = this.effects.duplicate(preset);
            return { id: copy.identifier, name: copy.name };
          },
        },
      ],
    };
  }
}

/**
 * Why a value names nothing this seat may use, as the lookup it goes through refuses it, so the call is
 * refused before any field of it is written; null where it names one.
 */
function refusalOf(lookUp: () => unknown): string | null {
  try {
    lookUp();
    return null;
  } catch (error) {
    if (error instanceof AgentToolError) return error.message;
    throw error;
  }
}

/** How long a ready-made arrival or departure takes, as an action was told. */
function presetMsOf(args: AgentArgs): number {
  return typeof args['ms'] === 'number' ? args['ms'] : DEFAULT_PRESET_MS;
}

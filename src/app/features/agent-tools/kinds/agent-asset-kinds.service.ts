import { inject, Injectable } from '@angular/core';
import { type AgentSquare, AgentViews } from '@axe/application/agent/agent-views.service';
import { StealthService } from '@axe/application/character/stealth.service';
import { AssetOwnershipService } from '@axe/application/file/asset-ownership.service';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { PartyService } from '@axe/application/party/party.service';
import { DisclosureService } from '@axe/application/permission/disclosure.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PiecePartsService } from '@axe/application/tabletop/piece-parts.service';
import { RideService } from '@axe/application/tabletop/ride.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import { Network } from '@axe/core/network/network';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import type { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { type ModelFile, modelNameOf } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import type { DataElement } from '@axe/domain/data/data-element';
import { DisclosureMode, normalizeDisclosureMode } from '@axe/domain/disclosure/disclosure';
import { fileUnderFolder } from '@axe/domain/folder/folder-path';
import { ASSET_OWNER_ALIAS, AssetOwner } from '@axe/domain/media/asset-owner';
import { AssetRemoval, type AssetRemovalKind } from '@axe/domain/media/asset-removal';
import { readAudioAnalysis } from '@axe/domain/media/audio-analysis';
import { AUDIO_TAG_BGS, AudioTag } from '@axe/domain/media/audio-tag';
import { readBeatGrid } from '@axe/domain/media/beat-grid';
import { readCuePoints } from '@axe/domain/media/cue-points';
import { browsableImageTags, canBrowseImage, ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { IMAGE_TAG_LOCK_ALIAS } from '@axe/domain/media/image-tag-lock';
import { MODEL_TAG_ALIAS, ModelTag } from '@axe/domain/media/model-tag';
import { Playlist } from '@axe/domain/media/playlist';
import type { Party } from '@axe/domain/party/party';
import { isAccountAvatar } from '@axe/domain/peer/account-avatar';
import { mayBeOffered } from '@axe/domain/peer/chosen-seat';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { asMoveMode, MOVE_MODES } from '@axe/domain/tabletop/move/move-mode';
import { MAX_MODEL_SCALE, MIN_MODEL_SCALE, modelScaleOf, modelTurnOf } from '@axe/domain/tabletop/piece-model';
import { RangeArea } from '@axe/domain/tabletop/range';
import { FOLLOWABLE_RANGE_TYPES } from '@axe/domain/tabletop/range-coverage';
import type { RideSeat } from '@axe/domain/tabletop/ride/ride-rules';
import { seatOf } from '@axe/domain/tabletop/ride/ride-rules';
import { asSolidKind, solidFitsShape, type SolidKind } from '@axe/domain/tabletop/solid/solid-kind';
import { applyVisionShape, asVisionShape, VISION_SHAPES, VisionShape } from '@axe/domain/tabletop/vision-shape';
import { applyLightPreset, LightAnimation, LightPreset, VisionType } from '@axe/domain/tabletop/vision-types';
import { VN_PORTRAIT_SLOT_COUNT } from '@axe/domain/visual-novel/vn-portrait-position';
import { findOne } from '@axe/features/agent-tools/agent-lookup';
import {
  type AgentArgs,
  type AgentKind,
  type AgentKindAction,
  type AgentKindField,
  type AnyAgentKind,
  anyKind,
  choiceField,
  flagField,
  numberField,
  objectInput,
  textField,
} from '@axe/features/agent-tools/kinds/agent-kind';
import { AgentSquares, SQUARE_SCHEMA } from '@axe/features/agent-tools/kinds/agent-squares.service';

/** The label the list of pictures goes by for every tag, which no tag may take. */
const ALL_TAG = '__all__';

/** The tags the jukebox always offers a track, whatever the tracks are filed under. */
const PRESET_AUDIO_TAGS = ['BGM', 'SE', AUDIO_TAG_BGS];

/** The shapes of a range as the AI names them, by the names the table knows them by. */
const RANGE_SHAPES = {
  circle: 'CIRCLE',
  square: 'SQUARE',
  rhombus: 'RHOMBUS',
  triangle: 'TRIANGLE',
  pentagon: 'PENTAGON',
  hexagon: 'HEXAGON',
  line: 'LINE',
  cone: 'CORN',
} as const;

type RangeShape = keyof typeof RANGE_SHAPES;

const RANGE_SHAPE_NAMES = Object.keys(RANGE_SHAPES) as RangeShape[];

/** What a range stands up as, as the AI names it, flat for none. */
const SOLIDS = ['flat', 'column', 'sphere', 'cone', 'beam'] as const;

/** Where a piece is kept, as the AI names it. */
const LOCATIONS = ['table', 'common', 'personal', 'graveyard'] as const;

type PieceLocation = (typeof LOCATIONS)[number];

/** The seats a piece may take on a mount, as the AI names them. */
const RIDE_SEATS = ['rider', 'passenger', 'cargo'] as const;

/** The highest place a portrait may stand in chat, counted from 0. */
const LAST_PORTRAIT_POSITION = VN_PORTRAIT_SLOT_COUNT - 1;

/** A picture, a sound or a 3D model the room holds, as the asset kinds go by it. */
interface HeldAsset {
  readonly identifier: string;
  readonly kind: AssetRemovalKind;
  readonly name: string;
}

/** An asset this seat may take out of the room, or one the room keeps taken out. */
interface RemovableAsset extends HeldAsset {
  readonly removed: boolean;
}

/** Refuses what the screen would not let be done, with why. */
function refused(reason: string): never {
  throw new AgentToolError('not_allowed', reason);
}

/** What a range stands up as, from the name the AI gives it. */
function solidOf(name: string): SolidKind {
  return name === 'flat' ? '' : asSolidKind(name);
}

/** Why a lookup by id or name finds no one thing, as it would refuse, or null where it finds one. */
function lookupRefusal(find: () => unknown): string | null {
  try {
    find();
    return null;
  } catch (error) {
    if (error instanceof AgentToolError) return error.message;
    throw error;
  }
}

/** The kind a removal record names, reading one it does not know as a picture, as an older version wrote it. */
function removalKindOf(kind: string): AssetRemovalKind {
  return kind === 'audio' || kind === 'model' ? kind : 'image';
}

/**
 * The kinds of the pictures, sounds and models held, their tags, locks, owners and removals, and the pieces,
 * their sheets and the ranges on the table, as the AI link's generic tools offer them: each listed as this
 * seat comes across it on the screen, and changed through the services the screen's own hand goes through.
 */
@Injectable({ providedIn: 'root' })
export class AgentAssetKinds {
  private readonly views = inject(AgentViews);
  private readonly tabletop = inject(TabletopService);
  private readonly actions = inject(TabletopActionService);
  private readonly ground = inject(StandingGroundService);
  private readonly permission = inject(RolePermissionService);
  private readonly disclosure = inject(DisclosureService);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly ownership = inject(AssetOwnershipService);
  private readonly removal = inject(AssetRemovalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly imageStorage = inject(ImageStorage);
  private readonly audioStorage = inject(AudioStorage);
  private readonly modelStorage = inject(ModelStorage);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly stealth = inject(StealthService);
  private readonly parties = inject(PartyService);
  private readonly ride = inject(RideService);
  private readonly parts = inject(PiecePartsService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly squares = inject(AgentSquares);

  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.imageTag()),
    anyKind(this.imageTagLock()),
    anyKind(this.audioTag()),
    anyKind(this.modelTag()),
    anyKind(this.assetOwner()),
    anyKind(this.assetRemoval()),
    anyKind(this.character()),
    anyKind(this.range()),
  ];

  /**
   * The pictures this seat may pick from, as the list of pictures shows them: none the master keeps
   * from it, none filed under a tag someone else locked, none the tool brought, and no account's avatar.
   */
  private pictures(): ImageFile[] {
    const sight = this.tagLock.sight();
    return this.imageStorage.images.filter(
      (image) => !isAccountAvatar(image.identifier) && canBrowseImage(ImageTag.get(image.identifier), sight)
    );
  }

  /** The sounds the jukebox lists: every one held but those kept out of its list. */
  private sounds(): AudioFile[] {
    return this.audioStorage.audios.filter((audio) => !audio.isHidden);
  }

  /** Every picture, sound and model this seat comes across in the lists of them. */
  private heldAssets(): HeldAsset[] {
    return [
      ...this.pictures().map((image) => ({ identifier: image.identifier, kind: 'image' as const, name: image.name })),
      ...this.sounds().map((audio) => ({ identifier: audio.identifier, kind: 'audio' as const, name: audio.name })),
      ...this.modelStorage.models.map((model) => ({
        identifier: model.identifier,
        kind: 'model' as const,
        name: modelNameOf(model.name),
      })),
    ];
  }

  /**
   * Why a picture may not be filed under a tag, as the list of pictures refuses it: the tool's own, the
   * label for every tag, and one someone else keeps from this seat; null where it may.
   */
  private fileUnderRefusal(tag: string): string | null {
    if (tag === SYSTEM_RESERVED_TAG || tag === ALL_TAG || tag === this.t('feature.file.fileStorage.all')) {
      return `${tag} is a tag the room keeps for itself.`;
    }
    return this.tagLock.mayFileUnder(tag)
      ? null
      : `Someone else keeps the tag ${tag} locked, so this seat may not file under it.`;
  }

  private imageTag(): AgentKind<ImageFile> {
    const tagOf = (image: ImageFile) => ImageTag.get(image.identifier);
    const held = (image: ImageFile) => tagOf(image) ?? ImageTag.create(image.identifier);
    return {
      kind: ImageTag.aliasName,
      description:
        'A picture the room holds, with the tag it is filed under in the list of pictures. Only the pictures this seat may pick from are listed: none the game master keeps secret from it, none filed under a tag someone else locked, none the tool brought with it. A picture is never made or taken away here (see asset-removal).',
      list: () => this.pictures(),
      idOf: (image) => image.identifier,
      nameOf: (image) => image.name,
      fields: [
        {
          ...textField<ImageFile>(
            'tag',
            'The tag it is filed under, empty for none. Not a tag the room keeps for itself, nor one someone else locked.',
            'write',
            (image) => tagOf(image)?.tag ?? '',
            (image, value) => {
              held(image).tag = value;
            },
            200
          ),
          refuse: (_image, value) => this.fileUnderRefusal(value as string),
        },
        flagField<ImageFile>(
          'secret',
          "Whether the game master keeps it out of the players' lists and pickers. A picture already on the table still shows.",
          'gm',
          (image) => tagOf(image)?.isSecret ?? false,
          (image, value) => {
            held(image).isSecret = value;
          }
        ),
      ],
    };
  }

  /**
   * The tags the list of pictures offers above them, as it offers them: those of the pictures this
   * seat may browse, so none the tool keeps, the master keeps back or someone else locks from it.
   */
  private pictureTags(): string[] {
    return browsableImageTags(this.imageStorage.images, this.tagLock.sight());
  }

  private imageTagLock(): AgentKind<string> {
    return {
      kind: IMAGE_TAG_LOCK_ALIAS,
      description:
        "A tag pictures are filed under, and whether someone keeps it locked: a locked tag's pictures stay out of everyone's lists and pickers but its holder's and the game master's. The tags listed are those the list of pictures offers this seat.",
      list: () => this.pictureTags(),
      idOf: (tag) => tag,
      nameOf: (tag) => tag,
      refuse: (tag) =>
        this.tagLock.mayToggle(tag)
          ? null
          : 'Someone else keeps this tag locked; only they and the game master unlock it.',
      fields: [
        flagField<string>('locked', 'Whether someone keeps it locked now.', null, (tag) => this.tagLock.isLocked(tag)),
        flagField<string>('locked_by_this_seat', 'Whether this seat is the one keeping it locked.', null, (tag) =>
          this.tagLock.isMine(tag)
        ),
      ],
      actions: [
        {
          name: 'toggle',
          description:
            'Locks the tag to this seat where nobody keeps it, or unlocks it where this seat (or, for the game master, anyone) keeps it.',
          access: 'write',
          input: objectInput(),
          run: (tag) => {
            this.tagLock.toggle(tag);
            return { tag, locked: this.tagLock.isLocked(tag) };
          },
        },
      ],
    };
  }

  /** The tags the jukebox offers a track: the three it always does, and every other one a track is filed under. */
  private soundTags(): string[] {
    const tags = new Set(PRESET_AUDIO_TAGS);
    for (const audio of this.sounds()) tags.add(AudioTag.get(audio.identifier)?.tag || 'BGM');
    return [...tags].sort();
  }

  private audioTag(): AgentKind<AudioFile> {
    const tags = () => this.soundTags();
    const tagOf = (audio: AudioFile) => AudioTag.get(audio.identifier);
    const tagField: AgentKindField<AudioFile> = {
      name: 'tag',
      description:
        'What it is filed under: BGM for music, SE for a sound effect, BGS for an ambient sound that loops under the music, or another tag a track already has. A track on a playlist keeps its tag.',
      get schema(): AgentSchema {
        return { type: 'string', enum: tags() };
      },
      access: 'write',
      read: (audio) => tagOf(audio)?.tag || 'BGM',
      put: (audio, value) => {
        (tagOf(audio) ?? AudioTag.create(audio.identifier)).tag = value as string;
        this.objectChange.notifyCollectionChanged(AudioTag.aliasName);
      },
      refuse: (audio) =>
        Playlist.all().some((playlist) => playlist.hasEntry(audio.identifier))
          ? 'A track on a playlist keeps its tag; take it off every playlist first.'
          : null,
    };
    return {
      kind: AudioTag.aliasName,
      description:
        'A sound the room holds, with the tag the jukebox files it under and what was read of it. Its loudness, tempo and marks are worked out by the screen and only read here. A sound is never made or taken away here (see asset-removal).',
      list: () => this.sounds(),
      idOf: (audio) => audio.identifier,
      nameOf: (audio) => audio.name,
      fields: [
        tagField,
        {
          name: 'analysis',
          description:
            'What was read of it: length, start and end of the sound in seconds, loudness (lufs) and peak in dB, tempo in beats a minute (bpm) and how sure that is; null until it has been read.',
          schema: { type: 'object', properties: {}, additionalProperties: true },
          access: null,
          read: (audio) => readAudioAnalysis(tagOf(audio)?.analysis),
        },
        {
          name: 'beat_grid',
          description: 'The beats set by hand: bpm and when a bar starts in seconds; null while the reading is used.',
          schema: { type: 'object', properties: {}, additionalProperties: true },
          access: null,
          read: (audio) => readBeatGrid(tagOf(audio)?.beatGrid),
        },
        {
          name: 'cues',
          description: 'The places marked in it to jump to, in seconds, null for a slot not set.',
          schema: { type: 'array', items: { type: 'number' } },
          access: null,
          read: (audio) => readCuePoints(tagOf(audio)?.cues),
        },
      ],
    };
  }

  private modelTag(): AgentKind<ModelFile> {
    return {
      kind: MODEL_TAG_ALIAS,
      description:
        'A 3D model the room holds, with the tag the list of models sorts it by. A model is never made or taken away here (see asset-removal).',
      list: () => this.modelStorage.models,
      idOf: (model) => model.identifier,
      nameOf: (model) => modelNameOf(model.name),
      fields: [
        textField<ModelFile>(
          'tag',
          'The tag it is sorted by, empty for none.',
          'write',
          (model) => ModelTag.get(model.identifier)?.tag ?? '',
          (model, value) => {
            ModelTag.tagWith(model.identifier, value.trim());
          },
          200
        ),
      ],
    };
  }

  private assetOwner(): AgentKind<AssetOwner> {
    const assetOf = (record: AssetOwner) =>
      this.heldAssets().find((asset) => asset.identifier === record.assetIdentifier) ?? null;
    return {
      kind: ASSET_OWNER_ALIAS,
      description:
        "Who added a picture, a sound or a 3D model, the one besides the game master who may remove it from the room. Listed for the assets this seat comes across; the room keeps it and nobody changes it. Its id is the asset's.",
      list: () => {
        const seen = new Set(this.heldAssets().map((asset) => asset.identifier));
        return AssetOwner.all().filter((record) => seen.has(record.assetIdentifier));
      },
      idOf: (record) => record.assetIdentifier,
      nameOf: (record) => assetOf(record)?.name ?? record.assetIdentifier,
      fields: [
        choiceField<AssetOwner, AssetRemovalKind>(
          'asset_kind',
          'What it is: a picture, a sound or a 3D model.',
          null,
          ['image', 'audio', 'model'],
          (record) => removalKindOf(record.kind)
        ),
        flagField<AssetOwner>('added_by_this_seat', 'Whether this seat added it.', null, (record) =>
          this.ownership.isMine(record.assetIdentifier)
        ),
        textField<AssetOwner>(
          'added_by',
          'The seat that added it, where that seat is in the room and goes by its account.',
          null,
          (record) => PeerCursor.findByUserId(record.owner)?.name
        ),
      ],
    };
  }

  /**
   * The assets this seat may take out of the room, as the lists of them let it: a person's, named by
   * their hash, and for a player only those they added; and, for the game master, those the room keeps
   * taken out.
   */
  private removableAssets(): RemovableAsset[] {
    const held = this.heldAssets().filter((asset) => !AssetRemoval.get(asset.identifier)?.isRemoved);
    const removable = (['image', 'audio', 'model'] as const).flatMap((kind) =>
      this.removal.removable(
        kind,
        held.filter((asset) => asset.kind === kind).map((asset) => asset.identifier)
      )
    );
    const listed: RemovableAsset[] = held
      .filter((asset) => removable.includes(asset.identifier))
      .map((asset) => ({ ...asset, removed: false }));
    if (!this.permission.canEditShared()) return listed;
    const gone = AssetRemoval.all()
      .filter((record) => record.isRemoved)
      .map((record) => ({
        identifier: record.assetIdentifier,
        kind: removalKindOf(record.kind),
        name: record.assetIdentifier,
        removed: true,
      }));
    return [...listed, ...gone];
  }

  private assetRemoval(): AgentKind<RemovableAsset> {
    return {
      kind: AssetRemoval.aliasName,
      description:
        "A picture, a sound or a 3D model this seat may take out of the whole room: the game master any a person added, a player only those they added. The game master also sees those taken out, by their id, to put back. Its id is the asset's.",
      list: () => this.removableAssets(),
      idOf: (asset) => asset.identifier,
      nameOf: (asset) => asset.name,
      refuse: (asset) =>
        asset.removed || this.removal.mayRemove(asset.identifier)
          ? null
          : 'A player takes out only what they added themselves.',
      fields: [
        choiceField<RemovableAsset, AssetRemovalKind>(
          'asset_kind',
          'What it is: a picture, a sound or a 3D model.',
          null,
          ['image', 'audio', 'model'],
          (asset) => asset.kind
        ),
        flagField<RemovableAsset>(
          'removed',
          'Whether the room keeps it taken out now.',
          null,
          (asset) => asset.removed
        ),
        flagField<RemovableAsset>('added_by_this_seat', 'Whether this seat added it.', null, (asset) =>
          this.ownership.isMine(asset.identifier)
        ),
        numberField<RemovableAsset>(
          'uses',
          'How many things in the room show or play it: pieces, tables, cut-ins, the music and the like.',
          null,
          { minimum: 0, integer: true },
          (asset) => this.removal.countUses([asset.identifier])
        ),
      ],
      actions: [
        {
          name: 'remove',
          description:
            'Takes it out of the whole room: every seat lets go of it and what used it shows nothing in its place. Music, an ambient sound or a cut-in playing it is stopped first. The game master can put it back.',
          access: 'write',
          destructive: true,
          input: objectInput(),
          run: (asset) => {
            if (asset.removed) throw new AgentToolError('invalid_input', 'The room has taken it out already.');
            if (this.removal.remove(asset.kind, [asset.identifier]) < 1) {
              refused('This seat may not take it out of the room.');
            }
            return { removed: { id: asset.identifier, name: asset.name } };
          },
        },
        {
          name: 'restore',
          description:
            'Lets the room have it again. Every seat let go of its bytes, so it shows again once someone adds the same file; until then nothing does.',
          access: 'gm',
          input: objectInput(),
          run: (asset) => {
            if (!asset.removed) throw new AgentToolError('invalid_input', 'The room has not taken it out.');
            if (!this.removal.putBack(asset.identifier)) refused('Only the game master puts back what was taken out.');
            return { restored: { id: asset.identifier } };
          },
        },
      ],
    };
  }

  /**
   * The pieces this seat comes across: on the table where it sees them, and in the shared, its own
   * and the graveyard's inventory, as the inventory lists them.
   */
  private pieces(): GameCharacter[] {
    const off = this.objectStore
      .getObjects<GameCharacter>(GameCharacter)
      .filter(
        (piece) =>
          piece.location.name !== 'table' &&
          (this.inventory.commonInventory.classifier(piece) ||
            this.inventory.privateInventory.classifier(piece) ||
            this.inventory.graveyardInventory.classifier(piece))
      );
    return [...this.views.visiblePieces(), ...off];
  }

  /** A piece on the table this seat sees, by id or name. */
  private seenPiece(reference: string): GameCharacter {
    return findOne(
      this.views.visiblePieces(),
      reference,
      (piece) => piece.identifier,
      (piece) => this.views.nameOf(piece),
      'piece'
    );
  }

  /** The id of a piece as this seat may be told it: empty for none, and left out for one it does not see. */
  private seenId(piece: GameCharacter | null): string | undefined {
    if (!piece) return '';
    return this.views.sees(piece) ? piece.identifier : undefined;
  }

  /** Where a piece is kept, as the AI names it. */
  private locationOf(piece: GameCharacter): PieceLocation {
    const name = piece.location.name;
    if (name === 'table' || name === 'graveyard') return name;
    return name === Network.instance.peerId ? 'personal' : 'common';
  }

  /** The seats a piece may be given to, as the owner menu offers them: this seat first, then those present. */
  private ownerCandidates(piece: GameCharacter): PeerCursor[] {
    const others = Network.instance.peerContexts
      .map((context) => PeerCursor.findByPeerId(context.peerId))
      .filter((cursor): cursor is PeerCursor => !!cursor && !cursor.isMine && mayBeOffered(cursor, [piece.owner]));
    return PeerCursor.myCursor ? [PeerCursor.myCursor, ...others] : others;
  }

  /** The seats a piece's sheet may be shown to, as the disclosure menu offers them: the players present. */
  private audienceCandidates(piece: GameCharacter): PeerCursor[] {
    return Network.instance.peerContexts
      .map((context) => PeerCursor.findByPeerId(context.peerId))
      .filter(
        (cursor): cursor is PeerCursor =>
          !!cursor && !cursor.isMine && !cursor.isGameMaster && mayBeOffered(cursor, piece.disclosureUserIds)
      );
  }

  /** The user of a seat named among some, by its name or its user, or empty for none of them. */
  private seatNamed(seats: readonly PeerCursor[], name: string): string {
    return seats.find((seat) => seat.name === name || seat.userId === name)?.userId ?? '';
  }

  /** Why a name names none of the seats offered, naming those that are, or null where it names one. */
  private seatRefusal(seats: readonly PeerCursor[], name: string): string | null {
    if (this.seatNamed(seats, name)) return null;
    const offered = seats.map((seat) => seat.name).join(', ');
    return `${name} is not a seat offered here${offered ? ` (offered: ${offered})` : ''}.`;
  }

  /** A party by id or name. */
  private partyNamed(reference: string): Party {
    return findOne(
      this.parties.parties(),
      reference,
      (party) => party.identifier,
      (party) => party.name,
      'party'
    );
  }

  private character(): AgentKind<GameCharacter> {
    return {
      kind: GameCharacter.aliasName,
      description:
        "A piece: on the table, or kept in the shared inventory, this seat's own or the graveyard. Its sheet's values, resources and buffs go through get_piece, set_sheet_value, change_resource, add_buff and remove_buff, and a move on the table through move_piece. A piece whose sheet this seat may not open can only be read, and its settings are left out.",
      list: () => this.pieces(),
      idOf: (piece) => piece.identifier,
      nameOf: (piece) => this.views.nameOf(piece),
      refuse: (piece) =>
        this.views.sheetOpen(piece) ? null : 'This seat may not open this piece, so it is not its to change.',
      fields: [
        ...this.pieceLookFields(),
        ...this.pieceHandlingFields(),
        ...this.pieceSightFields(),
        ...this.pieceRideFields(),
      ],
      create: {
        access: 'write',
        description:
          'Lays a new piece with the default name on the table, in view, at a square or the middle of the table, owned by this seat; one the game master makes starts with its sheet shown to the master only. create_piece does the same with a picture and sheet values.',
        input: objectInput({
          at: { ...SQUARE_SCHEMA, description: 'The square to lay it in. Leave out for the middle of the table.' },
        }),
        make: (args) => {
          const corner = this.squares.pointOrMiddle(args['at'] as AgentSquare | undefined, 'corner');
          const half = this.tabletop.currentTable.gridSize / 2;
          const middle = { x: corner.x + half, y: corner.y + half };
          return this.actions.createGameCharacter({ ...middle, z: this.ground.heightPxAt(middle.x, middle.y) });
        },
      },
      remove: {
        access: 'write',
        take: (piece) => {
          if (piece.location.name !== 'graveyard') {
            refused('Only a piece in the graveyard is deleted, as on the screen: set its location to graveyard first.');
          }
          piece.destroy();
        },
      },
      actions: this.pieceActions(),
    };
  }

  /** Reads a setting of a piece only where this seat may open it, as its settings are kept to its sheet. */
  private onSheet<T>(read: (piece: GameCharacter) => T): (piece: GameCharacter) => T | undefined {
    return (piece) => (this.views.sheetOpen(piece) ? read(piece) : undefined);
  }

  /** What a piece is called, what it looks like, where it is kept and whose it is. */
  private pieceLookFields(): AgentKindField<GameCharacter>[] {
    return [
      {
        ...textField<GameCharacter>(
          'name',
          'Its name. Left out where its name is hidden from this seat.',
          'write',
          (piece) => (this.views.nameOf(piece) === piece.name ? piece.name : undefined),
          (piece, value) => {
            piece.name = value;
          },
          200
        ),
        refuse: (piece) => (this.views.nameOf(piece) === piece.name ? null : 'Its name is hidden from this seat.'),
      },
      {
        name: 'square',
        description: 'The square it stands on, null where it is off the table. move_piece moves it.',
        schema: SQUARE_SCHEMA,
        access: null,
        read: (piece) => (piece.location.name === 'table' ? this.views.squareOf(piece) : null),
      },
      choiceField<GameCharacter, PieceLocation>(
        'location',
        "Where it is kept: on the table, in the shared inventory, in this seat's own, or in the graveyard. Back on the table it stands where it stood.",
        'write',
        LOCATIONS,
        (piece) => this.locationOf(piece),
        (piece, value) => piece.setLocation(value === 'personal' ? Network.instance.peerId : value)
      ),
      numberField<GameCharacter>(
        'size',
        'How many squares wide it is.',
        'write',
        { minimum: 0.5, maximum: 20 },
        (piece) => piece.size,
        (piece, value) => {
          piece.size = value;
        }
      ),
      numberField<GameCharacter>(
        'altitude',
        'How high above what it stands on, in squares.',
        'write',
        {},
        (piece) => piece.altitude,
        (piece, value) => {
          piece.altitude = value;
        }
      ),
      numberField<GameCharacter>(
        'rotation',
        'How far it is turned, in degrees clockwise.',
        'write',
        {},
        this.onSheet((piece) => piece.rotate),
        (piece, value) => {
          piece.rotate = value;
        }
      ),
      {
        ...textField<GameCharacter>(
          'image',
          'The id of its picture. Written as the id or name of a picture this seat may pick (see image-tag).',
          'write',
          (piece) => this.pictureSlot(piece)?.value ?? '',
          (piece, value) => {
            this.pictureSlot(piece)!.value = this.picture(value).identifier;
          },
          200
        ),
        refuse: (piece, value) =>
          this.pictureSlot(piece)
            ? lookupRefusal(() => this.picture(value as string))
            : 'This piece has no place for a picture.',
      },
      {
        ...textField<GameCharacter>(
          'model',
          'The id of the 3D model it is drawn as on a table drawn in 3D, empty for its picture. Written as the id or name of a model held here (see model-tag), or empty.',
          'write',
          (piece) => piece.modelIdentifier ?? '',
          (piece, value) => {
            piece.modelIdentifier = value === '' ? '' : this.readyModel(value).identifier;
            this.objectChange.notifyChanged(piece.identifier);
          },
          200
        ),
        refuse: (_piece, value) => (value === '' ? null : lookupRefusal(() => this.readyModel(value as string))),
      },
      numberField<GameCharacter>(
        'model_scale',
        'How many times larger than its footprint its model is drawn.',
        'write',
        { minimum: MIN_MODEL_SCALE, maximum: MAX_MODEL_SCALE },
        (piece) => modelScaleOf(piece.modelScale),
        (piece, value) => {
          piece.modelScale = `${modelScaleOf(value)}`;
          this.objectChange.notifyChanged(piece.identifier);
        }
      ),
      numberField<GameCharacter>(
        'model_turn',
        'How far its model is turned from the way the piece faces, in degrees clockwise.',
        'write',
        { minimum: 0, maximum: 360 },
        (piece) => modelTurnOf(piece.modelTurn),
        (piece, value) => {
          piece.modelTurn = `${modelTurnOf(value)}`;
          this.objectChange.notifyChanged(piece.identifier);
        }
      ),
      {
        name: 'chat_colours',
        description: 'The three colours its chat lines may be written in, as #rrggbb, the first the usual one.',
        schema: { type: 'array', items: { type: 'string', maxLength: 32 }, minItems: 3, maxItems: 3 },
        access: 'write',
        read: this.onSheet((piece) => [...piece.chatColorCode]),
        put: (piece, value) => {
          (value as string[]).forEach((code, slot) => (piece.chatColorCode[slot] = code));
          piece.touchChatColors();
        },
      },
      numberField<GameCharacter>(
        'portrait_position',
        `Where its portrait stands when it speaks in chat, from 0 at the left to ${LAST_PORTRAIT_POSITION}; null where it has never been set.`,
        'write',
        { minimum: 0, maximum: LAST_PORTRAIT_POSITION, integer: true },
        this.onSheet((piece) => piece.portraitPosition),
        (piece, value) => {
          piece.portraitPosition = value;
        }
      ),
      {
        ...textField<GameCharacter>(
          'owner',
          'The seat it belongs to, by name, empty for nobody. The game master and its owner give it away; a player may take one nobody owns.',
          'write',
          (piece) => (piece.owner ? this.views.seatName(piece.owner) : ''),
          (piece, value) => {
            piece.owner = value === '' ? '' : this.seatNamed(this.ownerCandidates(piece), value);
            piece.update();
          },
          200
        ),
        refuse: (piece, value) => {
          if (!this.disclosure.canSetOwner(piece))
            return "Whose a piece is, is its owner's and the game master's to say.";
          return value === '' ? null : this.seatRefusal(this.ownerCandidates(piece), value as string);
        },
      },
      {
        ...choiceField<GameCharacter, DisclosureMode>(
          'shown_to',
          'Who may open its sheet: everyone, the game master only, or the seats chosen in shown_to_seats.',
          'write',
          [DisclosureMode.All, DisclosureMode.GameMaster, DisclosureMode.Selected],
          (piece) => normalizeDisclosureMode(piece.disclosureMode),
          (piece, value) => {
            piece.disclosureMode = value;
            piece.update();
          }
        ),
        refuse: (piece) => this.disclosureRefusal(piece),
      },
      {
        name: 'shown_to_seats',
        description: 'The players, by seat name, its sheet is shown to; writing them shows it to those seats alone.',
        schema: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 50 },
        access: 'write',
        read: (piece) => piece.disclosureUserIds.map((userId) => this.views.seatName(userId)),
        put: (piece, value) => {
          const seats = this.audienceCandidates(piece);
          piece.disclosureUserIds = (value as string[]).map((name) => this.seatNamed(seats, name));
          piece.disclosureMode = DisclosureMode.Selected;
          piece.update();
        },
        refuse: (piece, value) => {
          const seats = this.audienceCandidates(piece);
          return (
            this.disclosureRefusal(piece) ??
            (value as string[]).map((name) => this.seatRefusal(seats, name)).find((reason) => reason !== null) ??
            null
          );
        },
      },
      {
        ...textField<GameCharacter>(
          'party',
          'The id of the party it is in, empty for none. Written as the id or name of a party, or empty.',
          'gm',
          (piece) => this.parties.partyOf(piece)?.identifier ?? '',
          (piece, value) => this.parties.assign(piece, value === '' ? '' : this.partyNamed(value).identifier),
          200
        ),
        refuse: (_piece, value) => (value === '' ? null : lookupRefusal(() => this.partyNamed(value as string))),
      },
    ];
  }

  /** Why this seat may not say who a piece's sheet is shown to, or null where it may. */
  private disclosureRefusal(piece: GameCharacter): string | null {
    return this.disclosure.canEdit(piece)
      ? null
      : "Who a piece's sheet is shown to is its owner's and the game master's to say.";
  }

  /** The place a piece keeps the id of its picture in, or null for a piece with none. */
  private pictureSlot(piece: GameCharacter): DataElement | null {
    return piece.imageDataElement?.getFirstElementByName('imageIdentifier') ?? null;
  }

  /** A picture this seat may pick, by id or name, as the picture picker offers them. */
  private picture(reference: string): ImageFile {
    return findOne(
      this.pictures(),
      reference,
      (image) => image.identifier,
      (image) => image.name,
      'picture'
    );
  }

  /** A model held here in full, by id or name, as the model fields offer them. */
  private readyModel(reference: string): ModelFile {
    return findOne(
      this.modelStorage.models.filter((model) => model.isReady),
      reference,
      (model) => model.identifier,
      (model) => modelNameOf(model.name),
      'model'
    );
  }

  /** How a piece is handled and shown: its toggles, its folder and the way it gets about. */
  private pieceHandlingFields(): AgentKindField<GameCharacter>[] {
    return [
      flagField<GameCharacter>(
        'npc',
        'Whether it is one the game master plays rather than a player.',
        'gm',
        (piece) => piece.isNpc,
        (piece, value) => {
          piece.isNpc = value;
        }
      ),
      flagField<GameCharacter>(
        'hide_name',
        'Whether its name is hidden from the players but its owner.',
        'gm',
        (piece) => piece.hideName,
        (piece, value) => {
          piece.hideName = value;
        }
      ),
      {
        ...flagField<GameCharacter>(
          'stealth',
          'Whether it is in stealth, out of sight of the seats that neither own it nor play with it.',
          'write',
          (piece) => piece.stealth === '1',
          (piece, value) => this.stealth.set(piece, value)
        ),
        refuse: (piece) =>
          this.stealth.mayToggle(piece) ? null : "Only the game master and the piece's owner put it into stealth.",
      },
      flagField<GameCharacter>(
        'hide_buffs',
        'Whether its buffs are hidden from the players.',
        'write',
        (piece) => piece.hideBuff,
        (piece, value) => {
          piece.hideBuff = value;
        }
      ),
      flagField<GameCharacter>(
        'locked',
        'Whether it is locked in place.',
        'write',
        (piece) => piece.isLock,
        (piece, value) => {
          piece.isLock = value;
        }
      ),
      flagField<GameCharacter>(
        'drop_shadow',
        'Whether it casts a drop shadow on the table.',
        'write',
        (piece) => piece.isDropShadow,
        (piece, value) => {
          piece.isDropShadow = value;
        }
      ),
      flagField<GameCharacter>(
        'no_turn',
        'Whether it is left out of the turn order.',
        'write',
        this.onSheet((piece) => piece.noTurn),
        (piece, value) => {
          piece.noTurn = value;
        }
      ),
      flagField<GameCharacter>(
        'non_talk',
        'Whether it is left out of the list of speakers in chat.',
        'write',
        this.onSheet((piece) => piece.nonTalkFlag),
        (piece, value) => {
          piece.nonTalkFlag = value;
        }
      ),
      flagField<GameCharacter>(
        'hide_in_inventory',
        'Whether it is left out of the inventory lists.',
        'write',
        this.onSheet((piece) => piece.hideInventory),
        (piece, value) => {
          piece.hideInventory = value;
        }
      ),
      textField<GameCharacter>(
        'folder',
        'The folder it is filed under in the inventory, as a path such as "enemies/goblins"; empty for none.',
        'write',
        this.onSheet((piece) => piece.folderName),
        (piece, value) => {
          fileUnderFolder(piece, value);
        },
        500
      ),
      choiceField<GameCharacter, (typeof MOVE_MODES)[number]>(
        'move_mode',
        'How it gets about when a move is worked out for it.',
        'write',
        MOVE_MODES,
        this.onSheet((piece) => asMoveMode(piece.moveMode)),
        (piece, value) => {
          piece.moveMode = value;
        }
      ),
    ];
  }

  /** What a piece sees and the light it gives, as the light settings set them. */
  private pieceSightFields(): AgentKindField<GameCharacter>[] {
    const sight = <V>(
      field: AgentKindField<GameCharacter>,
      write: (piece: GameCharacter, value: V) => void
    ): AgentKindField<GameCharacter> => ({
      ...field,
      read: this.onSheet(field.read),
      put: (piece, value) => {
        write(piece, value as V);
        piece.update();
      },
    });
    return [
      sight<VisionType>(
        choiceField<GameCharacter, VisionType>(
          'vision_type',
          'How it sees.',
          'write',
          Object.values(VisionType),
          (piece) => piece.visionType
        ),
        (piece, value) => (piece.visionType = value)
      ),
      sight<number>(
        numberField<GameCharacter>(
          'vision_range',
          'How far it sees, in squares; 0 for as far as the light lets it.',
          'write',
          { minimum: 0 },
          (piece) => piece.visionRange
        ),
        (piece, value) => (piece.visionRange = value)
      ),
      sight<VisionShape>(
        choiceField<GameCharacter, VisionShape>(
          'vision_shape',
          'The shape of what it sees, round it or ahead of it.',
          'write',
          VISION_SHAPES,
          (piece) => asVisionShape(piece.visionShape)
        ),
        (piece, value) => applyVisionShape(piece, value)
      ),
      sight<boolean>(
        flagField<GameCharacter>(
          'show_vision_range',
          'Whether how far it sees is drawn on the table.',
          'write',
          (piece) => piece.showVisionRange
        ),
        (piece, value) => (piece.showVisionRange = value)
      ),
      sight<boolean>(
        flagField<GameCharacter>(
          'casts_shadow',
          'Whether it stands in the way of what others see.',
          'write',
          (piece) => piece.castsShadow
        ),
        (piece, value) => (piece.castsShadow = value)
      ),
      sight<boolean>(
        flagField<GameCharacter>('light', 'Whether it gives light.', 'write', (piece) => piece.lightEnabled),
        (piece, value) => (piece.lightEnabled = value)
      ),
      sight<LightPreset>(
        choiceField<GameCharacter, LightPreset>(
          'light_preset',
          'A kind of lamp its light is set as; choosing one turns the light on and sets the rest.',
          'write',
          Object.values(LightPreset),
          (piece) => piece.lightPreset
        ),
        (piece, value) => {
          applyLightPreset(piece, value);
          piece.lightEnabled = true;
        }
      ),
      sight<number>(
        numberField<GameCharacter>(
          'light_bright_radius',
          'How far its light is bright, in squares.',
          'write',
          { minimum: 0, maximum: 30 },
          (piece) => piece.lightBrightRadius
        ),
        (piece, value) => (piece.lightBrightRadius = value)
      ),
      sight<number>(
        numberField<GameCharacter>(
          'light_dim_radius',
          'How far its light reaches dimly, in squares.',
          'write',
          { minimum: 0, maximum: 30 },
          (piece) => piece.lightDimRadius
        ),
        (piece, value) => (piece.lightDimRadius = value)
      ),
      sight<string>(
        textField<GameCharacter>(
          'light_colour',
          'The colour of its light, as #rrggbb.',
          'write',
          (piece) => piece.lightColor,
          undefined,
          32
        ),
        (piece, value) => (piece.lightColor = value)
      ),
      sight<number>(
        numberField<GameCharacter>(
          'light_angle',
          'How wide its light spreads, in degrees; 360 for all round.',
          'write',
          { minimum: 0, maximum: 360 },
          (piece) => piece.lightAngle
        ),
        (piece, value) => (piece.lightAngle = value)
      ),
      sight<number>(
        numberField<GameCharacter>(
          'light_direction',
          'Which way a light narrower than all round points, in degrees.',
          'write',
          { minimum: 0, maximum: 360 },
          (piece) => piece.lightDirection
        ),
        (piece, value) => (piece.lightDirection = value)
      ),
      sight<LightAnimation>(
        choiceField<GameCharacter, LightAnimation>(
          'light_motion',
          'How its light moves.',
          'write',
          Object.values(LightAnimation),
          (piece) => piece.lightAnimation
        ),
        (piece, value) => (piece.lightAnimation = value)
      ),
    ];
  }

  /** What a piece rides or is a part of, and how it carries others where it is a mount. */
  private pieceRideFields(): AgentKindField<GameCharacter>[] {
    const asMount = (field: AgentKindField<GameCharacter>): AgentKindField<GameCharacter> => ({
      ...field,
      refuse: (piece) => (piece.mountable === '1' ? null : 'It is no mount; set mountable first.'),
    });
    return [
      textField<GameCharacter>(
        'riding_on',
        'The id of the mount it rides, empty for none. get_on and get_off change it.',
        null,
        (piece) => this.seenId(this.ride.mountOf(piece))
      ),
      choiceField<GameCharacter, RideSeat>(
        'ride_seat',
        'Where it rides its mount: in front, behind, as a load, or as a part of a body.',
        null,
        ['rider', 'passenger', 'cargo', 'part'],
        (piece) => (piece.ridingOn ? seatOf(piece.rideSeat) : undefined)
      ),
      textField<GameCharacter>(
        'part_of',
        'The id of the piece it is a part of, empty for none. attach_to and detach change it.',
        null,
        (piece) => this.seenId(this.parts.bodyOf(piece))
      ),
      flagField<GameCharacter>(
        'mountable',
        'Whether others may ride it. Made no mount, those riding it get off.',
        'write',
        (piece) => piece.mountable === '1',
        (piece, value) => this.ride.setMountable(piece, value)
      ),
      asMount(
        flagField<GameCharacter>(
          'mount_passenger',
          'Whether a second rider may sit behind the one in front.',
          'write',
          (piece) => piece.mountPassenger === '1',
          (piece, value) => this.ride.setPassenger(piece, value)
        )
      ),
      asMount(
        numberField<GameCharacter>(
          'mount_cargo',
          'How many it may carry as a load.',
          'write',
          { minimum: 0, maximum: 99, integer: true },
          (piece) => Number(piece.mountCargo) || 0,
          (piece, value) => this.ride.setCargo(piece, value)
        )
      ),
      asMount(
        flagField<GameCharacter>(
          'mount_anyone',
          'Whether anybody may ride it in front, skilled at steering or not.',
          'write',
          (piece) => piece.mountAnyone === '1',
          (piece, value) => this.ride.setAnyone(piece, value)
        )
      ),
    ];
  }

  /** Getting on and off a mount and joining and leaving a body, as a piece's menu does them. */
  private pieceActions(): AgentKindAction<GameCharacter>[] {
    return [
      {
        name: 'get_on',
        description:
          'Gets it on a mount it stands at on the table, in a seat the mount offers it; once a turn while turns are taken. Said in chat.',
        access: 'write',
        input: objectInput(
          {
            mount: { type: 'string', description: 'The id or name of the mount.' },
            seat: {
              type: 'string',
              enum: RIDE_SEATS,
              description: 'In front, behind, or as a load. In front if left out.',
            },
          },
          ['mount']
        ),
        run: (piece, args: AgentArgs) => {
          const mount = this.seenPiece(String(args['mount']));
          const seat = (args['seat'] as RideSeat | undefined) ?? 'rider';
          if (!this.ride.mount(piece, mount, seat)) refused(this.rideOffers(piece, mount, seat));
          return { riding_on: mount.identifier, seat };
        },
      },
      {
        name: 'get_off',
        description:
          'Gets it off the mount it rides, where the mount stands; once a turn while turns are taken. Said in chat.',
        access: 'write',
        input: objectInput(),
        run: (piece) => {
          if (!piece.ridingOn) throw new AgentToolError('invalid_input', 'It rides nothing.');
          if (!this.ride.dismount(piece)) refused('It has got on or off once this turn already.');
          return { riding_on: '' };
        },
      },
      {
        name: 'attach_to',
        description:
          'Makes it a part of a body whose base it stands on, on the table; it then goes where the body goes.',
        access: 'write',
        input: objectInput({ body: { type: 'string', description: 'The id or name of the body.' } }, ['body']),
        run: (piece, args: AgentArgs) => {
          const body = this.seenPiece(String(args['body']));
          if (!this.parts.attach(piece, body)) {
            const offered = this.parts.bodiesFor(piece).map((each) => this.views.nameOf(each));
            refused(
              `It cannot be a part of ${this.views.nameOf(body)}: a piece on the table becomes a part of a body whose base it stands on, that is no part itself${offered.length ? ` (it may join ${offered.join(', ')})` : ''}.`
            );
          }
          return { part_of: body.identifier };
        },
      },
      {
        name: 'detach',
        description: 'Takes it off the body it is a part of, leaving it standing where the body stands.',
        access: 'write',
        input: objectInput(),
        run: (piece) => {
          if (!this.parts.detach(piece)) throw new AgentToolError('invalid_input', 'It is a part of no body.');
          return { part_of: '' };
        },
      },
    ];
  }

  /** Why a piece could not get on a mount, with the mounts and seats it is offered now. */
  private rideOffers(piece: GameCharacter, mount: GameCharacter, seat: RideSeat): string {
    const menu = this.ride.menuOf(piece);
    if (menu.riding) return 'It rides a mount already; get it off first.';
    if (menu.changeRefusal) return 'It has got on or off once this turn already.';
    const offers = menu.offers
      .map((offer) => {
        const seats = offer.seats.filter((each) => each.refusal === null || each.getsUp).map((each) => each.seat);
        return seats.length > 0 ? `${offer.name} (${seats.join(', ')})` : '';
      })
      .filter((offer) => offer !== '');
    return `It cannot get on ${this.views.nameOf(mount)} as ${seat} now: it gets on a mount it stands at, in a seat free to it${offers.length ? ` (offered now: ${offers.join('; ')})` : ' (none is offered now)'}.`;
  }

  private range(): AgentKind<RangeArea> {
    const shapeOf = (range: RangeArea) =>
      RANGE_SHAPE_NAMES.find((name) => RANGE_SHAPES[name] === range.type) ?? range.type.toLowerCase();
    return {
      kind: RangeArea.aliasName,
      description:
        'A range shape laid on the table to show an area: a circle, a square, a cone and the like, flat or standing up as a solid, and following a piece where it is set to.',
      list: () => this.tabletop.ranges,
      idOf: (range) => range.identifier,
      nameOf: (range) => range.name,
      fields: [
        textField<RangeArea>(
          'name',
          'Its name.',
          'write',
          (range) => range.name,
          (range, value) => {
            range.name = value;
          },
          200
        ),
        choiceField<RangeArea, RangeShape>(
          'shape',
          'Its shape; rhombus is the cells a walk of its length reaches. A shape drawn cell by cell reads as custom.',
          'write',
          RANGE_SHAPE_NAMES,
          shapeOf,
          (range, value) => {
            range.type = RANGE_SHAPES[value];
          }
        ),
        {
          ...choiceField<RangeArea, (typeof SOLIDS)[number]>(
            'solid',
            'What it stands up as, fitting the shape it has: flat, a column (any shape), a sphere (circle), a cone (cone) or a beam (line).',
            'write',
            SOLIDS,
            (range) => range.solidKind || 'flat',
            (range, value) => {
              range.solidKind = solidOf(value);
            }
          ),
          refuse: (range, value) =>
            solidFitsShape(solidOf(value as string), range.type)
              ? null
              : `A ${shapeOf(range)} cannot stand up as a ${String(value)}.`,
        },
        numberField<RangeArea>(
          'length',
          'How far it reaches, in squares.',
          'write',
          { minimum: 0, maximum: 200 },
          (range) => range.length,
          (range, value) => {
            range.length = value;
          }
        ),
        numberField<RangeArea>(
          'width',
          'How wide it is, in squares.',
          'write',
          { minimum: 0, maximum: 200 },
          (range) => range.width,
          (range, value) => {
            range.width = value;
          }
        ),
        numberField<RangeArea>(
          'height',
          'How tall it stands as a column, in squares.',
          'write',
          { minimum: 0.1, maximum: 200 },
          (range) => range.columnHeight,
          (range, value) => {
            range.columnHeight = value;
          }
        ),
        numberField<RangeArea>(
          'reach',
          'How far from the piece it follows a sphere or a column may be put, in squares.',
          'write',
          { minimum: 0, maximum: 200 },
          (range) => range.reachSquares,
          (range, value) => {
            range.reachSquares = value;
          }
        ),
        numberField<RangeArea>(
          'pitch',
          'How steeply a cone or a beam standing up points up, in degrees.',
          'write',
          { minimum: -90, maximum: 90 },
          (range) => range.aimPitch,
          (range, value) => {
            range.aimPitch = value;
          }
        ),
        numberField<RangeArea>(
          'facing',
          'Which way it points, in degrees clockwise from north.',
          'write',
          {},
          (range) => range.rotate + 90,
          (range, value) => {
            range.rotate = value - 90;
          }
        ),
        textField<RangeArea>(
          'border_colour',
          'The colour of its border, as #rrggbb.',
          'write',
          (range) => range.rangeColor,
          (range, value) => {
            range.rangeColor = value;
          },
          32
        ),
        textField<RangeArea>(
          'fill_colour',
          'The colour it is filled with, as #rrggbb.',
          'write',
          (range) => range.gridColor,
          (range, value) => {
            range.gridColor = value;
          },
          32
        ),
        numberField<RangeArea>(
          'opacity',
          'How much of it is painted, in percent.',
          'write',
          { minimum: 0, maximum: 100 },
          (range) => Number(range.commonDataElement?.getFirstElementByName('opacity')?.currentValue ?? 100),
          (range, value) => range.setOpacityPercent(value)
        ),
        this.squares.field<RangeArea>(undefined, 'middle'),
        numberField<RangeArea>(
          'altitude',
          'How high above the table, in squares.',
          'write',
          {},
          (range) => range.altitude,
          (range, value) => {
            range.altitude = value;
          }
        ),
        {
          ...textField<RangeArea>(
            'follow',
            'The id of the piece it follows about, empty for none. Written as the id or name of a piece on the table, or empty to stop. A circle, a square, a rhombus, a pentagon, a hexagon or any range standing up may follow.',
            'write',
            (range) => {
              const piece = this.objectStore.get(range.followingCharacterIdentifier);
              return this.seenId(piece instanceof GameCharacter ? piece : null);
            },
            (range, value) => {
              range.followingCharacterIdentifier = value === '' ? '' : this.seenPiece(value).identifier;
              if (value !== '') range.following(this.tabletop.gridSize());
            },
            200
          ),
          refuse: (range, value) => {
            if (value === '') return null;
            if (!range.isSolid && !FOLLOWABLE_RANGE_TYPES.includes(range.type)) {
              return `A flat ${shapeOf(range)} cannot follow a piece.`;
            }
            return lookupRefusal(() => this.seenPiece(value as string));
          },
        },
        flagField<RangeArea>(
          'locked',
          'Whether it is locked in place.',
          'write',
          (range) => range.isLock,
          (range, value) => {
            range.isLock = value;
          }
        ),
        flagField<RangeArea>(
          'free_placement',
          "Whether it is put down wherever it is let go, off the table's grid.",
          'write',
          (range) => range.placesFreely,
          (range, value) => {
            range.placesFreely = value;
          }
        ),
      ],
      create: {
        access: 'write',
        description:
          'Lays a new range on the table in view at a square, or the middle of the table, at the default size of its shape.',
        input: objectInput(
          {
            shape: { type: 'string', enum: RANGE_SHAPE_NAMES, description: 'Its shape.' },
            solid: { type: 'string', enum: SOLIDS, description: 'What it stands up as. Flat if left out.' },
            at: { ...SQUARE_SCHEMA, description: 'The square to lay it in. Leave out for the middle of the table.' },
          },
          ['shape']
        ),
        make: (args) => {
          const type = RANGE_SHAPES[args['shape'] as RangeShape];
          const solidName = (args['solid'] as string | undefined) ?? 'flat';
          const solid = solidOf(solidName);
          if (!solidFitsShape(solid, type)) {
            throw new AgentToolError('invalid_input', `A ${String(args['shape'])} cannot stand up as a ${solidName}.`);
          }
          const middle = this.squares.pointOrMiddle(args['at'] as AgentSquare | undefined, 'middle');
          const point = { ...middle, z: this.ground.heightPxAt(middle.x, middle.y) };
          return solid
            ? this.actions.createSolidRangeArea(point, type, solid)
            : this.actions.createRangeArea(point, type);
        },
      },
      remove: { access: 'write', take: (range) => range.destroy() },
    };
  }
}

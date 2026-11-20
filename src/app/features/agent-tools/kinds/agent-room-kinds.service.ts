import { inject, Injectable } from '@angular/core';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { AlarmService } from '@axe/application/alarm/alarm.service';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatReactionService } from '@axe/application/chat/chat-reaction.service';
import { ChatTabEditService, type ChatTabPermissionKey } from '@axe/application/chat/chat-tab-edit.service';
import { ScenarioTextService } from '@axe/application/chat/scenario-text.service';
import { StampPackService } from '@axe/application/chat/stamp-pack.service';
import { StampRulesService } from '@axe/application/chat/stamp-rules.service';
import { VisibleChatTabsService } from '@axe/application/chat/visible-chat-tabs.service';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { PartyService } from '@axe/application/party/party.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import {
  ROOM_SETTINGS,
  type RoomSettingKey,
  roomSettingOf,
  type RoomSettingSources,
  type RoomSettingValue,
  type RoomSettingWriter,
} from '@axe/application/tabletop/room-settings';
import { VoteRefusal, VoteService } from '@axe/application/vote/vote.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import type { AgentSchema } from '@axe/core/agent/agent-schema';
import type { AgentAccess } from '@axe/core/agent/agent-tools';
import { getPeerContexts } from '@axe/core/network/peer-context-source';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Alarm } from '@axe/domain/alarm/alarm';
import { asBattleSide, BATTLE_SIDES } from '@axe/domain/battle/battle-lineup';
import { isHandLocation } from '@axe/domain/card/hand-location';
import { BUFF_TIMINGS, type BuffTiming } from '@axe/domain/character/buff-timing';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  isStatusAilmentWritable,
  newStatusAilment,
  type StatusAilment,
  withRounds,
} from '@axe/domain/character/status-ailment';
import { StatusAilmentCatalog } from '@axe/domain/character/status-ailment-catalog';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { BuffPalette, ChatPalette } from '@axe/domain/chat/chat-palette';
import { ChatReaction } from '@axe/domain/chat/chat-reaction';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { BUILTIN_STAMPS } from '@axe/domain/chat/stamp-catalog';
import { StampPack } from '@axe/domain/chat/stamp-pack';
import { DataSummarySetting, type SortKey, SortOrder } from '@axe/domain/data/data-summary-setting';
import { readElementAliases, writeElementAliases } from '@axe/domain/data/element-alias';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { normalizeFolderPath } from '@axe/domain/folder/folder-path';
import { folderSiblingsOf } from '@axe/domain/folder/folder-tree';
import { canBrowseImage, ImageTag } from '@axe/domain/media/image-tag';
import { Party, PARTY_COLORS } from '@axe/domain/party/party';
import { isAccountAvatar } from '@axe/domain/peer/account-avatar';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { connectedPeerIdsOf, peerFaceOf } from '@axe/domain/peer/peer-face';
import {
  SCENARIO_TEXT_SPEAKERS,
  ScenarioText,
  type ScenarioTextSpeaker,
  scenarioTextSpeakerOf,
} from '@axe/domain/scenario-text/scenario-text';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { scenePartsOf } from '@axe/domain/scene/board-scene-parts';
import { CONCEALED_LOCATION } from '@axe/domain/tabletop/board-switch/concealment';
import { DIAGONAL_MOVES } from '@axe/domain/tabletop/move/diagonal-move';
import { ZOC_MODES } from '@axe/domain/tabletop/move/zone-of-control';
import type { RoomRules } from '@axe/domain/tabletop/room-rules';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { FACTION_PHASE_MODES, TURN_ORDER_MODES } from '@axe/domain/tabletop/turn-order-mode';
import { Vote, VOTE_ABSTAINED, VOTE_UNANSWERED } from '@axe/domain/vote/vote';
import { findOne, numberArg, textArg } from '@axe/features/agent-tools/agent-lookup';
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

/** A field holding a list, written by a seat with the access given. */
function listField<T>(
  name: string,
  description: string,
  access: AgentAccess | null,
  items: AgentSchema,
  read: (object: T) => unknown,
  put?: (object: T, value: readonly unknown[]) => void,
  maxItems = 200
): AgentKindField<T> {
  return {
    name,
    description,
    schema: { type: 'array', items, maxItems },
    access,
    read,
    ...(put ? { put: (object: T, value: unknown) => put(object, value as readonly unknown[]) } : {}),
  };
}

/** A field only read, holding an object of the properties given. */
function shownField<T>(
  name: string,
  description: string,
  properties: Readonly<Record<string, AgentSchema>>,
  read: (object: T) => unknown
): AgentKindField<T> {
  return { name, description, schema: { type: 'object', properties, additionalProperties: false }, access: null, read };
}

/**
 * What a lookup refuses, as a field refuses a value before any field of a call is written: the
 * reason it gives, or null where it finds what it looks for.
 */
function refusalOf(lookup: () => unknown): string | null {
  try {
    lookup();
    return null;
  } catch (error) {
    if (error instanceof AgentToolError) return error.message;
    throw error;
  }
}

/** Some text, described. */
function text(description: string, maxLength = 200): AgentSchema {
  return { type: 'string', description, maxLength };
}

/** A list of texts, described. */
function texts(description: string, maxItems = 50, maxLength = 200): AgentSchema {
  return { type: 'array', description, items: { type: 'string', maxLength }, maxItems };
}

/** What a thing named by its id and name holds. */
const NAMED_PROPERTIES: Readonly<Record<string, AgentSchema>> = { id: { type: 'string' }, name: { type: 'string' } };

/** A thing named by its id and name, as a list of them answers. */
const NAMED: AgentSchema = { type: 'object', properties: NAMED_PROPERTIES, additionalProperties: false };

/** The name the room's settings are synced under, which the class built on its rule answers does not carry. */
const CONFIG_ALIAS = 'config';

/** Who may write a room setting through the AI: the seats the room settings let write it. */
const SETTING_ACCESS: Readonly<Record<RoomSettingWriter, AgentAccess>> = { table: 'write', shared: 'gm' };

/** Why a seat other than the game master may not change who may read a tab on a room server. */
const READING_HELD = 'On a room server, only the game master may change who may read a tab.';

/** Why a seat other than the game master may not change who may speak in a tab on a room server. */
const SPEAKING_HELD =
  'On a room server, a seat other than the game master may change who may speak only in a tab they may already read.';

/** This seat's own stamps on the lines of chat, as the one thing the reactions kind lists. */
interface SeatReactions {
  readonly mine: true;
}

const SEAT_REACTIONS: SeatReactions = { mine: true };

/** Why a state's part was not written: every part but the effect is one word. */
const AILMENT_FIELD_HELD =
  "Only a state's effect may hold spaces; its colour, mark, status, operator and amount are one word each.";

/** The ways a state may move a status, as the `&!` command spells them. */
const STAT_OPS = ['=', '+', '-'] as const;

/** What changing a state of the catalog takes, every part but its name left out to keep it. */
const AILMENT_PARTS: Readonly<Record<string, AgentSchema>> = {
  color: text('The badge colour: red, orange, yellow, green, blue, purple, pink, gray, a hex colour, or empty.', 30),
  icon: text('The mark on the badge, or the id of a picture; empty for the usual one.', 100),
  rounds: {
    type: 'integer',
    minimum: 0,
    maximum: 999,
    description: 'How many rounds it lasts; 0 lasts until taken off.',
  },
  timing: {
    type: 'string',
    enum: BUFF_TIMINGS,
    description: 'When it counts down: roundEnd, turnStart, turnEnd, or none.',
  },
  effect: text('A line about what it does, which rides along on the buff.', 500),
  stat: text('The one-word status it moves while worn, as 移動; empty for none.', 50),
  op: { type: 'string', enum: STAT_OPS, description: 'How it moves the status: = holds it at, + adds, - takes off.' },
  amount: text('How far it moves the status, or what it holds it at.', 50),
};

/**
 * The kinds of the chat tabs, reactions, palettes, stamps, votes, alarms, scenario texts, parties, scenes and
 * the room's own settings, as the AI link's generic tools offer them: each listed as this seat comes
 * across it on its screen, and made, changed and acted on through the services the screen's own hand
 * goes through, under the rules the screen holds it to.
 */
@Injectable({ providedIn: 'root' })
export class AgentRoomKinds {
  private readonly views = inject(AgentViews);
  private readonly permission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly chat = inject(ChatMessageService);
  private readonly tabEdit = inject(ChatTabEditService);
  private readonly votes = inject(VoteService);
  private readonly alarms = inject(AlarmService);
  private readonly visibleTabs = inject(VisibleChatTabsService);
  private readonly reactions = inject(ChatReactionService);
  private readonly stampRules = inject(StampRulesService);
  private readonly stampPacks = inject(StampPackService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly tagLock = inject(ImageTagLockService);
  private readonly scenarioTexts = inject(ScenarioTextService);
  private readonly parties = inject(PartyService);
  private readonly scenes = inject(BoardSceneService);
  private readonly clock = inject(GameClockService);
  private readonly roomRules = inject(RoomRulesService);
  private readonly inventory = inject(GameObjectInventoryService);
  private readonly ailments = inject(StatusAilmentService);
  private readonly t = inject(TRANSLATE_FN);

  /** The kinds of this part of the room, in the order they are described to the AI. */
  readonly kinds: readonly AnyAgentKind[] = [
    anyKind(this.chatTab()),
    anyKind(this.chatTabList()),
    anyKind(this.chatReaction()),
    anyKind(
      this.paletteKind(
        ChatPalette.aliasName,
        "A piece's chat palette: the lines its speaker sends from, one to a line, `//name=value` lines setting variables, and the dice system they roll under. Listed for the pieces whose sheet this seat may open.",
        (piece) => piece.chatPalette
      )
    ),
    anyKind(
      this.paletteKind(
        BuffPalette.aliasName,
        "A piece's buff palette, which the remote controller offers: one buff to a line, as `name effect rounds`, and the dice system it rolls under. Listed for the pieces whose sheet this seat may open.",
        (piece) => piece.remoteController
      )
    ),
    anyKind(this.stampPack()),
    anyKind(this.vote()),
    anyKind(this.alarm()),
    anyKind(this.scenarioText()),
    anyKind(this.party()),
    anyKind(this.boardScene()),
    anyKind(this.config()),
    anyKind(this.summarySetting()),
    anyKind(this.statusAilmentCatalog()),
  ];

  /** The chat tabs this seat may read, in the order the room lists them. */
  private viewableTabs(): ChatTab[] {
    return this.visibleTabs.readableNow();
  }

  /** A chat tab this seat may read, by id or name. */
  private tabNamed(reference: string): ChatTab {
    return findOne(
      this.viewableTabs(),
      reference,
      (tab) => tab.identifier,
      (tab) => tab.name,
      'chat tab'
    );
  }

  /** The identifier of a tab this seat may read, named by id or name; empty for none named. */
  private tabIdentifierOf(reference: string): string {
    return reference.trim() ? this.tabNamed(reference).identifier : '';
  }

  /** The name of a tab by identifier, where this seat may read it; empty otherwise. */
  private tabNameOf(identifier: string): string {
    return this.viewableTabs().find((tab) => tab.identifier === identifier)?.name ?? '';
  }

  /**
   * The pieces this seat comes across: on the table where it sees them, the ones the master put out of
   * sight for the master alone, and anywhere else but another seat's own inventory or hand.
   */
  private piecesInReach(): GameCharacter[] {
    const others = new Set(
      getPeerContexts()
        .filter((peer) => peer.isOpen)
        .map((peer) => peer.peerId)
    );
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((piece) => {
      const location = piece.location.name;
      if (location === 'table') return this.views.sees(piece);
      if (location === CONCEALED_LOCATION) return this.permission.isGameMaster();
      return !others.has(location) && !isHandLocation(location);
    });
  }

  /** A dice system the dice bot knows, by id; refused where it knows none of the name. */
  private diceSystem(value: string): string {
    const id = value.trim();
    if (DiceBot.diceBotInfos.length < 1) {
      throw new AgentToolError('failed', 'The dice systems have not loaded yet. Try again in a moment.');
    }
    if (!DiceBot.diceBotInfos.some((info) => info.id === id)) {
      throw new AgentToolError(
        'invalid_input',
        `There is no dice system with the id ${id}. list_assets with kind dice_systems lists them.`
      );
    }
    return id;
  }

  private chatTab(): AgentKind<ChatTab> {
    const permission = (key: ChatTabPermissionKey, name: string, description: string): AgentKindField<ChatTab> => ({
      ...flagField<ChatTab>(
        name,
        description,
        'write',
        (tab) => tab[key],
        (tab, value) => {
          this.tabEdit.setPermission(tab, key, value);
        }
      ),
      refuse: (tab) =>
        this.tabEdit.mayChangePermission(tab, key)
          ? null
          : key === 'plCanView' || key === 'guestCanView'
            ? READING_HELD
            : SPEAKING_HELD,
    });
    return {
      kind: ChatTab.aliasName,
      description:
        'A chat tab: a channel of the chat with its own log, and who besides the game master may read it and speak in it. The system tab, where the room posts its notices, keeps its name and permissions and cannot be taken away. Taking a tab away takes its whole log with it, for everyone. Listed are the tabs this seat may read.',
      list: () => this.viewableTabs(),
      idOf: (tab) => tab.identifier,
      nameOf: (tab) => tab.name,
      refuse: (tab) =>
        tab.isSystemTab ? 'The system tab keeps its name and its permissions, and cannot be taken away.' : null,
      fields: [
        textField<ChatTab>(
          'name',
          'Its name.',
          'write',
          (tab) => tab.name,
          (tab, value) => {
            this.tabEdit.rename(tab, value);
          },
          100
        ),
        permission('plCanView', 'players_read', 'Whether players may read it; taking this away takes speaking too.'),
        permission(
          'plCanSpeak',
          'players_speak',
          'Whether players may speak in it; letting them speak lets them read too.'
        ),
        permission('guestCanView', 'guests_read', 'Whether guests may read it; taking this away takes speaking too.'),
        permission(
          'guestCanSpeak',
          'guests_speak',
          'Whether guests may speak in it; letting them speak lets them read too.'
        ),
        flagField<ChatTab>('system', 'Whether it is the system tab.', null, (tab) => tab.isSystemTab),
        numberField<ChatTab>(
          'position',
          'Its place among the tabs this seat may read, from 1. Move it with the move_tab action of the chat-tab-list.',
          null,
          { minimum: 1, integer: true },
          (tab) => this.viewableTabs().indexOf(tab) + 1
        ),
      ],
      create: {
        access: 'write',
        description:
          'Adds a tab at the end of the list, under a default name unless a name is written; players may read and speak in it and guests may read it until that is changed.',
        input: objectInput(),
        make: () => {
          const made = this.tabEdit.create(this.t('feature.chat.tabSetting.defaultTabName'));
          if (!made) throw new AgentToolError('not_allowed', 'This seat may not add a chat tab.');
          return made;
        },
      },
      remove: { access: 'write', take: (tab) => this.removeTab(tab) },
    };
  }

  /**
   * Takes a tab away for every seat through the tab settings' own rule. On a room server a seat other
   * than the game master's leaves a tab holding dice the server rolled, as the server keeps them.
   */
  private removeTab(tab: ChatTab): void {
    if (this.tabEdit.deleteKeptForGameMaster(tab)) {
      throw new AgentToolError(
        'not_allowed',
        'On a room server, only the game master may take away a tab holding dice the server rolled.'
      );
    }
    if (!this.tabEdit.delete(tab)) throw new AgentToolError('not_allowed', 'This seat may not take this tab away.');
  }

  private chatTabList(): AgentKind<ChatTabList> {
    return {
      kind: ChatTabList.aliasName,
      description:
        'The list of chat tabs, in the order the chat shows them. There is one; leave its id out. Move a tab with move_tab.',
      list: () => [ChatTabList.instance],
      idOf: (list) => list.identifier,
      nameOf: () => 'chat tabs',
      fields: [
        listField<ChatTabList>('tabs', 'The tabs this seat may read, in order.', null, NAMED, () =>
          this.viewableTabs().map((tab) => ({ id: tab.identifier, name: tab.name }))
        ),
      ],
      actions: [
        {
          name: 'move_tab',
          description:
            'Moves a tab to another place in the list, one place at a time as the tab settings move it. The system tab stays where it is.',
          access: 'write',
          input: objectInput(
            {
              tab: text('The tab to move, by id or name.'),
              to: {
                type: 'integer',
                minimum: 1,
                description: 'Its new place among the tabs this seat may read, from 1.',
              },
            },
            ['tab', 'to']
          ),
          run: (_list, args) => this.moveTab(args),
        },
      ],
    };
  }

  private moveTab(args: AgentArgs): unknown {
    const tab = this.tabNamed(textArg(args, 'tab'));
    if (tab.isSystemTab) throw new AgentToolError('not_allowed', 'The system tab stays where it is.');
    if (!this.tabEdit.mayRearrange(tab))
      throw new AgentToolError('not_allowed', 'That tab is not this seat’s to move.');
    const place = numberArg(args, 'to', 1);
    const tabs = this.viewableTabs();
    const already = tabs.indexOf(tab) === Math.max(0, Math.min(tabs.length - 1, Math.trunc(place) - 1));
    if (!this.tabEdit.moveTo(tab, place) && !already) {
      throw new AgentToolError('failed', 'That tab could not be moved there.');
    }
    return { tabs: this.viewableTabs().map((each) => ({ id: each.identifier, name: each.name })) };
  }

  private chatReaction(): AgentKind<SeatReactions> {
    return {
      kind: ChatReaction.aliasName,
      description:
        "The stamps this seat has put on lines of chat, as one thing: leave its id out. Put a stamp on a line, or take it off again, with toggle. Only this seat's own stamps are written; the others' are theirs.",
      list: () => [SEAT_REACTIONS],
      idOf: () => 'mine',
      nameOf: () => 'stamps this seat put on',
      fields: [
        listField<SeatReactions>(
          'put_on',
          'The lines this seat has put stamps on, by id, with the stamps.',
          null,
          {
            type: 'object',
            properties: { line: { type: 'string' }, stamps: { type: 'array', items: { type: 'string' } } },
            additionalProperties: false,
          },
          () => this.myReactions()
        ),
        listField<SeatReactions>(
          'offered',
          "The stamps this seat may put on a line now, by id: those that come with the app and those of the room's own sets, less those the room denies.",
          null,
          { type: 'string' },
          () => this.offeredStamps(),
          undefined,
          1000
        ),
      ],
      actions: [
        {
          name: 'toggle',
          description:
            'Puts a stamp on a line of chat for this seat, or takes it off where this seat put it on already. Answers whether it is on now.',
          access: 'write',
          input: objectInput(
            {
              line: text('The line, by the id read_chat gives it.'),
              stamp: text('The stamp, by id, as offered lists them.'),
            },
            ['line', 'stamp']
          ),
          run: (_mine, args) => this.toggleReaction(textArg(args, 'line'), textArg(args, 'stamp').trim()),
        },
      ],
    };
  }

  /** A line of chat this seat reads, in a tab it may read, by identifier, as the AI is handed lines; null for any other. */
  private lineRead(identifier: string): ChatMessage | null {
    const message = this.objectStore.get(identifier.trim());
    return message instanceof ChatMessage && this.views.lineRead(message) !== null ? message : null;
  }

  private myRecords(): ChatReaction[] {
    const me = PeerCursor.myUserId;
    return this.objectStore.getObjects<ChatReaction>(ChatReaction).filter((record) => record.userId === me);
  }

  private myReactions(): { line: string; stamps: string[] }[] {
    return this.myRecords()
      .filter((record) => record.stampIds.length > 0 && this.lineRead(record.messageIdentifier) !== null)
      .map((record) => ({ line: record.messageIdentifier, stamps: record.stampIds }));
  }

  /** The stamps the reaction picker offers this seat: the app's and the room's sets', less the ones denied. */
  private offeredStamps(): string[] {
    const packed = this.objectStore
      .getObjects<StampPack>(StampPack)
      .flatMap((pack) => pack.stamps.map((stamp) => stamp.stampId));
    return [...new Set([...BUILTIN_STAMPS.map((stamp) => stamp.id), ...packed])].filter((id) =>
      this.stampRules.allows('reaction', id)
    );
  }

  private toggleReaction(lineId: string, stampId: string): unknown {
    const message = this.lineRead(lineId);
    if (!message) throw new AgentToolError('not_found', `There is no line with the id ${lineId} that this seat reads.`);
    if (!this.reactions.mayReact) throw new AgentToolError('not_allowed', 'This seat may not put stamps on lines.');
    const isOn = this.myRecords().some(
      (record) => record.messageIdentifier === message.identifier && record.has(stampId)
    );
    if (!isOn && !this.offeredStamps().includes(stampId)) {
      const known = BUILTIN_STAMPS.some((stamp) => stamp.id === stampId) || this.packedStamp(stampId);
      throw new AgentToolError(
        known ? 'not_allowed' : 'invalid_input',
        known
          ? `The room does not let ${stampId} be put on a line now.`
          : `There is no stamp ${stampId}. get_object on chat-reaction lists the stamps offered.`
      );
    }
    const on = this.reactions.toggle(message, stampId);
    return { line: message.identifier, stamp: stampId, on };
  }

  private packedStamp(stampId: string): boolean {
    return this.objectStore
      .getObjects<StampPack>(StampPack)
      .some((pack) => pack.stamps.some((stamp) => stamp.stampId === stampId));
  }

  private paletteKind(
    kind: string,
    description: string,
    paletteOf: (piece: GameCharacter) => ChatPalette | null
  ): AgentKind<ChatPalette> {
    const pieceOf = (palette: ChatPalette): GameCharacter | null =>
      palette.parent instanceof GameCharacter ? palette.parent : null;
    return {
      kind,
      description,
      list: () =>
        this.piecesInReach()
          .filter((piece) => this.views.sheetOpen(piece))
          .map((piece) => paletteOf(piece))
          .filter((palette): palette is ChatPalette => palette !== null),
      idOf: (palette) => palette.identifier,
      nameOf: (palette) => {
        const piece = pieceOf(palette);
        return piece ? this.views.nameOf(piece) : '';
      },
      fields: [
        shownField<ChatPalette>('piece', 'The piece it belongs to.', NAMED_PROPERTIES, (palette) => {
          const piece = pieceOf(palette);
          return piece ? { id: piece.identifier, name: this.views.nameOf(piece) } : null;
        }),
        textField<ChatPalette>(
          'text',
          'Its lines, one to a line.',
          'write',
          (palette) => `${palette.value ?? ''}`,
          (palette, value) => palette.setPalette(value),
          100000
        ),
        {
          ...textField<ChatPalette>(
            'dice_system',
            'The id of the dice system its lines roll under, as list_assets with kind dice_systems gives it.',
            'write',
            (palette) => palette.dicebot,
            (palette, value) => {
              palette.dicebot = this.diceSystem(value);
            },
            100
          ),
          refuse: (_palette, value) => refusalOf(() => this.diceSystem(`${value}`)),
        },
      ],
    };
  }

  private stampPack(): AgentKind<StampPack> {
    return {
      kind: StampPack.aliasName,
      description:
        'A set of stamps the room made from its own pictures, which anyone may put on a line or send. Taking a stamp or a set away leaves the pictures in the room, and lines answered with them keep them.',
      list: () => this.objectStore.getObjects<StampPack>(StampPack),
      idOf: (pack) => pack.identifier,
      nameOf: (pack) => pack.name,
      fields: [
        textField<StampPack>(
          'name',
          'Its name.',
          'write',
          (pack) => pack.name,
          (pack, value) => this.stampPacks.rename(pack, value),
          100
        ),
        listField<StampPack>(
          'stamps',
          'Its stamps: the stamp id a line or reaction uses, the picture it is, and the name it goes by.',
          null,
          {
            type: 'object',
            properties: { stamp: { type: 'string' }, image: { type: 'string' }, name: { type: 'string' } },
            additionalProperties: false,
          },
          (pack) =>
            pack.stamps.map((stamp) => ({ stamp: stamp.stampId, image: stamp.imageIdentifier, name: stamp.name }))
        ),
      ],
      create: {
        access: 'write',
        description: 'Makes an empty set under a default name unless a name is written.',
        input: objectInput(),
        make: () => {
          const pack = this.stampPacks.create(this.t('feature.chat.stampPack.newPackName'));
          if (!pack) throw new AgentToolError('not_allowed', 'This seat may not make stamp sets.');
          return pack;
        },
      },
      remove: { access: 'write', take: (pack) => this.stampPacks.remove(pack) },
      actions: [
        {
          name: 'add_stamps',
          description:
            'Adds pictures of the room to the set as stamps, each named after its file; one already in it is passed over. Name the pictures by the ids list_assets with kind images gives them.',
          access: 'write',
          input: objectInput({ images: texts('The pictures, by id.', 50, 100) }, ['images']),
          run: (pack, args) => {
            const images = ((args['images'] as string[] | undefined) ?? []).map((id) => this.pictureFor(id));
            const added = this.stampPacks.addImages(pack, images);
            return { added, stamps: pack.stamps.length };
          },
        },
        {
          name: 'rename_stamp',
          description: 'Gives a stamp of the set another name.',
          access: 'write',
          input: objectInput(
            { stamp: text('The stamp, by its stamp id, picture id or name.'), name: text('Its new name.', 100) },
            ['stamp', 'name']
          ),
          run: (pack, args) => {
            const stamp = this.stampIn(pack, textArg(args, 'stamp'));
            this.stampPacks.renameStamp(stamp.element, textArg(args, 'name'));
            return { stamp: stamp.stampId, name: stamp.element.name };
          },
        },
        {
          name: 'remove_stamp',
          description: 'Takes a stamp out of the set. The picture stays in the room.',
          access: 'write',
          input: objectInput({ stamp: text('The stamp, by its stamp id, picture id or name.') }, ['stamp']),
          run: (pack, args) => {
            const stamp = this.stampIn(pack, textArg(args, 'stamp'));
            this.stampPacks.removeStamp(stamp.element);
            return { removed: stamp.stampId };
          },
        },
      ],
    };
  }

  /** A picture of the room this seat may pick, as the picture picker offers it, by id. */
  private pictureFor(identifier: string): { identifier: string; name: string } {
    const id = identifier.trim();
    const image = this.imageStorage.get(id);
    const shown = image && !isAccountAvatar(id) && canBrowseImage(ImageTag.get(id) ?? null, this.tagLock.sight());
    if (!image || !shown) {
      throw new AgentToolError('not_found', `There is no picture with the id ${id} that this seat can pick.`);
    }
    return { identifier: image.identifier, name: image.name };
  }

  /** A stamp of a set, by its stamp id or picture id, else by its name. */
  private stampIn(pack: StampPack, reference: string): StampPack['stamps'][number] {
    const wanted = reference.trim();
    const stamps = pack.stamps;
    const byId = stamps.find((stamp) => stamp.stampId === wanted || stamp.imageIdentifier === wanted);
    return (
      byId ??
      findOne(
        stamps,
        wanted,
        (stamp) => stamp.stampId,
        (stamp) => stamp.name,
        'stamp'
      )
    );
  }

  private vote(): AgentKind<Vote> {
    const answer = (vote: Vote, peerId: string): string => {
      const given = vote.voteAnswerByPeerId(peerId);
      if (given === VOTE_UNANSWERED) return 'unanswered';
      if (!vote.answersShown() && peerId !== PeerCursor.myCursor?.peerId) return 'answered';
      return given === VOTE_ABSTAINED ? 'abstained' : vote.indexToChoice(given);
    };
    return {
      kind: Vote.aliasName,
      description:
        "The room's vote or roll call. There is one, which starting another replaces; leave its id out. The seats asked answer it; once all have, or the chair ends it, the result is said in chat. A secret vote keeps who answered what from everyone until it is over.",
      list: () => {
        const vote = this.objectStore.get('Vote');
        return vote instanceof Vote ? [vote] : [];
      },
      idOf: (vote) => vote.identifier,
      nameOf: (vote) => vote.voteTitle || 'vote',
      fields: [
        textField<Vote>('title', 'What is asked.', null, (vote) => vote.voteTitle),
        choiceField<Vote, 'vote' | 'roll_call'>(
          'type',
          'A vote among choices, or a roll call answered by being ready.',
          null,
          ['vote', 'roll_call'],
          (vote) => (vote.isRollCall ? 'roll_call' : 'vote')
        ),
        listField<Vote>('choices', 'What may be answered.', null, { type: 'string' }, (vote) => [...vote.choices]),
        flagField<Vote>(
          'secret',
          'Whether who answered what is hidden until it is over.',
          null,
          (vote) => vote.isSecret
        ),
        flagField<Vote>('open', 'Whether it is being answered now.', null, (vote) => vote.isOpen()),
        textField<Vote>('chair', 'The seat that started it.', null, (vote) => peerFaceOf(vote.chairId).name),
        textField<Vote>('tab', 'The chat tab it is said in; empty for the system tab.', null, (vote) =>
          this.tabNameOf(vote.chatTabIdentifier)
        ),
        listField<Vote>(
          'answers',
          'The seats asked and how each answered: a choice, abstained, unanswered, or answered where a secret vote still hides it. Shown to the seats asked and to the chair, as their screens show it.',
          null,
          {
            type: 'object',
            properties: { seat: { type: 'string' }, answer: { type: 'string' } },
            additionalProperties: false,
          },
          (vote) =>
            vote.chkToMe() || vote.isChair()
              ? vote.targetPeerId.map((peerId) => ({ seat: peerFaceOf(peerId).name, answer: answer(vote, peerId) }))
              : undefined
        ),
        shownField<Vote>(
          'this_seat',
          'Whether this seat was asked, has answered, and is the chair.',
          { asked: { type: 'boolean' }, answered: { type: 'boolean' }, chair: { type: 'boolean' } },
          (vote) => ({
            asked: vote.chkToMe(),
            answered: vote.isVoteEnd(PeerCursor.myCursor?.peerId ?? ''),
            chair: vote.isChair(),
          })
        ),
      ],
      actions: [
        {
          name: 'start',
          description:
            'Starts a vote or roll call, with this seat in the chair, and says so in chat. It asks the other seats named, or every other seat in the room where none is named, and this seat as well where include_self is true. A roll call asks to be answered ready, under its own title.',
          access: 'write',
          input: objectInput({
            type: { type: 'string', enum: ['vote', 'roll_call'], description: 'vote (the default) or roll_call.' },
            title: text('What is asked, for a vote.'),
            choices: texts('The choices, for a vote; two of the usual answers where none are given.', 20, 100),
            secret: { type: 'boolean', description: 'Whether who answered what stays hidden until it is over.' },
            to: texts('The other seats to ask, by name.'),
            include_self: { type: 'boolean', description: 'Whether this seat is asked as well.' },
            tab: text('The chat tab it is said in, by id or name; the system tab where left out.'),
          }),
          run: (vote, args) => this.startVote(vote, args),
        },
        {
          name: 'answer',
          description:
            'Answers the vote this seat was asked, once, and says so in chat: with one of its choices, or abstaining. A roll call is answered ready where no choice is given.',
          access: 'write',
          input: objectInput({
            choice: text('The choice answered.'),
            abstain: { type: 'boolean', description: 'Abstains instead.' },
          }),
          run: (vote, args) => this.answerVote(vote, args),
        },
        {
          name: 'finish',
          description: 'Ends the vote early and has the result said, as its chair may.',
          access: 'write',
          input: objectInput(),
          run: (vote) => {
            this.refuseVote(this.votes.finish(), 'end a vote');
            return { finished: vote.voteTitle };
          },
        },
      ],
    };
  }

  /** Throws why the vote service turned a call down, naming what was asked; nothing where it was done. */
  private refuseVote(refusal: VoteRefusal | null, asked: string): void {
    if (refusal === null) return;
    const reasons: Record<VoteRefusal, [AgentToolError['code'], string]> = {
      guest: ['not_allowed', `A guest may not ${asked}.`],
      noSeat: ['invalid_input', 'Ask at least one seat that may answer; a guest answers nothing.'],
      missing: ['failed', 'The room holds no vote yet; it comes with the room once it is open.'],
      closed: ['failed', 'There is no vote being answered.'],
      notAsked: ['not_allowed', 'This seat was not asked.'],
      answered: ['not_allowed', 'This seat has answered already.'],
      notOffered: ['invalid_input', 'That is not one of the choices.'],
      notChair: ['not_allowed', 'Only the chair may end the vote early.'],
    };
    const [code, message] = reasons[refusal];
    throw new AgentToolError(code, message);
  }

  /**
   * The seats a vote or an alarm goes to, by peer id, as their menus pick them: the other seats named,
   * or every other seat still in the room where none is named, and this seat where it includes itself.
   */
  private seatsAsked(named: unknown, includeSelf: boolean): string[] {
    const others = getPeerContexts().map((peer) => peer.peerId);
    const seats = others
      .map((peerId) => PeerCursor.findByPeerId(peerId))
      .filter((seat): seat is PeerCursor => seat !== null);
    const chosen = Array.isArray(named)
      ? (named as string[]).map(
          (name) =>
            findOne(
              seats,
              name,
              (seat) => seat.peerId,
              (seat) => seat.name,
              'seat'
            ).peerId
        )
      : connectedPeerIdsOf(others);
    const me = PeerCursor.myCursor?.peerId ?? '';
    return [...new Set([...chosen, ...(includeSelf && me ? [me] : [])])];
  }

  /** Starts a vote through the vote menu's own {@link VoteService.start}, said in chat as the AI's words. */
  private startVote(vote: Vote, args: AgentArgs): unknown {
    const rollCall = args['type'] === 'roll_call';
    const tab = this.tabIdentifierOf(textArg(args, 'tab'));
    const asked = this.seatsAsked(args['to'], args['include_self'] === true);
    const refusal = this.chat.asAiWords(() =>
      this.votes.start({
        rollCall,
        title: textArg(args, 'title'),
        choices: (args['choices'] as string[] | undefined) ?? [],
        asked,
        secret: args['secret'] === true,
        tabIdentifier: tab,
      })
    );
    this.refuseVote(refusal, 'start a vote');
    return {
      started: vote.voteTitle,
      asked: vote.targetPeerId.map((peerId) => peerFaceOf(peerId).name),
      choices: vote.choices,
    };
  }

  /** Answers a vote through its widget's own {@link VoteService.answer}, said in chat as the AI's words. */
  private answerVote(vote: Vote, args: AgentArgs): unknown {
    this.refuseVote(this.votes.answerRefusal(), 'answer a vote');
    const named = textArg(args, 'choice').trim();
    const choice = args['abstain'] === true ? null : named || (vote.isRollCall ? vote.choices[0] : '');
    if (choice !== null && !vote.choices.includes(choice)) {
      throw new AgentToolError('invalid_input', `Answer one of ${vote.choices.join(', ')}, or abstain.`);
    }
    this.refuseVote(
      this.chat.asAiWords(() => this.votes.answer(choice)),
      'answer a vote'
    );
    return { answered: choice ?? 'abstained' };
  }

  private alarm(): AgentKind<Alarm> {
    return {
      kind: Alarm.aliasName,
      description:
        "The room's alarm: a countdown that, once up, rings and pops up on the screens of the seats it was set for and is said in chat. There is one, which setting another replaces; leave its id out. One set cannot be called off.",
      list: () => {
        const alarm = this.objectStore.get('Alarm');
        return alarm instanceof Alarm ? [alarm] : [];
      },
      idOf: (alarm) => alarm.identifier,
      nameOf: (alarm) => alarm.alarmTitle || 'alarm',
      fields: [
        textField<Alarm>('title', 'What it is for.', null, (alarm) => alarm.alarmTitle),
        numberField<Alarm>('seconds', 'How long it counts down.', null, { minimum: 0 }, (alarm) => alarm.alarmTime),
        textField<Alarm>('set_by', 'The seat that set it.', null, (alarm) => peerFaceOf(alarm.alarmPeerId).name),
        listField<Alarm>('to', 'The seats it rings for.', null, { type: 'string' }, (alarm) =>
          alarm.targetPeerId.map((peerId) => peerFaceOf(peerId).name)
        ),
        flagField<Alarm>('sound', 'Whether it rings and is said in chat when up.', null, (alarm) => alarm.isSound),
        flagField<Alarm>('popup', 'Whether it pops up when up.', null, (alarm) => alarm.isPopUp),
        numberField<Alarm>(
          'set_at',
          'When it was set, in epoch milliseconds; 0 for never.',
          null,
          {},
          (alarm) => Number(alarm.initTimeStamp) || 0
        ),
      ],
      actions: [
        {
          name: 'start',
          description:
            'Sets the alarm, says so in chat, and starts it counting down. It goes to the other seats named, or every other seat in the room where none is named, and to this seat unless include_self is false.',
          access: 'write',
          input: objectInput({
            title: text('What it is for.'),
            seconds: {
              type: 'integer',
              minimum: 0,
              maximum: 3600,
              description: 'How long it counts down; 60 by default.',
            },
            to: texts('The other seats it goes to, by name.'),
            include_self: { type: 'boolean', description: 'Whether it goes to this seat as well; true by default.' },
            sound: { type: 'boolean', description: 'Whether it rings and is said in chat when up; true by default.' },
            popup: { type: 'boolean', description: 'Whether it pops up when up; true by default.' },
          }),
          run: (alarm, args) => this.startAlarm(alarm, args),
        },
      ],
    };
  }

  /** Sets the alarm through the alarm menu's own {@link AlarmService.set}, said in chat as the AI's words. */
  private startAlarm(alarm: Alarm, args: AgentArgs): unknown {
    const refusal = this.chat.asAiWords(() =>
      this.alarms.set({
        title: textArg(args, 'title'),
        seconds: numberArg(args, 'seconds', 60),
        to: this.seatsAsked(args['to'], args['include_self'] !== false),
        sound: args['sound'] !== false,
        popup: args['popup'] !== false,
      })
    );
    if (refusal === 'guest') throw new AgentToolError('not_allowed', 'A guest may not set the alarm.');
    if (refusal === 'noSeat') throw new AgentToolError('invalid_input', 'Set it for at least one seat.');
    if (refusal === 'missing') throw new AgentToolError('failed', 'The room has no alarm yet.');
    return {
      set: alarm.alarmTitle,
      seconds: alarm.alarmTime,
      to: alarm.targetPeerId.map((peerId) => peerFaceOf(peerId).name),
    };
  }

  private scenarioText(): AgentKind<ScenarioText> {
    return {
      kind: ScenarioText.aliasName,
      description:
        "A scenario text: a passage the game master wrote to say in chat when the time comes, word for word with its chat decoration, filed in folders. The game master's alone: other seats are shown none.",
      list: () => (this.permission.isGameMaster() ? ScenarioText.all() : []),
      idOf: (passage) => passage.identifier,
      nameOf: (passage) => passage.title,
      fields: [
        textField<ScenarioText>(
          'title',
          'Its title, which it is said under unless said otherwise.',
          'gm',
          (passage) => passage.title,
          (passage, value) => {
            passage.title = value.trim();
          }
        ),
        textField<ScenarioText>(
          'text',
          'The passage, in the chat marks it is decorated with.',
          'gm',
          (passage) => passage.text,
          (passage, value) => passage.write(value),
          50000
        ),
        textField<ScenarioText>(
          'folder',
          'The folder it is filed in, as a path like 第1話/導入; empty for none.',
          'gm',
          (passage) => passage.folderName,
          (passage, value) => {
            this.scenarioTexts.fileInto(passage, value);
          }
        ),
        numberField<ScenarioText>(
          'position',
          'Its place among the texts of its folder, from 1.',
          'gm',
          { minimum: 1, integer: true },
          (passage) => folderSiblingsOf(ScenarioText.all(), passage).indexOf(passage) + 1,
          (passage, value) => this.scenarioTexts.moveInFolder(passage, value - 1)
        ),
        choiceField<ScenarioText, ScenarioTextSpeaker>(
          'send_as',
          'Who says it: under its title, as the piece this seat speaks as, or as the room.',
          'gm',
          SCENARIO_TEXT_SPEAKERS,
          (passage) => scenarioTextSpeakerOf(passage.sendAs),
          (passage, value) => {
            passage.sendAs = value;
          }
        ),
        {
          ...textField<ScenarioText>(
            'tab',
            'The chat tab it is said in, by name; empty for the tab being read. Written by id or name.',
            'gm',
            (passage) => this.tabNameOf(passage.tab),
            (passage, value) => {
              passage.tab = this.tabIdentifierOf(value);
            }
          ),
          refuse: (_passage, value) => refusalOf(() => this.tabIdentifierOf(`${value}`)),
        },
        textField<ScenarioText>(
          'colour',
          "The colour it is said in, as #rrggbb; empty for the speaker's own.",
          'gm',
          (passage) => passage.color,
          (passage, value) => {
            passage.color = value.trim();
          },
          30
        ),
        numberField<ScenarioText>(
          'last_said',
          'When this browser last said it, in epoch milliseconds; null for never.',
          null,
          {},
          (passage) => this.scenarioTexts.sentAt(passage.identifier)
        ),
      ],
      create: {
        access: 'gm',
        description: 'Makes an empty text, last in the list, under a default title unless a title is written.',
        input: objectInput(),
        make: () => {
          const title = this.t('feature.scenarioText.defaultTitle', { index: ScenarioText.all().length + 1 });
          const made = this.scenarioTexts.create(title);
          if (!made) throw new AgentToolError('not_allowed', "Scenario texts are the game master's to write.");
          return made;
        },
      },
      remove: { access: 'gm', take: (passage) => passage.destroy() },
      actions: [
        {
          name: 'send',
          description: 'Says the text in chat word for word, as the scenario text panel says it.',
          access: 'gm',
          input: objectInput({
            tab: text('The chat tab, by id or name; its own, else the tab being read, where left out.'),
            as: { type: 'string', enum: SCENARIO_TEXT_SPEAKERS, description: 'Who says it this time.' },
          }),
          run: (passage, args) => {
            const tab = this.tabIdentifierOf(textArg(args, 'tab'));
            const as = textArg(args, 'as');
            const said = this.chat.asAiWords(() =>
              this.scenarioTexts.send(passage, {
                ...(tab ? { tab } : {}),
                ...(as ? { speaker: scenarioTextSpeakerOf(as) } : {}),
              })
            );
            if (!said) throw new AgentToolError('failed', `${passage.title} could not be said; is it empty?`);
            return { said: passage.title };
          },
        },
      ],
    };
  }

  private party(): AgentKind<Party> {
    return {
      kind: Party.aliasName,
      description:
        "A party: pieces that stand together, marked with a colour, with the parties it stands with, the side of the battle stage it takes, and the players who play it besides the owners of its pieces. The game master's to keep, as on screen; another seat is shown the parties of its own pieces and those it plays. A piece joins a party by its own party field.",
      list: () => {
        if (this.permission.isGameMaster()) return this.objectStore.getObjects<Party>(Party);
        const me = PeerCursor.myUserId;
        const mine = new Set(
          this.objectStore
            .getObjects<GameCharacter>(GameCharacter)
            .filter((piece) => piece.owner === me)
            .map((piece) => piece.partyIdentifier)
        );
        return this.objectStore
          .getObjects<Party>(Party)
          .filter((party) => mine.has(party.identifier) || party.playerIds.includes(me));
      },
      idOf: (party) => party.identifier,
      nameOf: (party) => party.name,
      fields: [
        textField<Party>(
          'name',
          'Its name.',
          'gm',
          (party) => party.name,
          (party, value) => this.parties.rename(party, value),
          100
        ),
        choiceField<Party, string>(
          'colour',
          'The colour it is marked with.',
          'gm',
          PARTY_COLORS,
          (party) => party.color,
          (party, value) => this.parties.recolor(party, value)
        ),
        {
          ...listField<Party>(
            'allies',
            'The parties it stands with, by name; written by id or name. Either party saying so makes them allies, and leaving one off breaks it on both sides.',
            'gm',
            { type: 'string', maxLength: 200 },
            (party) => this.alliesOf(party).map((ally) => ally.name),
            (party, value) => this.setAllies(party, value as string[]),
            50
          ),
          refuse: (party, value) => refusalOf(() => this.alliesNamed(party, value as string[])),
        },
        choiceField<Party, string>(
          'battle_side',
          'The side of the battle stage its members stand on, where one was not put on a side of its own.',
          'gm',
          [...BATTLE_SIDES, 'none'],
          (party) => asBattleSide(party.battleSide) ?? 'none',
          (party, value) => {
            this.parties.setBattleSide(party, asBattleSide(value));
          }
        ),
        {
          ...listField<Party>(
            'players',
            'The players who play it besides the owners of its pieces, by seat name.',
            'gm',
            { type: 'string', maxLength: 100 },
            (party) => party.playerIds.map((userId) => PeerCursor.findByUserId(userId)?.name || userId),
            (party, value) => this.setPartyPlayers(party, value as string[]),
            50
          ),
          refuse: (_party, value) => refusalOf(() => this.playersNamed(value as string[])),
        },
        listField<Party>('members', 'Its pieces this seat comes across.', null, NAMED, (party) => {
          const reach = new Set(this.piecesInReach());
          return this.parties
            .membersOf(party.identifier)
            .filter((piece) => reach.has(piece))
            .map((piece) => ({ id: piece.identifier, name: this.views.nameOf(piece) }));
        }),
      ],
      create: {
        access: 'gm',
        description:
          'Makes a party with no members, under a default name unless a name is written, in a colour no party uses yet.',
        input: objectInput(),
        make: () =>
          this.parties.create(
            this.t('feature.gmTools.party.defaultName', {
              index: this.objectStore.getObjects<Party>(Party).length + 1,
            })
          ),
      },
      remove: { access: 'gm', take: (party) => this.parties.remove(party) },
    };
  }

  private alliesOf(party: Party): Party[] {
    return this.objectStore
      .getObjects<Party>(Party)
      .filter((other) => other !== party && this.parties.standsWith(party, other.identifier));
  }

  /** The other parties named, by id or name, as their identifiers; refused for one this room has not got. */
  private alliesNamed(party: Party, named: readonly string[]): Set<string> {
    const others = this.objectStore.getObjects<Party>(Party).filter((other) => other !== party);
    return new Set(
      named.map(
        (reference) =>
          findOne(
            others,
            reference,
            (other) => other.identifier,
            (other) => other.name,
            'party'
          ).identifier
      )
    );
  }

  /** Has a party stand with the parties named and with no other, as the party panel's ticks do one by one. */
  private setAllies(party: Party, named: readonly string[]): void {
    const wanted = this.alliesNamed(party, named);
    for (const other of this.objectStore.getObjects<Party>(Party)) {
      if (other === party) continue;
      const together = wanted.has(other.identifier);
      if (this.parties.standsWith(party, other.identifier) !== together) {
        this.parties.stand(party, other.identifier, together);
      }
    }
  }

  /** The players named, by seat name, as user identifiers; refused for a name no player in the room goes by. */
  private playersNamed(named: readonly string[]): Set<string> {
    const players = this.objectStore
      .getObjects<PeerCursor>(PeerCursor)
      .filter((cursor) => cursor.isPlayer && cursor.userId.length > 0);
    return new Set(
      named.map(
        (name) =>
          findOne(
            players,
            name,
            (cursor) => cursor.userId,
            (cursor) => cursor.name,
            'player'
          ).userId
      )
    );
  }

  /** Has a party played by the players named and by no other, as the party panel's ticks do one by one. */
  private setPartyPlayers(party: Party, named: readonly string[]): void {
    const wanted = this.playersNamed(named);
    for (const userId of party.playerIds) if (!wanted.has(userId)) this.parties.setPlayer(party, userId, false);
    for (const userId of wanted) this.parties.setPlayer(party, userId, true);
  }

  private boardScene(): AgentKind<BoardScene> {
    return {
      kind: BoardScene.aliasName,
      description:
        "A scene: how a table looks and what the room hears, kept to be put on in one go. Made from the table as it stands now. The game master's alone: other seats are shown none.",
      list: () => (this.permission.isGameMaster() ? BoardScene.all() : []),
      idOf: (scene) => scene.identifier,
      nameOf: (scene) => scene.name,
      fields: [
        textField<BoardScene>(
          'name',
          'Its name.',
          'gm',
          (scene) => scene.name,
          (scene, value) => {
            scene.name = value.trim();
          }
        ),
        textField<BoardScene>(
          'folder',
          'The folder it is filed in, as a path like 第1話/村; empty for none.',
          'gm',
          (scene) => scene.folderName,
          (scene, value) => {
            this.scenes.fileInto(scene, value);
          }
        ),
        numberField<BoardScene>(
          'position',
          'Its place among the scenes of its folder, from 1.',
          'gm',
          { minimum: 1, integer: true },
          (scene) => folderSiblingsOf(BoardScene.all(), scene).indexOf(scene) + 1,
          (scene, value) => this.scenes.moveInFolder(scene, value - 1)
        ),
        textField<BoardScene>(
          'table',
          'The name of the table it shows; empty for the one in view.',
          null,
          (scene) => `${scene.tableName ?? ''}`
        ),
        listField<BoardScene>(
          'changes',
          'What it changes as it is put on: table, floor, background, sky, walls, foreground, weather, darkness, fog, bgm, bgs, cutIn, clock, text, fade.',
          null,
          { type: 'string' },
          (scene) => scenePartsOf(scene)
        ),
        textField<BoardScene>('words', 'What it says in chat as it is put on.', null, (scene) => `${scene.text ?? ''}`),
        flagField<BoardScene>(
          'current',
          'Whether it is the scene put on last.',
          null,
          (scene) => Config.instance.boardScene === scene.identifier
        ),
      ],
      create: {
        access: 'gm',
        description:
          'Makes a scene of the table in view as it stands and of the music and sounds playing now, last in the list, under a default name unless a name is written.',
        input: objectInput(),
        make: () => {
          const name = this.t('feature.scene.defaultName', { index: BoardScene.all().length + 1 });
          const made = this.scenes.create(name);
          if (!made) throw new AgentToolError('not_allowed', "Scenes are the game master's to make.");
          return made;
        },
      },
      remove: { access: 'gm', take: (scene) => scene.destroy() },
      actions: [
        {
          name: 'apply',
          description: 'Puts the scene on, as apply_scene does, leaving out its music or its words where asked.',
          access: 'gm',
          input: objectInput({
            music: { type: 'boolean', description: 'False to leave the music as it is.' },
            words: { type: 'boolean', description: 'False to say nothing in chat.' },
          }),
          run: (scene, args) => {
            const options = {
              ...(args['music'] === false ? { bgm: false } : {}),
              ...(args['words'] === false ? { text: false } : {}),
            };
            if (!this.scenes.apply(scene, options))
              throw new AgentToolError('failed', `${scene.name} could not be put on.`);
            return { applied: scene.name };
          },
        },
        {
          name: 'overwrite',
          description:
            'Writes the table as it stands, and the music and sounds playing now, over the parts the scene changes, keeping its name, words and cut-ins.',
          access: 'gm',
          input: objectInput(),
          run: (scene) => {
            this.scenes.overwrite(scene);
            return { overwritten: scene.name, changes: scenePartsOf(scene) };
          },
        },
      ],
    };
  }

  /** The rules of play in force on the table in view, as the room settings read them. */
  private rules(): RoomRules {
    return this.roomRules.rulesFor(TableSelecter.instance.viewTable);
  }

  /** What a room setting is read from and written to, as the room settings read them. */
  private readonly settingSources: RoomSettingSources = {
    config: () => Config.instance,
    rules: () => this.rules(),
    zone: () => this.roomRules.zoneRules(),
  };

  /**
   * A field of the room's settings, read and written through its entry in {@link ROOM_SETTINGS} as the
   * room settings read and write it, and written by the seats the panel lets write it. `taken` turns
   * what the AI gave into the value written, where more than its schema decides that.
   */
  private settingField<K extends RoomSettingKey>(
    key: K,
    name: string,
    description: string,
    schema: AgentSchema,
    taken: (value: unknown) => RoomSettingValue<K> = (value) => value as RoomSettingValue<K>
  ): AgentKindField<Config> {
    const setting = roomSettingOf(key);
    return {
      name,
      description,
      schema,
      access: SETTING_ACCESS[setting.writer],
      read: () => setting.read(this.settingSources),
      put: (_config, value) => setting.write(this.settingSources, taken(value)),
    };
  }

  private config(): AgentKind<Config> {
    return {
      kind: CONFIG_ALIAS,
      description:
        "The room's settings: the story's clock, the dice system, how the round is taken and the rules pieces move by. There is one; leave its id out. A rule written here is the room's own answer, over the table's.",
      list: () => [Config.instance],
      idOf: (config) => config.identifier,
      nameOf: () => 'room settings',
      fields: [
        shownField<Config>(
          'clock',
          "The story's clock: the day, the part of the day or the time, as everyone sees it. Move it with step_clock and set_clock.",
          {
            day: { type: 'integer' },
            day_text: { type: 'string' },
            time_text: { type: 'string' },
            mode: { type: 'string', enum: ['periods', 'hours'] },
            part: { type: 'string' },
            parts: { type: 'array', items: { type: 'string' } },
            minutes: { type: 'integer' },
          },
          () => {
            const clock = this.clock.clock();
            const parts = this.clock.periods();
            return {
              day: clock.day,
              day_text: this.clock.dayText(),
              time_text: this.clock.timeText(),
              mode: clock.mode,
              part: parts[clock.period] ?? '',
              parts: [...parts],
              minutes: clock.minutes,
            };
          }
        ),
        {
          ...this.settingField(
            'defaultDiceBot',
            'dice_system',
            'The id of the dice system the room rolls under by default, as list_assets with kind dice_systems gives it.',
            { type: 'string', maxLength: 100 },
            (value) => this.diceSystem(`${value}`)
          ),
          refuse: (_config, value) => refusalOf(() => this.diceSystem(`${value}`)),
        },
        this.settingField(
          'turnOrderMode',
          'turn_order',
          'How the round decides whose turn it is: by initiative, or side by side (faction).',
          { type: 'string', enum: TURN_ORDER_MODES }
        ),
        this.settingField(
          'factionPhaseMode',
          'faction_phase',
          "When the round goes side by side, how a side's pieces take their phase: freely, or by initiative.",
          { type: 'string', enum: FACTION_PHASE_MODES }
        ),
        this.settingField(
          'factionSkipUnassigned',
          'faction_skip_unassigned',
          'When the round goes side by side, whether pieces in no party sit it out.',
          { type: 'boolean' }
        ),
        this.settingField(
          'moveRangeEnabled',
          'move_range',
          'Whether a piece picked up shows the squares it can move to.',
          { type: 'boolean' }
        ),
        this.settingField(
          'moveStrict',
          'move_strict',
          'Whether a piece set down walks the cheapest way there, stopping at walls and where its movement runs out.',
          { type: 'boolean' }
        ),
        this.settingField(
          'diagonalMove',
          'diagonal_move',
          'How a step across a corner counts on a square grid: not allowed, the same as a side, every second one double, or double.',
          { type: 'string', enum: DIAGONAL_MOVES }
        ),
        this.settingField(
          'piecesShareCells',
          'pieces_share_squares',
          'Whether two pieces may end a move on one square.',
          { type: 'boolean' }
        ),
        this.settingField(
          'jumpCells',
          'jump_squares',
          'How many squares one leap carries; 0 carries as far as the move has left.',
          { type: 'integer', minimum: 0, maximum: 999 }
        ),
        this.settingField(
          'zocMode',
          'zone_of_control',
          'What the ground around an enemy does to a piece walking into it: nothing, stops it, blocks it, or costs extra.',
          { type: 'string', enum: ZOC_MODES }
        ),
        this.settingField(
          'zocRange',
          'zone_of_control_reach',
          'How many squares out from an enemy the ground it holds reaches.',
          { type: 'integer', minimum: 0, maximum: 99 }
        ),
        this.settingField('zoneEnabled', 'engagement_zones', 'Whether the room plays engagement zones.', {
          type: 'boolean',
        }),
      ],
      actions: [
        {
          name: 'step_clock',
          description:
            "Moves the story's clock on a step, or back one, and says so in chat where the room's clock is set to.",
          access: 'gm',
          input: objectInput({
            direction: { type: 'string', enum: ['on', 'back'], description: 'on (the default) or back.' },
          }),
          run: (_config, args) => {
            this.chat.asAiWords(() => this.clock.step(args['direction'] === 'back' ? -1 : 1));
            return { day: this.clock.dayText(), time: this.clock.timeText() };
          },
        },
        {
          name: 'set_clock',
          description:
            "Puts the story's clock to a day, a part of the day by its name, or a time in minutes past midnight, saying nothing in chat. What is left out stays.",
          access: 'gm',
          input: objectInput({
            day: { type: 'integer', minimum: 1, maximum: 99999, description: 'The day, from 1.' },
            part: text('The part of the day, by its name among the clock parts.', 40),
            minutes: { type: 'integer', minimum: 0, maximum: 1439, description: 'Minutes past midnight.' },
          }),
          run: (_config, args) => this.setClock(args),
        },
      ],
    };
  }

  private setClock(args: AgentArgs): unknown {
    const part = textArg(args, 'part').trim();
    const parts = this.clock.periods();
    const index = part ? parts.indexOf(part) : -1;
    if (part && index < 0) {
      throw new AgentToolError(
        'invalid_input',
        `The clock has no part of the day called ${part} (it has ${parts.join(', ')}).`
      );
    }
    GameObject.batch(() => {
      if (typeof args['day'] === 'number') this.clock.setDay(args['day']);
      if (index >= 0) this.clock.setPeriod(index);
      if (typeof args['minutes'] === 'number') this.clock.setMinutes(args['minutes']);
    });
    return { day: this.clock.dayText(), time: this.clock.timeText() };
  }

  private summarySetting(): AgentKind<DataSummarySetting> {
    const step: AgentSchema = {
      type: 'object',
      properties: {
        item: text('The sheet item sorted by; empty for none.', 100),
        order: { type: 'string', enum: ['ascending', 'descending'] },
      },
      required: ['item', 'order'],
      additionalProperties: false,
    };
    const sortOf = (order: string): SortOrder => (order === 'descending' ? SortOrder.DESC : SortOrder.ASC);
    return {
      kind: DataSummarySetting.aliasName,
      description:
        "How the room's inventory lists pieces: the order, the sheet items shown, the folders kept and the aliases that name one value kept under different names. There is one; leave its id out.",
      list: () => [DataSummarySetting.instance],
      idOf: (setting) => setting.identifier,
      nameOf: () => 'inventory settings',
      fields: [
        {
          ...listField<DataSummarySetting>(
            'sort',
            'The steps of the order, first first: at least two, an empty item for a step that sorts by nothing.',
            'write',
            step,
            (setting) =>
              setting.sortKeys.map((key) => ({
                item: key.tag,
                order: key.order === SortOrder.DESC ? 'descending' : 'ascending',
              })),
            (_setting, value) => {
              const steps = (value as { item: string; order: string }[]).map((each): SortKey => ({
                tag: each.item.trim(),
                order: sortOf(each.order),
              }));
              this.inventory.sortTag = steps[0].tag;
              this.inventory.sortOrder = steps[0].order;
              this.inventory.sortTag2nd = steps[1].tag;
              this.inventory.sortOrder2nd = steps[1].order;
              this.inventory.extraSortKeys = steps.slice(2);
            },
            10
          ),
          schema: { type: 'array', items: step, minItems: 2, maxItems: 10 },
        },
        textField<DataSummarySetting>(
          'display_items',
          'The sheet items the inventory list shows for each piece, separated by spaces.',
          'write',
          (setting) => setting.dataTag,
          (_setting, value) => {
            this.inventory.dataTag = value;
          },
          2000
        ),
        textField<DataSummarySetting>(
          'table_columns',
          "The sheet items the inventory's table layout shows as columns, separated by spaces.",
          'write',
          (setting) => setting.tableDataTag,
          (_setting, value) => {
            this.inventory.tableDataTag = value;
          },
          2000
        ),
        listField<DataSummarySetting>(
          'folders',
          "The folders the room's shared inventory keeps, even while nothing is filed in them, as paths like 敵/ボス.",
          'write',
          { type: 'string', maxLength: 200 },
          (setting) => [...setting.folderPaths],
          (_setting, value) => {
            const paths = (value as string[])
              .map((path) => normalizeFolderPath(path))
              .filter((path) => path.length > 0);
            this.inventory.folderPaths = [...new Set(paths)];
          },
          100
        ),
        listField<DataSummarySetting>(
          'aliases',
          'Names for one value kept under different names on different sheets: each name with the sheet items it is read from, in the order they are tried.',
          'gm',
          {
            type: 'object',
            properties: {
              name: text('The alias.', 100),
              candidates: texts('The sheet items, as paths or names.', 20, 200),
            },
            required: ['name', 'candidates'],
            additionalProperties: false,
          },
          (setting) => setting.aliases.map((alias) => ({ name: alias.name, candidates: [...alias.candidates] })),
          (setting, value) => {
            setting.aliases = readElementAliases(
              writeElementAliases(value as { name: string; candidates: string[] }[])
            );
          },
          100
        ),
      ],
    };
  }

  private statusAilmentCatalog(): AgentKind<StatusAilmentCatalog> {
    return {
      kind: StatusAilmentCatalog.aliasName,
      description:
        'The states the room keeps on hand to put on a piece as a buff, such as poisoned or on fire: what each writes down when ticked on. There is one; leave its id out. Change its states with its actions; taking one off the list leaves the buff on pieces already wearing it.',
      list: () => [StatusAilmentCatalog.instance],
      idOf: (catalog) => catalog.identifier,
      nameOf: () => 'status ailments',
      fields: [
        listField<StatusAilmentCatalog>(
          'ailments',
          'The states, in the order the inventory shows them as columns.',
          null,
          { type: 'object', properties: { name: { type: 'string' }, ...AILMENT_PARTS }, additionalProperties: false },
          () => this.ailments.ailments().map((ailment) => ({ ...ailment }))
        ),
        flagField<StatusAilmentCatalog>(
          'plays_effect',
          'Whether ticking a state on plays the effect of the same name over the piece.',
          'write',
          () => this.ailments.playsEffectOnPlant(),
          (_catalog, value) => this.ailments.setPlaysEffectOnPlant(value)
        ),
      ],
      actions: [
        {
          name: 'add',
          description: 'Adds a state to the end of the list, under a one-word name no other state has.',
          access: 'write',
          input: objectInput({ name: text('Its name, one word.', 50), ...AILMENT_PARTS }, ['name']),
          run: (_catalog, args) => {
            const name = textArg(args, 'name').trim();
            const refusal = this.ailments.nameRefusal(name);
            if (refusal === 'taken')
              throw new AgentToolError('invalid_input', `There is a state called ${name} already.`);
            if (refusal) throw new AgentToolError('invalid_input', "A state's name is one word, without a colon.");
            const next = this.withAilmentParts(newStatusAilment(name), args);
            if (!isStatusAilmentWritable(next)) throw new AgentToolError('invalid_input', AILMENT_FIELD_HELD);
            if (!this.ailments.add(name) || !this.ailments.change(name, next)) {
              throw new AgentToolError('not_allowed', 'This seat may not change the states.');
            }
            return this.ailmentNamed(name);
          },
        },
        {
          name: 'change',
          description: 'Changes the parts given of a state; what is left out stays.',
          access: 'write',
          input: objectInput({ name: text('The state, by name.', 50), ...AILMENT_PARTS }, ['name']),
          run: (_catalog, args) => this.changeAilment(this.ailmentNamed(textArg(args, 'name')), args),
        },
        {
          name: 'remove',
          description: 'Takes a state off the list; pieces already wearing it keep the buff.',
          access: 'write',
          input: objectInput({ name: text('The state, by name.', 50) }, ['name']),
          run: (_catalog, args) => {
            const ailment = this.ailmentNamed(textArg(args, 'name'));
            this.ailments.remove(ailment.name);
            return { removed: ailment.name };
          },
        },
        {
          name: 'move',
          description: 'Moves a state along the list, which is the order of its columns.',
          access: 'write',
          input: objectInput(
            {
              name: text('The state, by name.', 50),
              by: {
                type: 'integer',
                minimum: -100,
                maximum: 100,
                description: 'How many places: negative up, positive down.',
              },
            },
            ['name', 'by']
          ),
          run: (_catalog, args) => {
            const ailment = this.ailmentNamed(textArg(args, 'name'));
            const list = this.ailments.ailments();
            const at = list.findIndex((each) => each.name === ailment.name);
            const to = Math.max(0, Math.min(list.length - 1, at + numberArg(args, 'by', 0)));
            this.ailments.move(ailment.name, to - at);
            return { order: this.ailments.ailments().map((each) => each.name) };
          },
        },
      ],
    };
  }

  private ailmentNamed(name: string): StatusAilment {
    const wanted = name.trim();
    const ailment = this.ailments.ailments().find((each) => each.name === wanted);
    if (!ailment) throw new AgentToolError('not_found', `There is no state called ${wanted}.`);
    return ailment;
  }

  /**
   * Writes the parts given of a state, as the status ailment panel writes each: the timing follows
   * the rounds unless one was chosen, and a status moved brings an operator and an amount with it,
   * or takes them away with it.
   */
  private changeAilment(ailment: StatusAilment, args: AgentArgs): StatusAilment {
    const next = this.withAilmentParts(ailment, args);
    if (!isStatusAilmentWritable(next)) throw new AgentToolError('invalid_input', AILMENT_FIELD_HELD);
    if (!this.ailments.change(ailment.name, next)) {
      throw new AgentToolError('not_allowed', 'This seat may not change the states.');
    }
    return this.ailmentNamed(ailment.name);
  }

  /** A state with the parts given written over it, as {@link changeAilment} writes them. */
  private withAilmentParts(ailment: StatusAilment, args: AgentArgs): StatusAilment {
    let next: StatusAilment = { ...ailment };
    if (typeof args['color'] === 'string') next.color = args['color'];
    if (typeof args['icon'] === 'string') next.icon = args['icon'].trim();
    if (typeof args['rounds'] === 'number') next = withRounds(next, args['rounds']);
    if (typeof args['timing'] === 'string') next.timing = args['timing'] as BuffTiming;
    if (typeof args['effect'] === 'string') next.effect = args['effect'];
    if (typeof args['stat'] === 'string') {
      const stat = args['stat'].trim();
      next =
        stat.length < 1
          ? { ...next, stat: '', op: '', amount: '' }
          : {
              ...next,
              stat,
              op: next.op.length > 0 ? next.op : '=',
              amount: next.amount.length > 0 ? next.amount : '0',
            };
    }
    if (typeof args['op'] === 'string') next.op = args['op'];
    if (typeof args['amount'] === 'string') next.amount = args['amount'];
    return next;
  }
}

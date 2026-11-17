import { inject, Injectable } from '@angular/core';
import { AgentEventLog } from '@axe/application/agent/agent-event-log.service';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { type AgentChatLine, AgentViews } from '@axe/application/agent/agent-views.service';
import { ActiveChatTabService } from '@axe/application/chat/active-chat-tab.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { RoomRulesService } from '@axe/application/tabletop/room-rules.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { ChatTabList } from '@axe/domain/chat/chat-tab-list';
import { DiceBot } from '@axe/domain/dice/dice-bot';
import { AudioTag } from '@axe/domain/media/audio-tag';
import { CutIn } from '@axe/domain/media/cut-in';
import { ImageTag } from '@axe/domain/media/image-tag';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canRoleEdit } from '@axe/domain/peer/peer-role';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isLengthUnit, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { RangeArea } from '@axe/domain/tabletop/range';
import { filterByName, findOne, numberArg, textArg } from '@axe/features/agent-tools/agent-lookup';

const GRID_KINDS: Record<number, string> = {
  [GridType.SQUARE]: 'square',
  [GridType.HEX_VERTICAL]: 'hex (flat top)',
  [GridType.HEX_HORIZONTAL]: 'hex (pointy top)',
  [GridType.NONE]: 'none',
};

/** A named thing as list_assets lists it. */
interface Listed {
  readonly id: string;
  readonly name: string;
}

/**
 * The tools that read the room as the linked seat sees it, and wait for what happens in it: none of
 * them changes anything.
 */
@Injectable({ providedIn: 'root' })
export class AgentReadTools {
  private readonly views = inject(AgentViews);
  private readonly events = inject(AgentEventLog);
  private readonly tabletop = inject(TabletopService);
  private readonly turns = inject(TurnOrderService);
  private readonly rules = inject(RoomRulesService);
  private readonly permission = inject(RolePermissionService);
  private readonly chat = inject(ChatMessageService);
  private readonly activeTab = inject(ActiveChatTabService);
  private readonly effects = inject(EffectLibraryService);
  private readonly objectStore = inject(ObjectStore);
  private readonly audioStorage = inject(AudioStorage);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    get_room: () => this.room(),
    list_pieces: (args) =>
      filterByName(this.views.visiblePieces(), (piece) => this.views.nameOf(piece), args['name'], 500).map((piece) =>
        this.views.piece(piece)
      ),
    get_piece: (args) => this.pieceInFull(this.piece(textArg(args, 'piece'))),
    get_turn_order: () => this.turnOrder(),
    read_chat: (args) => this.readChat(args),
    list_assets: (args) => this.assets(textArg(args, 'kind'), args['name'], numberArg(args, 'limit', 100)),
    read_scenario_text: (args) => this.scenarioText(textArg(args, 'text')),
    wait_for_events: (args, { signal }) =>
      this.events.waitFor(
        typeof args['after'] === 'string' ? args['after'] : undefined,
        numberArg(args, 'timeout_seconds', 25) * 1000,
        signal
      ),
  };

  /** A piece this seat sees, by id or name. */
  piece(reference: string): GameCharacter {
    return findOne(
      this.views.visiblePieces(),
      reference,
      (piece) => piece.identifier,
      (piece) => this.views.nameOf(piece),
      'piece'
    );
  }

  /** A chat tab by id or name, or the tab this seat has open where none is named. */
  tab(reference: string): ChatTab {
    const tabs = ChatTabList.instance.chatTabs;
    if (reference.trim() === '') {
      const open = this.activeTab.current() ?? tabs[0];
      if (!open) throw new AgentToolError('not_found', 'The room has no chat tab.');
      return open;
    }
    return findOne(
      tabs,
      reference,
      (tab) => tab.identifier,
      (tab) => tab.name,
      'chat tab'
    );
  }

  /** The dice system lines are rolled under, as the chat box rolls them. */
  diceSystem(): string {
    const chosen = this.chat.gameType;
    return chosen && chosen !== 'DiceBot' ? chosen : Config.instance.defaultDiceBot;
  }

  private room(): unknown {
    const table = this.tabletop.currentTable;
    const grid = this.views.grid(table);
    const rules = this.rules.rulesFor(table);
    const unit = parseMoveUnit(rules.cellDistanceUnit);
    const role = this.permission.role();
    const progress = this.turns.progress();
    const current = progress.currentIdentifier ? this.objectStore.get<GameCharacter>(progress.currentIdentifier) : null;
    const system = this.diceSystem();
    const open = this.activeTab.current();
    return {
      seat: {
        name: PeerCursor.myCursor?.name ?? '',
        role,
        may_change: canRoleEdit(role),
      },
      tables: this.views.tables().map((each) => ({ id: each.identifier, name: each.name })),
      table: {
        id: table.identifier,
        name: table.name,
        grid: GRID_KINDS[table.gridType] ?? 'square',
        cols: grid.cols,
        rows: grid.rows,
        square_length: isLengthUnit(unit) && rules.cellDistance > 0 ? { value: rules.cellDistance, unit } : null,
      },
      turn: {
        round: progress.round,
        phase: progress.phase,
        current:
          current instanceof GameCharacter && this.views.sees(current)
            ? { id: current.identifier, name: this.views.nameOf(current) }
            : null,
      },
      chat_tabs: ChatTabList.instance.chatTabs.map((tab) => ({
        id: tab.identifier,
        name: tab.name,
        ...(tab === open ? { open: true } : {}),
      })),
      dice_system: { id: system, name: DiceBot.diceBotInfos.find((info) => info.id === system)?.name ?? system },
      seats: this.objectStore.getObjects<PeerCursor>(PeerCursor).map((cursor) => cursor.name),
      events_cursor: this.events.cursorNow(),
    };
  }

  private pieceInFull(piece: GameCharacter): unknown {
    const sheet = this.views.sheet(piece);
    return {
      ...this.views.piece(piece),
      sheet: sheet ?? 'This seat may not open the sheet of this piece.',
      palette: sheet ? (piece.chatPalette?.getPalette() ?? []) : [],
    };
  }

  private turnOrder(): unknown {
    const progress = this.turns.progress();
    return {
      round: progress.round,
      phase: progress.phase,
      order: this.turns
        .orderedCharacters()
        .filter((piece) => this.views.sees(piece))
        .map((piece) => ({
          id: piece.identifier,
          name: this.views.nameOf(piece),
          ...(piece.identifier === progress.currentIdentifier ? { current: true } : {}),
          ...(progress.acted.has(piece.identifier) ? { acted: true } : {}),
          ...(progress.held.has(piece.identifier) ? { holding: true } : {}),
        })),
    };
  }

  private readChat(args: Readonly<Record<string, unknown>>): unknown {
    const tab = this.tab(textArg(args, 'tab'));
    const limit = numberArg(args, 'limit', 50);
    let messages = tab.chatMessages;
    const before = textArg(args, 'before');
    if (before) {
      const at = messages.findIndex((message) => message.identifier === before);
      if (at < 0) throw new AgentToolError('not_found', `There is no line with the id ${before} in ${tab.name}.`);
      messages = messages.slice(0, at);
    }
    const lines: AgentChatLine[] = [];
    for (let i = messages.length - 1; i >= 0 && lines.length < limit; i--) {
      const line = this.views.chatLine(messages[i]);
      if (line) lines.unshift(line);
    }
    return { tab: { id: tab.identifier, name: tab.name }, lines };
  }

  private assets(kind: string, name: unknown, limit: number): unknown {
    const listed = (things: readonly Listed[]) => filterByName(things, (thing) => thing.name, name, limit);
    switch (kind) {
      case 'effects':
        return listed(
          this.effects
            .presets()
            .filter((preset) => !preset.gmOnly || this.permission.isGameMaster())
            .map((preset) => ({ id: preset.identifier, name: preset.name }))
        );
      case 'bgm':
      case 'ambient':
      case 'sound_effects':
        return listed(
          this.audioStorage.audios
            .filter((audio) => this.soundKind(audio.identifier) === kind)
            .map((audio) => ({ id: audio.identifier, name: audio.name }))
        );
      case 'cut_ins':
        return listed(
          this.objectStore.getObjects<CutIn>(CutIn).map((cutIn) => ({ id: cutIn.identifier, name: cutIn.name }))
        );
      case 'images':
        return listed(
          ImageTag.searchImages([], this.permission.canSeeHidden()).map((image) => ({
            id: image.identifier,
            name: image.name,
          }))
        );
      case 'scenes':
        return listed(BoardScene.all().map((scene) => ({ id: scene.identifier, name: scene.name })));
      case 'scenario_texts':
        this.mustBeGameMaster();
        return listed(ScenarioText.all().map((text) => ({ id: text.identifier, name: text.title })));
      case 'tables':
        return listed(this.views.tables().map((table) => ({ id: table.identifier, name: table.name })));
      case 'ranges':
        return listed(
          this.tabletop.ranges.map((range: RangeArea) => ({
            id: range.identifier,
            name: range.name,
            shape: range.type,
          }))
        );
      case 'dice_systems':
        return listed(DiceBot.diceBotInfos.map((info) => ({ id: info.id, name: info.name })));
      default:
        throw new AgentToolError('invalid_input', `There is no kind of thing called ${kind}.`);
    }
  }

  private scenarioText(reference: string): unknown {
    this.mustBeGameMaster();
    const text = findOne(
      ScenarioText.all(),
      reference,
      (each) => each.identifier,
      (each) => each.title,
      'scenario text'
    );
    return { id: text.identifier, title: text.title, folder: text.folderName, text: text.text };
  }

  /** Scenario texts reach every peer, and only the screen keeps them to the game master: so does this. */
  private mustBeGameMaster(): void {
    if (!this.permission.isGameMaster())
      throw new AgentToolError('not_allowed', "Scenario texts are the game master's, read on that seat only.");
  }

  private soundKind(identifier: string): 'bgm' | 'ambient' | 'sound_effects' {
    if (AudioTag.get(identifier)?.tag === 'SE') return 'sound_effects';
    return AudioTag.isBackgroundSound(identifier) ? 'ambient' : 'bgm';
  }
}

import { inject, Injectable } from '@angular/core';
import { CharacterMacroService } from '@axe/application/chat/character-macro.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { NamedCueService } from '@axe/application/media/named-cue.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { blockFootprintOf } from '@axe/application/tabletop/functional-paint.service';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { evaluateCharacterReferences } from '@axe/domain/chat/chat-palette';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { findByReference } from '@axe/domain/hotbar/hotbar-reference';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { BoardSwitch, spendSwitch, switchHasGoFor } from '@axe/domain/tabletop/board-switch/board-switch';
import {
  clampSwitchSpawn,
  SwitchAction,
  SwitchDefinition,
  SwitchSpawn,
  SwitchTableSetting,
  SwitchTargetRef,
} from '@axe/domain/tabletop/board-switch/switch-definition';
import { pressRefusal, SwitchReach, SwitchRefusal } from '@axe/domain/tabletop/board-switch/switch-press-rules';
import { cellsOfRect, stepsToReach } from '@axe/domain/tabletop/board-switch/switch-reach';
import { CellRect } from '@axe/domain/tabletop/cell-rectangles';
import { cellColRow, CellGrid, cellGridOf, cellIndexAt, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { groundInSight } from '@axe/domain/tabletop/ground-in-sight';
import { gatherSpotsAround } from '@axe/domain/tabletop/move/gather-cells';
import { occupiedCells } from '@axe/domain/tabletop/move/occupied-cells';
import { pieceCellOf } from '@axe/domain/tabletop/move/piece-on-grid';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TurnState } from '@axe/domain/tabletop/turn-state';

/** How long a switch stays down after a press, so a double click or an eager finger presses once. */
export const SWITCH_COOLDOWN_MS = 1500;

/** How a press turned out: done, turned away for a reason, or ignored as a switch still going. */
export type SwitchPressOutcome = 'pressed' | 'busy' | SwitchRefusal;

export interface SwitchPressOptions {
  /** The master trying the switch out, which neither counts as a press nor is held to its count. */
  trial?: boolean;
}

/** What the switch sits on, as far as pressing it needs to know. */
export interface SwitchHost {
  /** The name it speaks under where it speaks for itself. */
  name: string;
  /** The cells it stands over on the table being looked at, or null where it stands over none. */
  rect: CellRect | null;
}

interface PressContext {
  target: BoardSwitch;
  definition: SwitchDefinition;
  /** Whether the master is trying it out, which leaves the thing it sits on standing. */
  trial: boolean;
  /** Whether it has been asked to take away the thing it sits on once it is done. */
  removesSelf: boolean;
  host: SwitchHost;
  tab: ChatTab | null;
  /** The piece the presser is speaking as, or null where they speak as themselves. */
  character: GameCharacter | null;
}

/**
 * Presses switches on the table, on the seat of whoever pressed them.
 *
 * One seat has to carry a press out, or a room of five would say the line five times. It is the
 * seat that pressed, since that is the one that knows it happened, and what it says and plays
 * reaches the others the way anything said or played does.
 *
 * What a switch does is done in order, each thing after the wait written on it, and a line is
 * sent before the next thing starts so the room reads them in the order they were written. While
 * a switch is still going, and for a moment after it was pressed, pressing it again does nothing.
 * A switch that counts its presses writes the press down before doing anything, so a second seat
 * pressing it a moment later finds it already spent.
 */
@Injectable({ providedIn: 'root' })
export class SwitchPressService {
  private readonly macro = inject(CharacterMacroService);
  private readonly chat = inject(ChatMessageService);
  private readonly speaker = inject(ChatSpeakerService);
  private readonly cues = inject(NamedCueService);
  private readonly vision = inject(VisionService);
  private readonly tableSelecter = inject(TableSelecter);
  private readonly objectStore = inject(ObjectStore);
  private readonly triggers = inject(TableTriggerService);
  private readonly concealment = inject(ConcealmentService);
  private readonly fire = inject(TriggerFireService);
  private readonly images = inject(ImageStorage);
  private readonly audios = inject(AudioStorage);

  private readonly running = new Set<string>();
  private readonly pressedAt = new Map<string, number>();

  /** What the switch sits on: its name, and the cells it stands over on the table being looked at. */
  hostOf(target: BoardSwitch): SwitchHost {
    const host: ObjectNode | null = target.parent;
    const grid = this.grid();
    if (host instanceof Terrain) {
      const rect = grid ? (blockFootprintOf(host, host.width, host.depth, grid)?.rect ?? null) : null;
      return { name: host.name, rect };
    }
    if (host instanceof TableTrigger) return { name: host.name, rect: host.rect };
    return { name: '', rect: null };
  }

  /** Why this seat may not press the switch just now, or null where it may. */
  refusalFor(target: BoardSwitch, options: SwitchPressOptions = {}): SwitchRefusal | null {
    const definition = target.def;
    const character = this.speaker.current();
    const host = this.hostOf(target);
    return pressRefusal({
      definition,
      role: PeerCursor.myRole,
      tab: this.macro.currentTab(definition.tab),
      retired: target.retired,
      hasGo: switchHasGoFor(target, this.presserKey(character), this.round()),
      reach: definition.range > 0 ? this.reachOf(character, host, definition.range) : undefined,
      inSight: definition.needsSight ? this.sees(host) : undefined,
      trial: options.trial,
    });
  }

  /**
   * Presses the pressed ground under a point of the table, where there is any this seat is shown,
   * and answers how it went; null where there is none to press.
   *
   * Where two stretches overlap, the one laid last is pressed, which is the one drawn on top.
   * Ground that gives itself away is shown to the room by being pressed, as a trap is by going off.
   */
  async pressGroundAt(x: number, y: number): Promise<SwitchPressOutcome | null> {
    const grid = this.grid();
    if (!grid) return null;
    const cell = cellIndexAt(grid, x, y);
    if (cell < 0) return null;
    const { col, row } = cellColRow(grid, cell);
    const ground = this.triggers
      .shown()
      .filter((trigger) => trigger.pressSwitch && !trigger.pressSwitch.retired && trigger.covers(col, row))
      .pop();
    const held = ground?.pressSwitch;
    if (!ground || !held) return null;
    const outcome = await this.press(held);
    if (outcome === 'pressed' && ground.reveals && !ground.found) ground.found = true;
    return outcome;
  }

  /** Presses the switch, and answers once everything it does has been done or turned away. */
  async press(target: BoardSwitch, options: SwitchPressOptions = {}): Promise<SwitchPressOutcome> {
    const key = target.identifier;
    const now = Date.now();
    if (this.running.has(key)) return 'busy';
    if (now - (this.pressedAt.get(key) ?? -Infinity) < SWITCH_COOLDOWN_MS) return 'busy';
    const refusal = this.refusalFor(target, options);
    if (refusal) return refusal;

    this.running.add(key);
    this.pressedAt.set(key, now);
    const definition = target.def;
    const character = this.speaker.current();
    if (!options.trial) spendSwitch(target, this.presserKey(character), this.round());
    const context: PressContext = {
      target,
      definition,
      trial: options.trial === true,
      removesSelf: false,
      host: this.hostOf(target),
      tab: this.macro.currentTab(definition.tab),
      character,
    };
    try {
      for (const [order, action] of definition.actions.entries()) {
        if (order > 0 && action.delayMs > 0) await wait(action.delayMs);
        try {
          await this.run(action, context);
        } catch {
          // One thing going wrong is no reason to leave the rest of the switch undone.
        }
      }
      if (context.removesSelf && !context.trial) this.removeHost(target);
    } finally {
      this.running.delete(key);
    }
    return 'pressed';
  }

  /**
   * Takes away the thing the switch sits on, last of all.
   *
   * A block goes from the table, switch and all. Painted ground belongs to the master's map, so it
   * is put away instead, out of sight of all but the master, where the map editor can find it again.
   */
  private removeHost(target: BoardSwitch): void {
    const host = target.parent;
    if (host instanceof Terrain) host.destroy();
    else target.retired = true;
  }

  private async run(action: SwitchAction, context: PressContext): Promise<void> {
    switch (action.kind) {
      case 'say':
        await this.say(action.text, context);
        return;
      case 'secret':
        this.keepBack(action.text, action.to, context);
        return;
      case 'sound':
        this.cues.playSound(action.name);
        return;
      case 'effect':
        this.cues.playEffect(action.name, context.character ? [context.character] : []);
        return;
      case 'cutIn':
        this.cues.launchCutIn(action.name);
        return;
      case 'reveal': {
        const found = this.concealment.find(action.target, this.concealment.concealed());
        if (found) this.concealment.reveal(found);
        return;
      }
      case 'conceal': {
        const found = this.concealment.find(action.target, this.concealment.concealable());
        if (found) this.concealment.conceal(found);
        return;
      }
      case 'removeSelf':
        context.removesSelf = true;
        return;
      case 'spawn':
        this.spawn(action, context);
        return;
      case 'showTable': {
        const table = this.tableNamed(action.table);
        if (table) emitSelectGameTable({ identifier: table.identifier });
        return;
      }
      case 'carry': {
        const piece = context.character;
        if (!piece || piece.location.name !== 'table') return;
        const named = action.table.identifier.length > 0 || action.table.name.trim().length > 0;
        this.fire.carryTo(
          piece,
          action.col,
          action.row,
          named ? this.tableNamed(action.table) : this.tableSelecter.viewTable
        );
        return;
      }
      case 'tableSetting':
        this.changeTable(action);
        return;
      case 'unknown':
        return;
    }
  }

  private async say(text: string, context: PressContext): Promise<void> {
    const line = text.trim();
    if (line.length < 1 || !context.tab) return;
    const { definition, character, tab } = context;
    const options = { tab, gameType: definition.gameType || undefined };
    switch (definition.speaker) {
      case 'presser':
        if (character) await this.macro.sendAsCharacter(character, line, options);
        else await this.macro.sendAsSelf(line, options);
        return;
      case 'host':
        await this.macro.sendAsNamed(this.hostName(context), line, character, options);
        return;
      case 'system':
        this.chat.sendSystemMessageToTab(tab, line);
        return;
    }
  }

  /** The table a switch names, by where it was chosen, else by its name. */
  private tableNamed(ref: SwitchTargetRef): GameTable | null {
    const tables = this.objectStore.getObjects<GameTable>(GameTable);
    return findByReference(tables, ref.identifier, ref.name.trim())?.thing ?? null;
  }

  /**
   * Changes the table being looked at: its darkness and fog, the picture laid on it, and the music.
   *
   * The music is stopped before anything is put on, so a switch can end one piece and start another.
   * A picture or a track named by something the room no longer has is left as it was.
   */
  private changeTable(action: SwitchTableSetting): void {
    const table = this.tableSelecter.viewTable;
    if (table && action.darkness !== 'keep') table.darknessEnabled = action.darkness === 'on';
    if (table && action.fog !== 'keep') table.fogEnabled = action.fog === 'on';
    const image = this.fileNamed(action.image, this.images.images, (identifier) => this.images.get(identifier));
    if (table && image) table.imageIdentifier = image.identifier;
    const jukebox = this.objectStore.get<Jukebox>('Jukebox');
    if (!jukebox) return;
    if (action.bgmStop) jukebox.stop();
    const track = this.fileNamed(action.bgm, this.audios.audios, (identifier) => this.audios.get(identifier));
    if (track) jukebox.play(track.identifier, true);
  }

  private fileNamed<T extends { identifier: string; name: string }>(
    ref: SwitchTargetRef,
    all: readonly T[],
    byIdentifier: (identifier: string) => T | null
  ): T | null {
    if (ref.identifier.length > 0) {
      const held = byIdentifier(ref.identifier);
      if (held) return held;
    }
    const name = ref.name.trim();
    if (name.length < 1) return null;
    const named = all.filter((file) => file.name.trim() === name);
    return named.length === 1 ? named[0] : null;
  }

  /**
   * Sets down copies of a piece round the switch, or round the presser's piece, nearest first.
   *
   * Ground something is already standing on is passed over, and a copy that finds no room within
   * reach is not made at all rather than piled onto somebody. The piece copied stays where it is.
   *
   * Each copy is stood on the table as soon as it is made. A copy starts wherever the template is,
   * which is usually the graveyard, and the numbering a copy is named by passes over the graveyard,
   * so copies left there until all were made would every one of them take the same number.
   */
  private spawn(action: SwitchSpawn, context: PressContext): void {
    const grid = this.grid();
    const table = this.tableSelecter.viewTable;
    const characters = this.objectStore.getObjects<GameCharacter>(GameCharacter);
    const template = findByReference(characters, action.target.identifier, action.target.name.trim())?.thing;
    if (!grid || !table || !template) return;
    const start = this.spawnStart(grid, action, context);
    if (start < 0) return;
    const copies = Array.from({ length: clampSwitchSpawn(action.count) }, () => {
      const copy = template.clone();
      copy.location = { name: 'table', x: copy.location.x, y: copy.location.y };
      return copy;
    });
    const spots = gatherSpotsAround(grid, grid.sizePx, start, copies, occupiedCells(grid, characters, ''));
    const placed = new Set<GameCharacter>();
    for (const spot of spots) {
      spot.character.location = { name: 'table', x: spot.x, y: spot.y };
      placed.add(spot.character);
    }
    for (const copy of copies) if (!placed.has(copy)) copy.destroy();
  }

  /** The cell copies gather round: the middle of what the switch sits on, or the presser's piece. */
  private spawnStart(grid: CellGrid, action: SwitchSpawn, context: PressContext): number {
    const piece = context.character;
    if (action.place === 'presser' && piece && piece.location.name === 'table') {
      const cell = pieceCellOf(grid, piece, grid.sizePx);
      if (cell >= 0) return cell;
    }
    const rect = context.host.rect;
    if (!rect) return -1;
    return cellIndexOf(grid, rect.col + Math.floor(rect.width / 2), rect.row + Math.floor(rect.height / 2));
  }

  /**
   * Writes a line the room sees only as kept back.
   *
   * Sent from the presser, it is the presser's to read and the master's; sent from nobody in
   * particular, it is the master's alone, which is how painted ground keeps its quiet lines.
   */
  private keepBack(text: string, to: 'presser' | 'master', context: PressContext): void {
    const line = text.trim();
    if (line.length < 1 || !context.tab) return;
    const filled = context.character ? evaluateCharacterReferences(line, context.character).text : line;
    const from = to === 'presser' ? Network.peerContext.userId : undefined;
    this.chat.sendSecretSystemMessageToTab(context.tab, filled, from);
  }

  private hostName(context: PressContext): string {
    return context.host.name.trim() || context.definition.label.trim();
  }

  /** Who a press is counted against: the piece pressing it, else the person. */
  private presserKey(character: GameCharacter | null): string {
    return character?.identifier ?? PeerCursor.myCursor?.userId ?? '';
  }

  private reachOf(character: GameCharacter | null, host: SwitchHost, range: number): SwitchReach {
    const grid = this.grid();
    if (!character || character.location.name !== 'table' || !grid || !host.rect) return 'noPiece';
    const from = pieceCellOf(grid, character, grid.sizePx);
    if (from < 0) return 'noPiece';
    return stepsToReach(grid, from, cellsOfRect(grid, host.rect), range) === null ? 'tooFar' : 'near';
  }

  private sees(host: SwitchHost): boolean {
    const grid = this.grid();
    if (!grid || !host.rect) return true;
    return groundInSight(grid, host.rect, this.vision.overlayVision()?.visible ?? null);
  }

  private grid(): CellGrid | null {
    const table = this.tableSelecter.viewTable;
    if (!table || table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  }

  private round(): number {
    const held = this.objectStore.get<TurnState>('TurnState');
    return held instanceof TurnState ? held.round : -1;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

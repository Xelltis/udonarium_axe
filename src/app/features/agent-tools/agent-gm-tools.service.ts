import { inject, Injectable } from '@angular/core';
import type { AgentHandler } from '@axe/application/agent/agent-tool-runner.service';
import { AgentViews } from '@axe/application/agent/agent-views.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ScenarioTextService } from '@axe/application/chat/scenario-text.service';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectLibraryService } from '@axe/application/effect/effect-library.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { TableBgmService } from '@axe/application/media/table-bgm.service';
import { BoardSceneLoader } from '@axe/application/tabletop/board-scene-loader';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { AgentToolError } from '@axe/core/agent/agent-error';
import { emitSelectGameTable } from '@axe/core/event/domain-events';
import type { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BackgroundSound } from '@axe/domain/media/background-sound';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { SoundEffect } from '@axe/domain/media/sound-effect';
import { ScenarioText } from '@axe/domain/scenario-text/scenario-text';
import { BoardScene } from '@axe/domain/scene/board-scene';
import { cellCenterOf } from '@axe/domain/tabletop/fog/cell-grid';
import type { RangeArea } from '@axe/domain/tabletop/range';
import { asSolidKind, solidFitsShape } from '@axe/domain/tabletop/solid/solid-kind';
import { findOne, numberArg, textArg } from '@axe/features/agent-tools/agent-lookup';
import { AgentReadTools } from '@axe/features/agent-tools/agent-read-tools.service';
import { JukeboxPlaybackService } from '@axe/features/media/jukebox-playback.service';

/** The shapes of a range as the AI names them, by the names the table knows them by. */
const SHAPES: Readonly<Record<string, string>> = {
  circle: 'CIRCLE',
  square: 'SQUARE',
  rhombus: 'RHOMBUS',
  triangle: 'TRIANGLE',
  pentagon: 'PENTAGON',
  hexagon: 'HEXAGON',
  line: 'LINE',
  cone: 'CORN',
};

/**
 * The game master's tools, as the linked seat: effects, sounds, cut-ins, tables, scenes, scenario
 * texts and ranges, each as the master's own hand starts them, for the whole room. The tool layer
 * lets only the master's seat call them.
 */
@Injectable({ providedIn: 'root' })
export class AgentGmTools {
  private readonly read = inject(AgentReadTools);
  private readonly views = inject(AgentViews);
  private readonly effects = inject(EffectLibraryService);
  private readonly casts = inject(EffectCastService);
  private readonly jukebox = inject(JukeboxPlaybackService);
  private readonly audioStorage = inject(AudioStorage);
  private readonly cutIns = inject(CutInService);
  private readonly tableBgm = inject(TableBgmService);
  private readonly scenes = inject(BoardSceneLoader);
  private readonly scenarioTexts = inject(ScenarioTextService);
  private readonly tabletop = inject(TabletopService);
  private readonly actions = inject(TabletopActionService);
  private readonly ground = inject(StandingGroundService);
  private readonly objectStore = inject(ObjectStore);
  private readonly chat = inject(ChatMessageService);

  readonly handlers: Readonly<Record<string, AgentHandler>> = {
    fire_effect: (args) => this.fireEffect(args),
    play_sound: (args) => this.playSound(textArg(args, 'kind'), textArg(args, 'sound')),
    stop_sound: (args) => this.stopSound(textArg(args, 'kind'), textArg(args, 'sound')),
    play_cut_in: (args) => {
      const cutIn = this.cutIn(textArg(args, 'cut_in'));
      if (!this.cutIns.launch(cutIn)) throw new AgentToolError('failed', `${cutIn.name} could not be shown.`);
      return { shown: cutIn.name };
    },
    stop_cut_in: (args) => this.stopCutIn(textArg(args, 'cut_in')),
    switch_table: (args) => this.switchTable(textArg(args, 'table')),
    apply_scene: (args) => this.applyScene(textArg(args, 'scene')),
    send_scenario_text: (args) => {
      const text = findOne(
        ScenarioText.all(),
        textArg(args, 'text'),
        (each) => each.identifier,
        (each) => each.title,
        'scenario text'
      );
      const named = textArg(args, 'tab');
      const to = named ? { tab: this.read.tab(named).identifier } : {};
      const sent = this.chat.asAiWords(() => this.scenarioTexts.send(text, to));
      if (!sent) throw new AgentToolError('failed', `${text.title} could not be sent.`);
      return { sent: text.title };
    },
    place_range: (args) => this.placeRange(args),
    remove_range: (args) => {
      const range = this.range(textArg(args, 'range'));
      const name = range.name;
      range.destroy();
      return { removed: { id: range.identifier, name } };
    },
  };

  private fireEffect(args: Readonly<Record<string, unknown>>): unknown {
    const preset = findOne(
      this.effects.shownPresets(),
      textArg(args, 'effect'),
      (each) => each.identifier,
      (each) => each.name,
      'effect'
    );
    const caster = textArg(args, 'caster') ? this.read.piece(textArg(args, 'caster')) : null;
    const named = ((args['targets'] as string[] | undefined) ?? []).map((reference) => this.read.piece(reference));
    // As many as the effect takes, as a hand casting it is held to.
    const targets = named.slice(0, Math.max(1, preset.targetLimit));
    const at = args['at'] as { col: number; row: number } | undefined;
    if (targets.length > 0) {
      if (!this.casts.fire(preset, targets, caster)) {
        throw new AgentToolError('failed', `${preset.name} could not be fired.`);
      }
      const left = named.slice(targets.length).map((piece) => this.views.nameOf(piece));
      return {
        fired: preset.name,
        at: targets.map((piece) => this.views.nameOf(piece)),
        ...(left.length > 0 ? { not_hit: left, note: `${preset.name} takes ${targets.length} targets at most.` } : {}),
      };
    }
    if (at) {
      const cell = this.views.cellOf(at);
      if (cell < 0) throw new AgentToolError('invalid_input', `Square ${at.col}, ${at.row} is off the table.`);
      const centre = cellCenterOf(this.views.grid(), cell);
      this.casts.fireAt(preset, { x: centre.x, y: centre.y, z: this.ground.heightPxAt(centre.x, centre.y) }, caster);
      return { fired: preset.name, at };
    }
    if (caster) {
      if (!this.casts.fireFromCharacter(preset, caster))
        throw new AgentToolError('failed', `${preset.name} could not be fired.`);
      return { fired: preset.name, from: this.views.nameOf(caster) };
    }
    throw new AgentToolError('invalid_input', 'Give targets, a square to fire at, or a caster to fire from.');
  }

  private sound(reference: string): AudioFile {
    return findOne(
      this.audioStorage.audios,
      reference,
      (audio) => audio.identifier,
      (audio) => audio.name,
      'sound'
    );
  }

  private playSound(kind: string, reference: string): unknown {
    const audio = this.sound(reference);
    switch (kind) {
      case 'bgm':
        this.jukebox.play(audio);
        break;
      case 'ambient':
        BackgroundSound.keepPlaying(audio.identifier);
        break;
      case 'sound_effect':
        SoundEffect.play(audio);
        break;
      default:
        throw new AgentToolError('invalid_input', `There is no kind of sound called ${kind}.`);
    }
    return { playing: audio.name, kind };
  }

  private stopSound(kind: string, reference: string): unknown {
    if (kind === 'bgm' || kind === 'all') this.jukebox.stop();
    if (kind === 'ambient' && reference) BackgroundSound.of(this.sound(reference).identifier)?.stop();
    else if (kind === 'ambient' || kind === 'all') BackgroundSound.stopAll();
    return { stopped: kind };
  }

  private cutIn(reference: string): CutIn {
    return findOne(
      this.objectStore.getObjects<CutIn>(CutIn),
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'cut-in'
    );
  }

  private stopCutIn(reference: string): unknown {
    const launcher = this.objectStore.get<CutInLauncher>('CutInLauncher');
    if (!(launcher instanceof CutInLauncher)) throw new AgentToolError('failed', 'The room has no cut-in launcher.');
    const stopping = reference ? [this.cutIn(reference)] : this.objectStore.getObjects<CutIn>(CutIn);
    for (const cutIn of stopping) launcher.stopCutIn(cutIn);
    return { stopped: stopping.map((cutIn) => cutIn.name) };
  }

  private switchTable(reference: string): unknown {
    const table = findOne(
      this.views.tables(),
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'table'
    );
    const was = this.tabletop.currentTable.identifier;
    emitSelectGameTable({ identifier: table.identifier });
    if (table.identifier !== was) {
      this.cutIns.launchForTable(table);
      this.tableBgm.playFor(table);
    }
    return { table: { id: table.identifier, name: table.name } };
  }

  private async applyScene(reference: string): Promise<unknown> {
    const scene = findOne(
      BoardScene.all(),
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'scene'
    );
    const service = await this.scenes.load();
    if (!service) throw new AgentToolError('failed', 'Scenes could not be loaded.');
    if (!service.apply(scene)) throw new AgentToolError('failed', `${scene.name} could not be set.`);
    return { scene: scene.name };
  }

  private range(reference: string): RangeArea {
    return findOne(
      this.tabletop.ranges,
      reference,
      (each) => each.identifier,
      (each) => each.name,
      'range'
    );
  }

  private placeRange(args: Readonly<Record<string, unknown>>): unknown {
    const shape = SHAPES[textArg(args, 'shape')];
    if (!shape) throw new AgentToolError('invalid_input', `There is no shape called ${textArg(args, 'shape')}.`);
    const solidName = textArg(args, 'solid', 'flat');
    const solid = solidName === 'flat' ? '' : asSolidKind(solidName);
    if (solid && !solidFitsShape(solid, shape)) {
      throw new AgentToolError('invalid_input', `A ${textArg(args, 'shape')} cannot stand up as a ${solidName}.`);
    }
    const followed = textArg(args, 'follow') ? this.read.piece(textArg(args, 'follow')) : null;
    const at = args['at'] as { col: number; row: number } | undefined;
    if (!followed && !at)
      throw new AgentToolError('invalid_input', 'Give a square to place the range at, or a piece to follow.');
    let point = { x: 0, y: 0, z: 0 };
    if (at) {
      const cell = this.views.cellOf(at);
      if (cell < 0) throw new AgentToolError('invalid_input', `Square ${at.col}, ${at.row} is off the table.`);
      const centre = cellCenterOf(this.views.grid(), cell);
      point = { x: centre.x, y: centre.y, z: this.ground.heightPxAt(centre.x, centre.y) };
    }
    const range = solid
      ? this.actions.createSolidRangeArea(point, shape, solid)
      : this.actions.createRangeArea(point, shape);
    const name = textArg(args, 'name').trim();
    if (name) range.name = name;
    range.length = numberArg(args, 'length', range.length);
    if (typeof args['width'] === 'number') range.width = args['width'];
    if (typeof args['height'] === 'number') range.columnHeight = args['height'];
    if (typeof args['facing'] === 'number') range.rotate = args['facing'] - 90;
    if (typeof args['pitch'] === 'number') range.aimPitch = args['pitch'];
    const colour = textArg(args, 'colour').trim();
    if (colour) {
      range.rangeColor = colour;
      range.gridColor = colour;
    }
    if (followed) {
      range.followingCharacterIdentifier = followed.identifier;
      range.following(this.tabletop.gridSize());
    }
    range.update();
    return { id: range.identifier, name: range.name, shape: textArg(args, 'shape'), solid: solid || 'flat' };
  }
}

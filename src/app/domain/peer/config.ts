import { VolumeType } from '@axe/core/storage/audio-output';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BattleSettings, readBattleSettings, writeBattleSettings } from '@axe/domain/battle/battle-settings';
import {
  ControllerResourcePick,
  readControllerResourcePick,
  writeControllerResourcePick,
} from '@axe/domain/character/controller-resource-pick';
import { readStampRules, StampRules, writeStampRules } from '@axe/domain/chat/stamp-rules';
import { readSystemNotices, SystemNoticeRoutes, writeSystemNotices } from '@axe/domain/chat/system-notices';
import { asDiceStage, DiceStage } from '@axe/domain/dice/dice-3d/dice-stage';
import { readFolderPaths, writeFolderPaths } from '@axe/domain/folder/folder-path';
import {
  type GameClock,
  type PeriodSkies,
  readGameClock,
  readPeriodSkies,
  writeGameClock,
  writePeriodSkies,
} from '@axe/domain/game-clock/game-clock';
import { type DjPads, readDjPads, writeDjPads } from '@axe/domain/media/dj-pads';
import { type DjSettings, readDjSettings, writeDjSettings } from '@axe/domain/media/dj-settings';
import {
  readRoomVolumes,
  RoomVolumeKind,
  roomVolumeKindOf,
  RoomVolumes,
  writeRoomVolumes,
} from '@axe/domain/media/room-volumes';
import { CONFIG_RULE_ANSWERS, withRuleAnswers, zoneRuleAnswersOf } from '@axe/domain/peer/config-rule-answers';
import { allowsDiagonal, asDiagonalMove, DiagonalMove } from '@axe/domain/tabletop/move/diagonal-move';
import {
  readRuleFlag,
  readRuleText,
  ROOM_RULE_DEFAULTS,
  RoomRuleAnswers,
  writeRuleFlag,
  writeRuleText,
} from '@axe/domain/tabletop/room-rules';
import {
  asFactionPhaseMode,
  asTurnOrderMode,
  FactionPhaseMode,
  TurnOrderMode,
} from '@axe/domain/tabletop/turn-order-mode';
import { ZoneRuleAnswers } from '@axe/domain/tabletop/zone/zone-rules';

/**
 * The room's shared settings and the rules of play it answers for itself, synced to every peer and
 * saved with the room as `config.xml`.
 *
 * The rules answered in the uniform way (yes or no, a number, a word, each null until answered) get
 * their properties from {@link CONFIG_RULE_ANSWERS}; the attributes that hold them are declared here
 * with the rest, under the names saved rooms and older peers know them by.
 */
@SyncObject('config')
export class Config extends withRuleAnswers() implements InnerXml {
  @SyncVar('_defaultDiceBot') private _defaultDiceBot: string = 'DiceBot';
  @SyncVar('_roomVolume') private _roomVolume: number = 1.0;
  @SyncVar('_roomKindVolumes') private _roomKindVolumes: string = '';
  @SyncVar('_djSettings') private _djSettings!: string;
  @SyncVar('_djPads') private _djPads!: string;
  @SyncVar('_systemAvatarIdentifier') private _systemAvatarIdentifier: string = '';
  @SyncVar('_systemDiceAvatarIdentifier') private _systemDiceAvatarIdentifier: string = '';
  @SyncVar('_hideSystemAvatar') private _hideSystemAvatar: string = '';
  @SyncVar('_showSpeakerAvatar') private _showSpeakerAvatar: string = '';
  @SyncVar('_controllerResources') private _controllerResources: string = '';
  @SyncVar('_stampRules') private _stampRules: string = '';
  @SyncVar('_systemNotices') private _systemNotices: string = '';
  @SyncVar('_speechBubbles') private _speechBubbles: string = '';
  @SyncVar('_battleCutIn') private _battleCutIn: string = '';
  @SyncVar('_gameClock') private _gameClock: string = '';
  @SyncVar('_gameClockSkies') private _gameClockSkies: string = '';
  @SyncVar('_boardScene') private _boardScene: string = '';
  @SyncVar('_boardSceneFolders') private _boardSceneFolders: string = '';
  @SyncVar('_scenarioTextFolders') private _scenarioTextFolders: string = '';
  @SyncVar('_turnSignal') private _turnSignal: string = '';
  @SyncVar('_turnTick') private _turnTick: string = '';
  @SyncVar('_resourceSliderDefault') private _resourceSliderDefault: string = '';

  // How the round is taken, which is the room's own decision rather than a table's.
  @SyncVar('_turnOrderMode') private _turnOrderMode: string = '';
  @SyncVar('_factionPhaseMode') private _factionPhaseMode: string = '';
  @SyncVar('_factionOrder') private _factionOrder: string = '';
  @SyncVar('_factionSkipUnassigned') private _factionSkipUnassigned: string = '';
  @SyncVar('_moveStrict') private _moveStrict: string = '';
  @SyncVar('_moveStrictPath') private _moveStrictPath: string = '';

  // The rules of play the room answers for itself. Each one is left unanswered until the
  // room settings are asked, and whatever is unanswered stays with the table that is out.
  // Those not private are read and written through the properties CONFIG_RULE_ANSWERS gives.
  @SyncVar('_moveRangeEnabled') protected _moveRangeEnabled: string = '';
  @SyncVar('_moveRangeElementNames') protected _moveRangeElementNames: string = '';
  @SyncVar('_moveDiagonally') private _moveDiagonally: string = '';
  @SyncVar('_diagonalMove') private _diagonalMove: string = '';
  @SyncVar('_piecesShareCells') protected _piecesShareCells: string = '';
  @SyncVar('_samePartyPassage') protected _samePartyPassage: string = '';
  @SyncVar('_otherPartyPassage') protected _otherPartyPassage: string = '';
  @SyncVar('_noPartyPassage') protected _noPartyPassage: string = '';
  @SyncVar('_piecePassageCost') protected _piecePassageCost: number = -1;
  @SyncVar('_sizeSlipsPast') protected _sizeSlipsPast: string = '';
  @SyncVar('_squeezes') protected _squeezes: string = '';
  @SyncVar('_jumpCells') protected _jumpCells: number = -1;
  @SyncVar('_handTracesWay') protected _handTracesWay: string = '';
  @SyncVar('_moveRangeAlways') protected _moveRangeAlways: string = '';
  @SyncVar('_zocAlways') protected _zocAlways: string = '';
  @SyncVar('_cellDistance') protected _cellDistance: number = -1;
  @SyncVar('_cellDistanceUnit') protected _cellDistanceUnit: string = '';
  @SyncVar('_zocMode') protected _zocMode: string = '';
  @SyncVar('_hostilityBy') protected _hostilityBy: string = '';
  @SyncVar('_zocRange') protected _zocRange: number = -1;
  @SyncVar('_zocExtraCost') protected _zocExtraCost: number = -1;
  @SyncVar('_zocEngages') protected _zocEngages: string = '';
  @SyncVar('_breakOutMode') protected _breakOutMode: string = '';
  @SyncVar('_breakOutCost') protected _breakOutCost: number = -1;
  @SyncVar('_engagementCountsSize') protected _engagementCountsSize: string = '';
  @SyncVar('_facingMark') protected _facingMark: string = '';
  @SyncVar('_pieceImageInCell') protected _pieceImageInCell: string = '';
  @SyncVar('_diceStage') private _diceStage: string = '';

  // How the room plays engagement zones, which is the room's own decision rather than a table's.
  @SyncVar('_zoneEnabled') protected _zoneEnabled: string = '';
  @SyncVar('_zoneSizes') protected _zoneSizes: string = '';
  @SyncVar('_zoneCountField') protected _zoneCountField: string = '';
  @SyncVar('_zoneSamePoint') protected _zoneSamePoint: number = -1;
  @SyncVar('_zoneOutnumber') protected _zoneOutnumber: number = -1;
  @SyncVar('_zoneLeaveKind') protected _zoneLeaveKind: string = '';
  @SyncVar('_moveKinds') protected _moveKinds: string = '';
  @SyncVar('_pathMove') private _pathMove: string = '';
  @SyncVar('_interruptEnabled') private _interruptEnabled: string = '';
  @SyncVar('_interruptKind') protected _interruptKind: string = '';
  @SyncVar('_zoneBlockRadius') protected _zoneBlockRadius: number = -1;
  @SyncVar('_zoneClearName') protected _zoneClearName: string = '';
  @SyncVar('_zoneStealthUnseen') protected _zoneStealthUnseen: string = '';
  @SyncVar('_placementDistances') protected _placementDistances: string = '';
  @SyncVar('_distanceModifiers') protected _distanceModifiers: string = '';

  // How the room plays pieces riding mounts.
  @SyncVar('_rideSkillField') protected _rideSkillField: string = '';
  @SyncVar('_rideRequireField') protected _rideRequireField: string = '';
  @SyncVar('_fallMinM') protected _fallMinM: number = -1;
  @SyncVar('_fallDamage') protected _fallDamage: string = '';
  @SyncVar('_twoUpBuff') protected _twoUpBuff: string = '';

  /**
   * Where the room shows the dice of a chat roll tumbling: in the frame of the line that gives the
   * result, on the table, or nowhere.
   *
   * Nowhere unless the room chose otherwise, so a room saved before the setting was there, or sent
   * by an older version that knows nothing of it, stays as it was.
   */
  get diceStage(): DiceStage {
    return asDiceStage(this._diceStage);
  }
  set diceStage(stage: DiceStage) {
    this._diceStage = stage === 'off' ? '' : stage;
  }

  /** The game system the room rolls dice with by default; blank reads as the generic `DiceBot`. */
  get defaultDiceBot(): string {
    if (this._defaultDiceBot == '') {
      return 'DiceBot';
    }
    return this._defaultDiceBot;
  }
  set defaultDiceBot(dice: string) {
    this._defaultDiceBot = dice;
  }

  /**
   * The items the remote controllers in this room show, or null to show every one.
   *
   * @see ControllerResourcePick
   */
  get controllerResources(): ControllerResourcePick {
    return readControllerResourcePick(this._controllerResources);
  }
  set controllerResources(pick: ControllerResourcePick) {
    this._controllerResources = writeControllerResourcePick(pick);
  }

  /**
   * What the room lets its stamps be used for, with every stamp usable for everything until the room
   * says otherwise.
   *
   * @see StampRules
   */
  get stampRules(): StampRules {
    return readStampRules(this._stampRules);
  }
  set stampRules(rules: StampRules) {
    this._stampRules = writeStampRules(rules);
  }

  /**
   * Where the room sends each kind of notice the system writes into its chat, with every kind going
   * where it always went until the room chooses otherwise.
   *
   * @see SystemNoticeRoutes
   */
  get systemNotices(): SystemNoticeRoutes {
    return readSystemNotices(this._systemNotices);
  }
  set systemNotices(routes: SystemNoticeRoutes) {
    this._systemNotices = writeSystemNotices(routes);
  }

  /**
   * What the room says about its battle stage: the picture behind it and how a fighter goes down,
   * each at its default until the room chooses otherwise.
   *
   * @see BattleSettings
   */
  get battleSettings(): BattleSettings {
    return readBattleSettings(this._battleCutIn);
  }
  set battleSettings(settings: BattleSettings) {
    this._battleCutIn = writeBattleSettings(settings);
  }

  /**
   * The pictures the room keeps to fight on, which have to travel with it when it is saved.
   *
   * They are named inside the packed battle settings rather than by an attribute of their own, so
   * nothing walking the settings' XML would find them, and a room saved without them would come
   * back with a stage that has lost its picture.
   */
  get carriedImageIdentifiers(): readonly string[] {
    return this.battleSettings.pictures;
  }

  /**
   * The time the room keeps in its story: the day and the hour of it, as the game master moves it.
   * A room that never set one reads as the morning of the first day.
   *
   * @see GameClock
   */
  get gameClock(): GameClock {
    return readGameClock(this._gameClock);
  }
  set gameClock(clock: GameClock) {
    this._gameClock = writeGameClock(clock);
  }

  /**
   * The hour the sky of each of the clock's parts of the day is drawn at, as the game master chose
   * it. A room that chose none draws them laid evenly over the day.
   *
   * @see PeriodSkies
   */
  get gameClockSkies(): PeriodSkies {
    return readPeriodSkies(this._gameClockSkies);
  }
  set gameClockSkies(skies: PeriodSkies) {
    this._gameClockSkies = writePeriodSkies(skies);
  }

  /** The scene last put on, by identifier; empty before any has been. */
  get boardScene(): string {
    return `${this._boardScene ?? ''}`;
  }
  set boardScene(identifier: string) {
    this._boardScene = identifier;
  }

  /** The folders the game master made for scenes, kept even while nothing is filed in them. */
  get boardSceneFolders(): readonly string[] {
    return readFolderPaths(this._boardSceneFolders);
  }
  set boardSceneFolders(paths: readonly string[]) {
    this._boardSceneFolders = writeFolderPaths(paths);
  }

  /** The folders the game master made for scenario texts, kept even while nothing is filed in them. */
  get scenarioTextFolders(): readonly string[] {
    return readFolderPaths(this._scenarioTextFolders);
  }
  set scenarioTextFolders(paths: readonly string[]) {
    this._scenarioTextFolders = writeFolderPaths(paths);
  }

  /** The room's master volume, shared by every peer; a change applied to the config updates the jukebox at once. */
  get roomVolume(): number {
    return this._roomVolume;
  }
  set roomVolume(volume: number) {
    this._roomVolume = volume;
  }

  /**
   * The room's own volume for each kind of sound, shared by every peer, on top of the master
   * {@link roomVolume}.
   *
   * Full for every kind until the room turns one down, so a room saved before these were there, or
   * sent by an older version that knows nothing of them, sounds as it did.
   */
  get roomVolumes(): RoomVolumes {
    return readRoomVolumes(this._roomKindVolumes);
  }
  set roomVolumes(volumes: RoomVolumes) {
    this._roomKindVolumes = writeRoomVolumes(volumes);
  }

  /** Sets the room's volume for one kind of sound, leaving the other kinds as they are. */
  setRoomVolumeOf(kind: RoomVolumeKind, volume: number): void {
    this.roomVolumes = { ...this.roomVolumes, [kind]: volume };
  }

  /**
   * How the room mixes its music: whether sounds are levelled, whether the music goes down under
   * effects, how long tracks fade into each other, whether changes wait for the beat, and whether
   * the screen glows with it.
   *
   * The defaults until the game master changes one, so a room saved before these were there, or
   * sent by an older version that knows nothing of them, mixes as a new room does.
   */
  get djSettings(): DjSettings {
    return readDjSettings(this._djSettings);
  }
  set djSettings(settings: DjSettings) {
    this._djSettings = writeDjSettings(settings);
  }

  /**
   * The sounds on the DJ deck's pads, which the game master sets for the room and anyone who may
   * change what the room plays sets off. Every pad is empty in a room saved before there were pads.
   */
  get djPads(): DjPads {
    return readDjPads(this._djPads);
  }
  set djPads(pads: DjPads) {
    this._djPads = writeDjPads(pads);
  }

  /**
   * What the sound on one channel is scaled by in this room: the master room volume times the
   * room's volume for that channel's kind. Previews take the master room volume alone.
   */
  roomScaleFor(type: VolumeType): number {
    const kind = roomVolumeKindOf(type);
    return this.roomVolume * (kind ? this.roomVolumes[kind] : 1);
  }

  /**
   * The image the room chose for system notices in chat.
   *
   * Empty uses the bundled picture; the empty image's own identifier means no picture at all.
   */
  get systemAvatarIdentifier(): string {
    return this._systemAvatarIdentifier;
  }
  set systemAvatarIdentifier(identifier: string) {
    this._systemAvatarIdentifier = identifier;
  }

  /** The image the room chose for dice results in chat, read the same way as {@link systemAvatarIdentifier}. */
  get systemDiceAvatarIdentifier(): string {
    return this._systemDiceAvatarIdentifier;
  }
  set systemDiceAvatarIdentifier(identifier: string) {
    this._systemDiceAvatarIdentifier = identifier;
  }

  /** Whether the system's portrait is shown beside notices in chat; on unless the room turned it off. */
  get isSystemAvatarVisible(): boolean {
    return this._hideSystemAvatar !== '1';
  }
  set isSystemAvatarVisible(visible: boolean) {
    this._hideSystemAvatar = visible ? '' : '1';
  }

  /**
   * Whether what a character says shows in a bubble over its piece; on unless the room turned it
   * off, which is the one value that does.
   */
  get speechBubblesEnabled(): boolean {
    return this._speechBubbles !== 'off';
  }
  set speechBubblesEnabled(enabled: boolean) {
    this._speechBubbles = enabled ? '' : 'off';
  }

  /**
   * Whether the owner of a character hears a signal when its turn begins; on unless the room turned
   * it off, which is the one value that does.
   */
  get turnSignalEnabled(): boolean {
    return this._turnSignal !== 'off';
  }
  set turnSignalEnabled(enabled: boolean) {
    this._turnSignal = enabled ? '' : 'off';
  }

  /**
   * Whether everyone else hears a tick when a turn begins that is not theirs; off unless the room
   * turned it on, which is the one value that does.
   */
  get turnTickEnabled(): boolean {
    return this._turnTick === 'on';
  }
  set turnTickEnabled(enabled: boolean) {
    this._turnTick = enabled ? 'on' : '';
  }

  /**
   * Whether system notices and dice results show the portrait of whoever caused them instead of the system's.
   *
   * Off unless the room turns it on. A notice with no speaker portrait falls back to the system's picture.
   */
  get isSpeakerAvatarVisible(): boolean {
    return this._showSpeakerAvatar === '1';
  }
  set isSpeakerAvatarVisible(visible: boolean) {
    this._showSpeakerAvatar = visible ? '1' : '';
  }

  /**
   * Whether a number resource that says nothing of its own slider shows one.
   *
   * Off unless the room turns it on. A resource that says yes or no of its own keeps to it.
   */
  get resourceSliderByDefault(): boolean {
    return this._resourceSliderDefault === '1';
  }
  set resourceSliderByDefault(shown: boolean) {
    this._resourceSliderDefault = shown ? '1' : '';
  }

  /** How the round decides whose turn it is: by initiative, or side by side; anything unknown reads as the default. */
  get turnOrderMode(): TurnOrderMode {
    return asTurnOrderMode(this._turnOrderMode);
  }
  set turnOrderMode(mode: TurnOrderMode) {
    this._turnOrderMode = asTurnOrderMode(mode);
  }

  /** When turns go side by side, how a side gets through its own phase: freely or by initiative. */
  get factionPhaseMode(): FactionPhaseMode {
    return asFactionPhaseMode(this._factionPhaseMode);
  }
  set factionPhaseMode(mode: FactionPhaseMode) {
    this._factionPhaseMode = asFactionPhaseMode(mode);
  }

  /** The sides in the order the round takes them, as a comma-separated list. */
  get factionOrder(): string {
    return this._factionOrder;
  }
  set factionOrder(order: string) {
    this._factionOrder = order;
  }

  /**
   * Whether a piece is walked along a way it could have taken, rather than dropped anywhere.
   *
   * A room saved while this was two answers, one for the end and one for the way, is read as
   * asking for it if either was said: both were ways of asking for a move that holds to the
   * rules, and the one setting now does both.
   */
  get moveStrict(): boolean {
    return this._moveStrict === '1' || this._moveStrictPath === '1';
  }
  set moveStrict(strict: boolean) {
    this._moveStrict = strict ? '1' : '';
    this._moveStrictPath = '';
  }

  /**
   * Whether a move on a table with no grid is drawn as a way of straight legs, measured in metres,
   * rather than counted in the cells the table keeps out of sight. Off for a room that never said.
   */
  get pathMove(): boolean {
    return this._pathMove === '1';
  }
  set pathMove(free: boolean) {
    this._pathMove = free ? '1' : '';
  }

  /**
   * Whether an enemy may step into a move under way and stop it there, under strict movement with
   * engagement zones. Off for a room that never said.
   */
  get interruptEnabled(): boolean {
    return this._interruptEnabled === '1';
  }
  set interruptEnabled(allowed: boolean) {
    this._interruptEnabled = allowed ? '1' : '';
  }

  /** Every engagement-zone rule the room has been asked about, null where it has not answered. */
  get zoneRuleAnswers(): ZoneRuleAnswers {
    return zoneRuleAnswersOf(this);
  }

  /** Whether a round taken side by side skips the phase of pieces that belong to no side. */
  get factionSkipUnassigned(): boolean {
    return this._factionSkipUnassigned === '1';
  }
  set factionSkipUnassigned(skips: boolean) {
    this._factionSkipUnassigned = skips ? '1' : '';
  }

  /**
   * Whether a piece may cut corners at all, or null to leave it to the table.
   *
   * Setting this alone leaves {@link diagonalMove} as it is, while setting that also writes this.
   */
  get moveDiagonally(): boolean | null {
    return readRuleFlag(this._moveDiagonally);
  }
  /**
   * How a corner is counted, or nothing where the room has not said.
   *
   * Written alongside the older yes-or-no, never instead of it: a peer on a version that only
   * knows the older question still has to be told whether corners may be cut at all.
   */
  get diagonalMove(): DiagonalMove | null {
    return asDiagonalMove(readRuleText(this._diagonalMove));
  }
  set diagonalMove(answer: DiagonalMove | null) {
    this._diagonalMove = writeRuleText(answer);
    this._moveDiagonally = writeRuleFlag(answer === null ? null : allowsDiagonal(answer));
  }
  set moveDiagonally(answer: boolean | null) {
    this._moveDiagonally = writeRuleFlag(answer);
  }

  /** Every rule of play the room has been asked about, answered or not. */
  get roomRuleAnswers(): RoomRuleAnswers {
    const answers: Partial<Record<keyof RoomRuleAnswers, unknown>> = {};
    for (const rule of Object.keys(ROOM_RULE_DEFAULTS) as (keyof RoomRuleAnswers)[]) answers[rule] = this[rule];
    return answers as RoomRuleAnswers;
  }

  private static _instance: Config;
  /**
   * The room's one config, shared by every peer under a fixed identifier.
   *
   * Prefers the copy already in the object store, such as one received from another peer, and creates and
   * registers it when there is none yet.
   */
  static get instance(): Config {
    const stored = ObjectStore.instance.get<Config>('Config');
    if (stored) return (Config._instance = stored);
    if (!Config._instance) Config._instance = new Config('Config');
    Config._instance.initialize();
    return Config._instance;
  }

  /**
   * Lets go of the one held here as it leaves the store, so that the next reader is given one made
   * anew, as for a room just started, rather than this one put back as it was.
   */
  override onStoreRemoved() {
    super.onStoreRemoved();
    if (Config._instance === this) Config._instance = undefined as unknown as Config;
  }

  /**
   * Loading a saved room copies the saved settings onto the room's existing config and discards this copy.
   *
   * This keeps a single config in the room rather than adding a second one from the save file.
   */
  override parseInnerXml(element: Element) {
    const context = Config.instance.toContext();
    context.syncData = this.toContext().syncData;
    Config.instance.apply(context);
    Config.instance.update();

    super.parseInnerXml.apply(Config.instance, [element]);
    this.destroy();
  }
}

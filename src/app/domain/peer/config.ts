import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { InnerXml } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Jukebox } from '@axe/domain/media/jukebox';
import {
  readRuleFlag,
  readRuleNumber,
  readRuleText,
  RoomRuleAnswers,
  writeRuleFlag,
  writeRuleNumber,
  writeRuleText,
} from '@axe/domain/tabletop/room-rules';
import {
  asFactionPhaseMode,
  asTurnOrderMode,
  FactionPhaseMode,
  TurnOrderMode,
} from '@axe/domain/tabletop/turn-order-mode';

@SyncObject('config')
export class Config extends ObjectNode implements InnerXml {
  @SyncVar('_defaultDiceBot') private _defaultDiceBot: string = 'DiceBot';
  @SyncVar('_roomVolume') private _roomVolume: number = 1.0;
  @SyncVar('_systemAvatarIdentifier') private _systemAvatarIdentifier: string = '';
  @SyncVar('_systemDiceAvatarIdentifier') private _systemDiceAvatarIdentifier: string = '';
  @SyncVar('_hideSystemAvatar') private _hideSystemAvatar: string = '';
  @SyncVar('_showSpeakerAvatar') private _showSpeakerAvatar: string = '';

  // How the round is taken, which is the room's own decision rather than a table's.
  @SyncVar('_turnOrderMode') private _turnOrderMode: string = '';
  @SyncVar('_factionPhaseMode') private _factionPhaseMode: string = '';
  @SyncVar('_factionOrder') private _factionOrder: string = '';
  @SyncVar('_factionSkipUnassigned') private _factionSkipUnassigned: string = '';
  @SyncVar('_moveStrict') private _moveStrict: string = '';
  @SyncVar('_moveStrictPath') private _moveStrictPath: string = '';

  // The rules of play the room answers for itself. Each one is left unanswered until the
  // room settings are asked, and whatever is unanswered stays with the table that is out.
  @SyncVar('_moveRangeEnabled') private _moveRangeEnabled: string = '';
  @SyncVar('_moveRangeElementNames') private _moveRangeElementNames: string = '';
  @SyncVar('_moveDiagonally') private _moveDiagonally: string = '';
  @SyncVar('_piecesShareCells') private _piecesShareCells: string = '';
  @SyncVar('_moveRangeAlways') private _moveRangeAlways: string = '';
  @SyncVar('_zocAlways') private _zocAlways: string = '';
  @SyncVar('_cellDistance') private _cellDistance: number = -1;
  @SyncVar('_cellDistanceUnit') private _cellDistanceUnit: string = '';
  @SyncVar('_zocMode') private _zocMode: string = '';
  @SyncVar('_zocRange') private _zocRange: number = -1;
  @SyncVar('_zocExtraCost') private _zocExtraCost: number = -1;
  @SyncVar('_facingMark') private _facingMark: string = '';

  get defaultDiceBot(): string {
    if (this._defaultDiceBot == '') {
      return 'DiceBot';
    }
    return this._defaultDiceBot;
  }
  set defaultDiceBot(dice: string) {
    this._defaultDiceBot = dice;
  }

  get roomVolume(): number {
    return this._roomVolume;
  }
  set roomVolume(volume: number) {
    this._roomVolume = volume;
  }

  get systemAvatarIdentifier(): string {
    return this._systemAvatarIdentifier;
  }
  set systemAvatarIdentifier(identifier: string) {
    this._systemAvatarIdentifier = identifier;
  }

  get systemDiceAvatarIdentifier(): string {
    return this._systemDiceAvatarIdentifier;
  }
  set systemDiceAvatarIdentifier(identifier: string) {
    this._systemDiceAvatarIdentifier = identifier;
  }

  get isSystemAvatarVisible(): boolean {
    return this._hideSystemAvatar !== '1';
  }
  set isSystemAvatarVisible(visible: boolean) {
    this._hideSystemAvatar = visible ? '' : '1';
  }

  get isSpeakerAvatarVisible(): boolean {
    return this._showSpeakerAvatar === '1';
  }
  set isSpeakerAvatarVisible(visible: boolean) {
    this._showSpeakerAvatar = visible ? '1' : '';
  }

  get turnOrderMode(): TurnOrderMode {
    return asTurnOrderMode(this._turnOrderMode);
  }
  set turnOrderMode(mode: TurnOrderMode) {
    this._turnOrderMode = asTurnOrderMode(mode);
  }

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

  get factionSkipUnassigned(): boolean {
    return this._factionSkipUnassigned === '1';
  }
  set factionSkipUnassigned(skips: boolean) {
    this._factionSkipUnassigned = skips ? '1' : '';
  }

  get moveRangeEnabled(): boolean | null {
    return readRuleFlag(this._moveRangeEnabled);
  }
  set moveRangeEnabled(answer: boolean | null) {
    this._moveRangeEnabled = writeRuleFlag(answer);
  }

  get moveRangeElementNames(): string | null {
    return readRuleText(this._moveRangeElementNames);
  }
  set moveRangeElementNames(answer: string | null) {
    this._moveRangeElementNames = writeRuleText(answer);
  }

  get moveDiagonally(): boolean | null {
    return readRuleFlag(this._moveDiagonally);
  }
  set moveDiagonally(answer: boolean | null) {
    this._moveDiagonally = writeRuleFlag(answer);
  }

  get piecesShareCells(): boolean | null {
    return readRuleFlag(this._piecesShareCells);
  }
  set piecesShareCells(answer: boolean | null) {
    this._piecesShareCells = writeRuleFlag(answer);
  }

  get moveRangeAlways(): boolean | null {
    return readRuleFlag(this._moveRangeAlways);
  }
  set moveRangeAlways(answer: boolean | null) {
    this._moveRangeAlways = writeRuleFlag(answer);
  }

  get zocAlways(): boolean | null {
    return readRuleFlag(this._zocAlways);
  }
  set zocAlways(answer: boolean | null) {
    this._zocAlways = writeRuleFlag(answer);
  }

  get cellDistance(): number | null {
    return readRuleNumber(this._cellDistance);
  }
  set cellDistance(answer: number | null) {
    this._cellDistance = writeRuleNumber(answer);
  }

  get cellDistanceUnit(): string | null {
    return readRuleText(this._cellDistanceUnit);
  }
  set cellDistanceUnit(answer: string | null) {
    this._cellDistanceUnit = writeRuleText(answer);
  }

  get zocMode(): string | null {
    return readRuleText(this._zocMode);
  }
  set zocMode(answer: string | null) {
    this._zocMode = writeRuleText(answer);
  }

  get zocRange(): number | null {
    return readRuleNumber(this._zocRange);
  }
  set zocRange(answer: number | null) {
    this._zocRange = writeRuleNumber(answer);
  }

  get zocExtraCost(): number | null {
    return readRuleNumber(this._zocExtraCost);
  }
  set zocExtraCost(answer: number | null) {
    this._zocExtraCost = writeRuleNumber(answer);
  }

  get facingMark(): string | null {
    return readRuleText(this._facingMark);
  }
  set facingMark(answer: string | null) {
    this._facingMark = writeRuleText(answer);
  }

  /** Every rule of play the room has been asked about, answered or not. */
  get roomRuleAnswers(): RoomRuleAnswers {
    return {
      moveRangeEnabled: this.moveRangeEnabled,
      moveRangeElementNames: this.moveRangeElementNames,
      moveDiagonally: this.moveDiagonally,
      piecesShareCells: this.piecesShareCells,
      moveRangeAlways: this.moveRangeAlways,
      zocAlways: this.zocAlways,
      cellDistance: this.cellDistance,
      cellDistanceUnit: this.cellDistanceUnit,
      zocMode: this.zocMode,
      zocRange: this.zocRange,
      zocExtraCost: this.zocExtraCost,
      facingMark: this.facingMark,
    };
  }

  // The jukebox keeps the settings of the person listening.
  // The master volume lives here because the shared settings are saved together.
  get jukebox(): Jukebox {
    return ObjectStore.instance.get<Jukebox>('Jukebox')!;
  }

  private static _instance: Config;
  static get instance(): Config {
    const stored = ObjectStore.instance.get<Config>('Config');
    if (stored) return (Config._instance = stored);
    if (!Config._instance) Config._instance = new Config('Config');
    Config._instance.initialize();
    return Config._instance;
  }

  override parseInnerXml(element: Element) {
    const context = Config.instance.toContext();
    context.syncData = this.toContext().syncData;
    Config.instance.apply(context);
    Config.instance.update();

    super.parseInnerXml.apply(Config.instance, [element]);
    this.destroy();
  }

  override apply(context: ObjectContext) {
    const _roomVolume = this._roomVolume;
    const _defaultDiceBot = this._defaultDiceBot;
    super.apply(context);
    if (_roomVolume !== this._roomVolume) {
      this.jukebox.setNewVolume();
    }
  }
}

import { EventChannel, StickyEventChannel } from '@axe/core/event/event-channel';
import { localDispatch, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { getPeerContext } from '@axe/core/network/peer-context-source';
import { ArchiveEntries } from '@axe/core/storage/room-archive';

export interface SendMessageEvent {
  messageIdentifier: string;
  messageTarget: { text: string; object: { name: string } | null } | null;
}

export interface DiceTableMessageEvent {
  messageIdentifier: string;
}

export interface ResourceChangeEvent {
  /** The piece whose numbers moved. */
  characterIdentifier: string;
  /** What moved and by how much, carrying only what the drawing needs. */
  changes: unknown[];
  /** Which device reported it. Your own is ignored, having drawn it already. */
  emittedBy?: string;
}

export interface ResourceEditMessageEvent {
  messageIdentifier: string;
  messageTargetContext: unknown[] | null;
}

export interface SelectGameTableEvent {
  identifier: string;
}

export interface DomainPeerDisconnectEvent {
  peerId: string;
}

export interface MessageAddedEvent {
  tabIdentifier: string;
  messageIdentifier: string;
}

export interface CutInEvent {
  cutIn: unknown;
  /** Who the cut-in is played for, where a launch says. */
  speaker?: unknown;
}

export interface VoteTally {
  choice: string;
  count: number;
}

export interface FinishVoteEvent {
  isRollCall: boolean;
  voteTitle: string;
  voted: number;
  total: number;
  abstained: number;
  unanswered: number;
  tally: VoteTally[];
  chatTabIdentifier?: string;
}

export interface AlarmTimeUpEvent {
  text: string;
}

export interface AlarmPopEvent {
  title: string;
  time: number;
}

export interface XmlLoadedEvent {
  xmlElement: Element;
  dropPoint?: { x: number; y: number };
}

export interface ImageDroppedEvent {
  identifier: string;
  fileName: string;
  dropPoint: { x: number; y: number };
}

export interface CcfoliaRoomDroppedEvent {
  entries: ArchiveEntries;
}

/** A file a load left out for being larger than its kind may be, with the limit it went over. */
export interface FileTooLarge {
  name: string;
  kind: 'image' | 'audio';
  limitBytes: number;
}

export interface FilesTooLargeEvent {
  files: FileTooLarge[];
}

export interface LoadConfigEvent {
  config: unknown;
}

export interface DiceRolledEvent {
  /** The line the dice bot answered. */
  sourceMessageIdentifier: string;
  /** Its answer, which carries what the dice showed. */
  resultMessageIdentifier: string;
}

export interface DiceThrowEvent {
  /** The dice bot's answer whose dice are thrown. */
  messageIdentifier: string;
  /** The piece that said the line the answer answers, which the dice are thrown before on the table; blank for none. */
  speakerIdentifier?: string;
}

export interface DiceBotUnreachableEvent {
  /** The line that went unrolled. */
  messageIdentifier: string;
  /** The id of the game system whose code could not be fetched. */
  gameType: string;
}

export interface EffectCastEvent {
  cast: unknown;
}

export const sendMessage$ = new EventChannel<SendMessageEvent>();
export const diceTableMessage$ = new EventChannel<DiceTableMessageEvent>();
export const resourceEditMessage$ = new EventChannel<ResourceEditMessageEvent>();
export const domainPeerDisconnect$ = new EventChannel<DomainPeerDisconnectEvent>();
export const soundEffect$ = new EventChannel<string>();

export const effectCast$ = new EventChannel<EffectCastEvent>();
export const diceRolled$ = new EventChannel<DiceRolledEvent>();
export const diceThrow$ = new EventChannel<DiceThrowEvent>();
export const diceBotCatalog$ = new EventChannel<void>();
export const diceBotUnreachable$ = new EventChannel<DiceBotUnreachableEvent>();
export const resourceChange$ = new EventChannel<ResourceChangeEvent>();

export const selectGameTable$ = new EventChannel<SelectGameTableEvent>();
export const updateAudioResource$ = new EventChannel<void>();
export const messageAdded$ = new EventChannel<MessageAddedEvent>();
export const startCutIn$ = new EventChannel<CutInEvent>();
export const soundOnlyCutIn$ = new EventChannel<CutInEvent>();
export const stopCutIn$ = new EventChannel<CutInEvent>();
export const stopCutInByBgm$ = new EventChannel<void>();
export const finishVote$ = new EventChannel<FinishVoteEvent>();
export const endOldVote$ = new EventChannel<void>();
export const startVote$ = new EventChannel<void>();
export const alarmTimeUp$ = new EventChannel<AlarmTimeUpEvent>();
export const alarmPop$ = new EventChannel<AlarmPopEvent>();
export const fileLoaded$ = new EventChannel<void>();
export const xmlLoaded$ = new EventChannel<XmlLoadedEvent>();
export const imageDropped$ = new EventChannel<ImageDroppedEvent>();
export const ccfoliaRoomDropped$ = new EventChannel<CcfoliaRoomDroppedEvent>();
export const filesTooLarge$ = new EventChannel<FilesTooLargeEvent>();
// The configuration load can emit before the app component subscribes, so this channel is
// sticky: without it the event is missed and the peer id stays unset.
export const loadConfig$ = new StickyEventChannel<LoadConfigEvent>();
export const fileResourceUpdated$ = new EventChannel<void>();

/**
 * Announces on this device that a chat line was sent, so the dice bot can roll it.
 *
 * Emitted once per message target. Dice sounds also listen. Nothing is sent to the room.
 */
export function emitSendMessage(event: SendMessageEvent) {
  sendMessage$.emit(event);
}
/** Announces on this device that the dice bot answered a chat line with a roll. */
export function emitDiceRolled(event: DiceRolledEvent) {
  diceRolled$.emit(event);
}
/** Announces on this device that a chat line was sent, so the dice bot can match it to a dice table. */
export function emitDiceTableMessage(event: DiceTableMessageEvent) {
  diceTableMessage$.emit(event);
}
/** Announces on this device that a chat line was sent, so resource edit commands in it can run. */
export function emitResourceEditMessage(event: ResourceEditMessageEvent) {
  resourceEditMessage$.emit(event);
}
/** Makes the given table the one on view; the table selecter records it, which syncs to the room. */
export function emitSelectGameTable(event: SelectGameTableEvent) {
  selectGameTable$.emit(event);
}
/** Announces that a message joined a chat tab, whether sent here or received from a peer. */
export function emitMessageAdded(event: MessageAddedEvent) {
  messageAdded$.emit(event);
}
/** Announces on this device that a cut-in starts; open windows for the same cut-in or tag close. */
export function emitStartCutIn(event: CutInEvent) {
  startCutIn$.emit(event);
}
/** Announces on this device that a cut-in plays its sound without showing a window. */
export function emitSoundOnlyCutIn(event: CutInEvent) {
  soundOnlyCutIn$.emit(event);
}
/** Announces on this device that a cut-in stops, closing its window. */
export function emitStopCutIn(event: CutInEvent) {
  stopCutIn$.emit(event);
}
/** Announces on this device that untagged cut-ins with sound stop, closing their windows. */
export function emitStopCutInByBgm() {
  stopCutInByBgm$.emit();
}
/** Announces on this device that a vote or roll call ended, with the tally to report. */
export function emitFinishVote(event: FinishVoteEvent) {
  finishVote$.emit(event);
}
/** Announces on this device that the previous vote is over; emitted just before emitStartVote. */
export function emitEndOldVote() {
  endOldVote$.emit();
}
/** Announces on this device that a vote has started, which opens the vote widget. */
export function emitStartVote() {
  startVote$.emit();
}
/** Announces on this device that an alarm aimed at it went off, with the text posted to chat. */
export function emitAlarmTimeUp(event: AlarmTimeUpEvent) {
  alarmTimeUp$.emit(event);
}
/** Announces on this device that an alarm aimed at it went off and wants a pop-up. */
export function emitAlarmPop(event: AlarmPopEvent) {
  alarmPop$.emit(event);
}
/** Announces that a dropped or opened file has been processed; emitted once per file. */
export function emitFileLoaded() {
  fileLoaded$.emit();
}
/** Announces that an XML file was read from a drop or load, so what it describes can be restored. */
export function emitXmlLoaded(event: XmlLoadedEvent) {
  xmlLoaded$.emit(event);
}
/** Announces that an image was dropped on the table and stored, so a piece can be made of it. */
export function emitImageDropped(event: ImageDroppedEvent) {
  imageDropped$.emit(event);
}
/** Announces that a CCFOLIA room archive was dropped, with its unzipped entries, for import. */
export function emitCcfoliaRoomDropped(event: CcfoliaRoomDroppedEvent) {
  ccfoliaRoomDropped$.emit(event);
}
/** Announces the files a load left out for being too large, once the whole load is done. */
export function emitFilesTooLarge(event: FilesTooLargeEvent) {
  filesTooLarge$.emit(event);
}
/** Announces that the app config loaded; the channel is sticky, so late subscribers still get it. */
export function emitLoadConfig(event: LoadConfigEvent) {
  loadConfig$.emit(event);
}
export interface FileSelectedEvent {
  fileIdentifier: string;
}

export const selectFile$ = new EventChannel<FileSelectedEvent>();
/** Announces that a file was picked in a file selector or the file storage panel. */
export function emitSelectFile(event: FileSelectedEvent) {
  selectFile$.emit(event);
}

/**
 * Raises a change notice for the object the context names, on this device only.
 *
 * The context is not applied and nothing is sent; views that redraw on object changes, such as
 * the table grid, pick it up. An object not in the store is created from the context.
 */
export function triggerUpdateGameObject(context: unknown) {
  localDispatch('UPDATE_GAME_OBJECT', context);
}

/** Tells every device, this one included, to play the roll animation of a dice symbol. */
export function callRollDiceSymbol(identifier: string) {
  networkSend('ROLL_DICE_SYMBOL', { identifier });
}

/** Tells every device, this one included, to spin a coin to the given face. */
export function callFlipCoin(identifier: string, face: string) {
  networkSend('FLIP_COIN', { identifier, face });
}

/** Tells every device, this one included, to play the shuffle animation of a card stack. */
export function callShuffleCardStack(identifier: string) {
  networkSend('SHUFFLE_CARD_STACK', { identifier });
}

/**
 * Has the dice of a roll just answered thrown on every device, this one included, or on this
 * device alone for a roll nobody else may see yet.
 *
 * Nothing about the throw is kept: a room loaded later, or a replay, never throws it again.
 */
export function callDiceThrow(event: DiceThrowEvent, here: 'everywhere' | 'here') {
  if (here === 'here') localDispatch('DICE_THROW', event);
  else networkSend('DICE_THROW', event);
}

/** Plays a stored sound on every device, this one included, by its audio identifier. */
export function callSoundEffect(identifier: string) {
  networkSend('SOUND_EFFECT', identifier);
}

/** Sends a cast effect to every device, this one included, to be played there. */
export function callEffectCast(cast: unknown) {
  networkSend('EFFECT_CAST', cast);
}

/**
 * Tells everyone that a resource moved.
 *
 * Watching for differences locally would count values replaced by a room load or a sync
 * as movement. Only the device that changed it reports, and everyone draws from that.
 */
export function callResourceChange(event: ResourceChangeEvent) {
  networkSend('RESOURCE_CHANGE', { ...event, emittedBy: getPeerContext().peerId });
}

/**
 * Tells others that this device is typing in a chat tab, and as which speaker when given.
 *
 * With sendTo it goes to that peer alone; otherwise to the whole room, this device included.
 */
export function callWritingAMessage(tabIdentifier: string, sendTo?: string | null, speakerIdentifier?: string | null) {
  networkSend('WRITING_A_MESSAGE', tabIdentifier, sendTo ?? undefined);
  if (speakerIdentifier) {
    networkSend('WRITING_A_MESSAGE_DETAIL', { tabIdentifier, speakerIdentifier }, sendTo ?? undefined);
  }
}

/**
 * Broadcasts a peer cursor's heartbeat, which peers use to measure clock offsets and spot silence.
 *
 * The tuple holds the timestamp, the peer id being probed, the known clock offset to that peer and
 * a running counter.
 */
export function callHeartBeat(data: [number, string, number | null, number]) {
  networkSend('HEART_BEAT', data);
}

/** Broadcasts this device's pointer position in table coordinates, so peers can draw its cursor. */
export function callCursorMove(data: [number, number, number]) {
  networkSend('CURSOR_MOVE', data);
}

networkMessage$.subscribe((msg) => {
  switch (msg.eventName) {
    case 'SEND_MESSAGE':
      sendMessage$.emit(msg.data as SendMessageEvent);
      break;
    case 'DICE_TABLE_MESSAGE':
      diceTableMessage$.emit(msg.data as DiceTableMessageEvent);
      break;
    case 'RESOURCE_EDIT_MESSAGE':
      resourceEditMessage$.emit(msg.data as ResourceEditMessageEvent);
      break;
    case 'SELECT_GAME_TABLE':
      selectGameTable$.emit({ identifier: (msg.data as { identifier: string }).identifier });
      break;
    case 'DISCONNECT_PEER':
      domainPeerDisconnect$.emit({ peerId: (msg.data as { peerId: string }).peerId });
      break;
    case 'UPDATE_AUDIO_RESOURE':
      updateAudioResource$.emit();
      break;
    case 'SOUND_EFFECT':
      soundEffect$.emit(msg.data as string);
      break;
    case 'EFFECT_CAST':
      effectCast$.emit({ cast: msg.data });
      break;
    case 'RESOURCE_CHANGE':
      resourceChange$.emit(msg.data as ResourceChangeEvent);
      break;
    case 'DICE_THROW': {
      const data = msg.data as Partial<DiceThrowEvent> | null;
      if (typeof data?.messageIdentifier !== 'string') break;
      const speaker = typeof data.speakerIdentifier === 'string' ? data.speakerIdentifier : '';
      diceThrow$.emit({ messageIdentifier: data.messageIdentifier, speakerIdentifier: speaker });
      break;
    }
  }
});

/** Announces that the list of dice bots has loaded, so pickers can show it. */
export function emitDiceBotCatalogLoaded(): void {
  diceBotCatalog$.emit();
}

/** Announces on this device that a line went unrolled because its game system's code could not be fetched. */
export function emitDiceBotUnreachable(event: DiceBotUnreachableEvent): void {
  diceBotUnreachable$.emit(event);
}

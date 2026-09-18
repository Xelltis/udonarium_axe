import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';

export interface ReplayNameLookup {
  actorName(userId: string): string;
  targetName(identifier: string): string;
  /** The name of the piece an object is part of, or empty when it belongs to none. */
  ownerName?(identifier: string): string;
}

export interface ReplayLogLine {
  key: string;
  params: Record<string, string | number>;
  paramKeys?: Record<string, string>;
  icon: string;
  isSecret: boolean;
}

const TABLE_PLACE = 'table';
const DEFAULT_SURFACE = 'floor';

const ICONS: Record<string, string> = {
  [ReplayEventKind.ChatMessage]: 'chat_bubble',
  [ReplayEventKind.ChatDice]: 'casino',
  [ReplayEventKind.ObjectCreate]: 'add_circle',
  [ReplayEventKind.ObjectRemove]: 'delete',
  [ReplayEventKind.ObjectMove]: 'open_with',
  [ReplayEventKind.ObjectRotate]: 'rotate_right',
  [ReplayEventKind.ObjectFace]: 'flip',
  [ReplayEventKind.ObjectDiceRoll]: 'casino',
  [ReplayEventKind.ObjectShuffle]: 'shuffle',
  [ReplayEventKind.ObjectValue]: 'exposure',
  [ReplayEventKind.ObjectImage]: 'image',
  [ReplayEventKind.ObjectOwner]: 'person',
  [ReplayEventKind.ObjectLock]: 'lock',
  [ReplayEventKind.ObjectUpdate]: 'edit',
  [ReplayEventKind.TableChange]: 'grid_on',
  [ReplayEventKind.TableScene]: 'wallpaper',
  [ReplayEventKind.TurnChange]: 'hourglass_top',
  [ReplayEventKind.VoteStart]: 'how_to_vote',
  [ReplayEventKind.VoteFinish]: 'ballot',
  [ReplayEventKind.MediaSoundEffect]: 'volume_up',
  [ReplayEventKind.MediaBgm]: 'music_note',
  [ReplayEventKind.MediaCutIn]: 'movie',
  [ReplayEventKind.EffectCast]: 'auto_awesome',
  [ReplayEventKind.VnScene]: 'wallpaper',
  [ReplayEventKind.VnPlayhead]: 'auto_stories',
  [ReplayEventKind.VnDirect]: 'theaters',
  [ReplayEventKind.VnMode]: 'auto_stories',
  [ReplayEventKind.PeerJoin]: 'login',
  [ReplayEventKind.PeerLeave]: 'logout',
  [ReplayEventKind.PeerRoleChange]: 'shield_person',
  [ReplayEventKind.Marker]: 'bookmark',
};

/** The wall-clock time of an event as `HH:MM:SS` in the viewer's time zone. */
export function formatReplayTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export { replayScriptElapsed as formatReplayElapsed } from '@axe/domain/replay/replay-script';

/**
 * Turns a replay event into a line of the replay log: a translation key with its parameters, an
 * icon, and whether it was secret.
 *
 * Actor and target names are looked up as they were when the event happened. A move says whether
 * the piece changed place, surface or height, and an event of an unknown kind reads as a plain
 * update.
 */
export function toReplayLogLine(event: ReplayEvent, names: ReplayNameLookup): ReplayLogLine {
  const actor = names.actorName(event.actorId);
  const target = event.targetId ? names.targetName(event.targetId) : '';
  const detail = event.detail;
  const isSecret = event.visibility.kind !== 'public';
  const icon = ICONS[event.kind] ?? 'radio_button_unchecked';
  const line = (
    key: string,
    params: Record<string, string | number> = {},
    paramKeys?: Record<string, string>
  ): ReplayLogLine => ({
    key: `feature.replay.line.${key}`,
    params: { actor, target, ...params },
    ...(paramKeys ? { paramKeys } : {}),
    icon,
    isSecret,
  });

  switch (event.kind) {
    case ReplayEventKind.ChatMessage:
      return line('chat', { speaker: text(detail['name']) || actor, text: text(detail['text']) });
    case ReplayEventKind.ChatDice:
      return line('dice', { text: text(detail['text']) });
    case ReplayEventKind.ObjectMove:
      return describeMoveLine(line, detail, names);
    case ReplayEventKind.ObjectRotate:
      return line('rotate', { angle: Math.round(numberOf(pick(detail['rotate'], 'to'))) });
    case ReplayEventKind.ObjectFace:
      return line('face', { face: text(detail['to']) });
    case ReplayEventKind.ObjectDiceRoll:
      return line('diceRoll');
    case ReplayEventKind.ObjectShuffle:
      return line('shuffle');
    case ReplayEventKind.ObjectValue:
      return line('value', {
        target: (event.targetId && names.ownerName?.(event.targetId)) || target,
        name: text(detail['name']),
        from: text(pick(detail['current'] ?? detail['value'], 'from')),
        to: text(pick(detail['current'] ?? detail['value'], 'to')),
      });
    case ReplayEventKind.ObjectImage:
      return line('image');
    case ReplayEventKind.ObjectOwner:
      return line('owner', { owner: names.actorName(text(detail['to'])) });
    case ReplayEventKind.ObjectLock:
      return line(detail['locked'] === true ? 'lock' : 'unlock');
    case ReplayEventKind.ObjectCreate:
      return line('create');
    case ReplayEventKind.ObjectRemove:
      return line('remove');
    case ReplayEventKind.TableChange:
      return line('table');
    case ReplayEventKind.TableScene:
      return line('tableScene');
    case ReplayEventKind.TurnChange:
      return describeTurnLine(line, detail, target);
    case ReplayEventKind.VoteStart:
      return line(detail['isRollCall'] === true ? 'rollCall' : 'vote', { title: text(detail['title']) });
    case ReplayEventKind.VoteFinish:
      return line('voteFinish', { title: text(detail['title']) });
    case ReplayEventKind.PeerRoleChange:
      return line('role', { role: text(detail['role']) });
    case ReplayEventKind.MediaSoundEffect:
      return line('soundEffect');
    case ReplayEventKind.MediaBgm:
      return line(detail['isPlaying'] === true ? 'bgmStart' : 'bgmStop');
    case ReplayEventKind.MediaCutIn:
      return line('cutIn');
    case ReplayEventKind.EffectCast:
      return describeEffectLine(line, detail, names, target);
    case ReplayEventKind.VnScene:
      return line(target.length > 0 ? 'vnScene' : 'vnSceneClear');
    case ReplayEventKind.VnPlayhead:
      return line('vnPlayhead');
    case ReplayEventKind.VnDirect:
      return line(detail['isDirected'] === true ? 'vnDirectStart' : 'vnDirectStop');
    case ReplayEventKind.VnMode:
      return line(detail['active'] === true ? 'vnModeOn' : 'vnModeOff');
    case ReplayEventKind.PeerJoin:
      return line('join');
    case ReplayEventKind.PeerLeave:
      return line('leave');
    case ReplayEventKind.Marker:
      return line('marker', { label: text(detail['label']) });
    default:
      return line('update');
  }
}

function describeEffectLine(
  line: LineFactory,
  detail: Readonly<Record<string, unknown>>,
  names: ReplayNameLookup,
  presetName: string
): ReplayLogLine {
  const targetNames = (Array.isArray(detail['targets']) ? detail['targets'] : [])
    .map((identifier) => names.targetName(text(identifier)) || text(identifier))
    .filter((name) => name.length > 0);
  const casterId = text(detail['caster']);
  const caster = casterId.length > 0 ? names.targetName(casterId) || casterId : '';
  const params = { effect: presetName, targets: targetNames.join('、') };

  if (targetNames.length < 1) return line('effect', { effect: presetName });
  if (caster.length > 0) return line('effectFrom', { ...params, caster });
  return line('effectOn', params);
}

function describeTurnLine(line: LineFactory, detail: Readonly<Record<string, unknown>>, target: string): ReplayLogLine {
  const round = Math.round(numberOf(detail['round']));
  const phase = text(detail['phase']);
  if (phase === 'roundStart') return line('roundStart', { round });
  if (phase === 'roundEnd') return line('roundEnd', { round });
  if (phase === 'idle') return line('turnEnd');
  return target.length > 0 ? line('turn', { round }) : line('turnEmpty', { round });
}

type LineFactory = (
  key: string,
  params?: Record<string, string | number>,
  paramKeys?: Record<string, string>
) => ReplayLogLine;

function describeMoveLine(
  line: LineFactory,
  detail: Readonly<Record<string, unknown>>,
  names: ReplayNameLookup
): ReplayLogLine {
  const from = position(detail['from']);
  const to = position(detail['to']);
  const params = { fromX: from.x, fromY: from.y, toX: to.x, toY: to.y };

  if (from.place !== to.place) {
    const placeParams: Record<string, string | number> = { ...params };
    const placeKeys: Record<string, string> = {};
    assignPlace(placeParams, placeKeys, 'fromPlace', from.place, names);
    assignPlace(placeParams, placeKeys, 'toPlace', to.place, names);
    return line('movePlace', placeParams, placeKeys);
  }

  if (from.surface !== to.surface) {
    return line('moveSurface', params, {
      fromSurface: `feature.replay.surface.${from.surface}`,
      toSurface: `feature.replay.surface.${to.surface}`,
    });
  }

  if (from.z !== to.z) return line('moveHeight', { ...params, fromZ: from.z, toZ: to.z });

  return line('move', params);
}

function assignPlace(
  params: Record<string, string | number>,
  paramKeys: Record<string, string>,
  name: string,
  place: string,
  names: ReplayNameLookup
): void {
  if (place === TABLE_PLACE) {
    paramKeys[name] = 'feature.replay.place.table';
    return;
  }
  params[name] = names.targetName(place) || place;
}

function position(value: unknown): { x: number; y: number; z: number; place: string; surface: string } {
  const record = (value ?? {}) as Record<string, unknown>;
  return {
    x: Math.round(numberOf(record['x'])),
    y: Math.round(numberOf(record['y'])),
    z: Math.round(numberOf(record['z'])),
    place: text(record['name']) || TABLE_PLACE,
    surface: text(record['surface']) || DEFAULT_SURFACE,
  };
}

function pick(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
  return value == null ? '' : String(value);
}

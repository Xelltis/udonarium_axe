import { PeerSessionGrade, PeerSessionState } from '@axe/core/network/peer-session-state';

export enum PeerLinkQuality {
  Unknown = 'unknown',
  Good = 'good',
  Fair = 'fair',
  Poor = 'poor',
  Lost = 'lost',
}

export const FAIR_PING_MS = 200;
export const POOR_PING_MS = 500;
export const FAIR_HEALTH = 1;
export const POOR_HEALTH = 0.5;

const SEVERITY: Record<PeerLinkQuality, number> = {
  [PeerLinkQuality.Unknown]: 0,
  [PeerLinkQuality.Good]: 1,
  [PeerLinkQuality.Fair]: 2,
  [PeerLinkQuality.Poor]: 3,
  [PeerLinkQuality.Lost]: 4,
};

/** Whether any statistics have come in for a peer connection yet: a grade, a ping or a health reading. */
export function isMeasured(session: PeerSessionState): boolean {
  return session.grade !== PeerSessionGrade.UNSPECIFIED || session.ping > 0 || session.health > 0;
}

/**
 * Grades the connection to one peer for display.
 *
 * Lost when the connection is closed, unknown until it has been measured, poor at low health or a ping of
 * 500 ms or more, fair at less than full health or a ping of 200 ms or more, and good otherwise.
 */
export function linkQualityOf(session: PeerSessionState, isOpen: boolean): PeerLinkQuality {
  if (!isOpen) return PeerLinkQuality.Lost;
  if (!isMeasured(session)) return PeerLinkQuality.Unknown;
  if (session.health <= POOR_HEALTH || POOR_PING_MS <= session.ping) return PeerLinkQuality.Poor;
  if (session.health < FAIR_HEALTH || FAIR_PING_MS <= session.ping) return PeerLinkQuality.Fair;
  return PeerLinkQuality.Good;
}

/** The worst of several connection grades, for a summary of every peer; unknown when given none. */
export function worstLinkQuality(qualities: Iterable<PeerLinkQuality>): PeerLinkQuality {
  let worst = PeerLinkQuality.Unknown;
  for (const quality of qualities) {
    if (SEVERITY[worst] < SEVERITY[quality]) worst = quality;
  }
  return worst;
}

/** Whether the connection is graded low, which is how a link going through a relay server is reported. */
export function isRelayedLink(session: PeerSessionState): boolean {
  return session.grade === PeerSessionGrade.LOW;
}

/** The translation key for a connection grade's label in the lobby. */
export function linkQualityLabelKey(quality: PeerLinkQuality): string {
  return `feature.lobby.linkQuality.${quality}`;
}

/** The icon font name shown for a connection grade. */
export function linkQualityIcon(quality: PeerLinkQuality): string {
  switch (quality) {
    case PeerLinkQuality.Good:
      return 'signal_cellular_alt';
    case PeerLinkQuality.Fair:
      return 'network_check';
    case PeerLinkQuality.Poor:
      return 'signal_cellular_connected_no_internet_4_bar';
    case PeerLinkQuality.Lost:
      return 'signal_cellular_off';
    default:
      return 'signal_cellular_null';
  }
}

/** The Tailwind text colour class for a connection grade, from green for good to red for lost. */
export function linkQualityColorClass(quality: PeerLinkQuality): string {
  switch (quality) {
    case PeerLinkQuality.Good:
      return 'text-emerald-500';
    case PeerLinkQuality.Fair:
      return 'text-amber-500';
    case PeerLinkQuality.Poor:
      return 'text-orange-600';
    case PeerLinkQuality.Lost:
      return 'text-red-600';
    default:
      return 'text-ui-dim';
  }
}

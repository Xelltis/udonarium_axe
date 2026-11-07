import { PeerSessionGrade, PeerSessionState } from '@axe/core/network/peer-session-state';
import {
  FAIR_SILENCE_MS,
  isMeasured,
  isRelayedLink,
  linkQualityColorClass,
  linkQualityIcon,
  linkQualityLabelKey,
  linkQualityOf,
  PeerLinkQuality,
  POOR_SILENCE_MS,
  roundTripQualityOf,
  silenceQualityOf,
  worstLinkQuality,
} from '@axe/domain/peer/peer-link-quality';

function session(overrides: Partial<PeerSessionState> = {}): PeerSessionState {
  return {
    grade: PeerSessionGrade.HIGH,
    ping: 30,
    health: 1,
    speed: 1,
    description: 'host',
    ...overrides,
  };
}

describe('roundTripQualityOf', () => {
  it('counts the link to the room server lost while it is down, and unknown before an answer has come', () => {
    expect(roundTripQualityOf(40, false)).toBe(PeerLinkQuality.Lost);
    expect(roundTripQualityOf(0, true)).toBe(PeerLinkQuality.Unknown);
    expect(roundTripQualityOf(Number.NaN, true)).toBe(PeerLinkQuality.Unknown);
  });

  it('grades it by how long the answer took, as a peer’s ping is', () => {
    expect(roundTripQualityOf(199, true)).toBe(PeerLinkQuality.Good);
    expect(roundTripQualityOf(200, true)).toBe(PeerLinkQuality.Fair);
    expect(roundTripQualityOf(499, true)).toBe(PeerLinkQuality.Fair);
    expect(roundTripQualityOf(500, true)).toBe(PeerLinkQuality.Poor);
  });
});

describe('silenceQualityOf', () => {
  it('counts someone the room server has said nothing of as unknown', () => {
    expect(silenceQualityOf(null)).toBe(PeerLinkQuality.Unknown);
  });

  it('grades someone by how long the room server has gone without hearing from them', () => {
    expect(silenceQualityOf(0)).toBe(PeerLinkQuality.Good);
    expect(silenceQualityOf(FAIR_SILENCE_MS - 1)).toBe(PeerLinkQuality.Good);
    expect(silenceQualityOf(FAIR_SILENCE_MS)).toBe(PeerLinkQuality.Fair);
    expect(silenceQualityOf(POOR_SILENCE_MS - 1)).toBe(PeerLinkQuality.Fair);
    expect(silenceQualityOf(POOR_SILENCE_MS)).toBe(PeerLinkQuality.Poor);
  });
});

describe('linkQualityOf', () => {
  it('counts a closed link as lost', () => {
    expect(linkQualityOf(session(), false)).toBe(PeerLinkQuality.Lost);
  });

  it('counts an unmeasured one as unknown', () => {
    const unmeasured = session({ grade: PeerSessionGrade.UNSPECIFIED, ping: 0, health: 0, speed: 0 });
    expect(linkQualityOf(unmeasured, true)).toBe(PeerLinkQuality.Unknown);
  });

  it('counts a sound link with little delay as good', () => {
    expect(linkQualityOf(session(), true)).toBe(PeerLinkQuality.Good);
  });

  it('drops to fair once it goes quiet', () => {
    expect(linkQualityOf(session({ health: 0.9 }), true)).toBe(PeerLinkQuality.Fair);
  });

  it('drops to fair past a fifth of a second', () => {
    expect(linkQualityOf(session({ ping: 200 }), true)).toBe(PeerLinkQuality.Fair);
    expect(linkQualityOf(session({ ping: 199 }), true)).toBe(PeerLinkQuality.Good);
  });

  it('drops to poor once its health halves', () => {
    expect(linkQualityOf(session({ health: 0.5 }), true)).toBe(PeerLinkQuality.Poor);
  });

  it('drops to poor past half a second', () => {
    expect(linkQualityOf(session({ ping: 500 }), true)).toBe(PeerLinkQuality.Poor);
    expect(linkQualityOf(session({ ping: 499 }), true)).toBe(PeerLinkQuality.Fair);
  });

  it('counts a relayed link with little delay as good all the same', () => {
    expect(linkQualityOf(session({ grade: PeerSessionGrade.LOW }), true)).toBe(PeerLinkQuality.Good);
  });
});

describe('worstLinkQuality', () => {
  it('is unknown for no links at all', () => {
    expect(worstLinkQuality([])).toBe(PeerLinkQuality.Unknown);
  });

  it('returns the worst of them', () => {
    expect(worstLinkQuality([PeerLinkQuality.Good, PeerLinkQuality.Poor, PeerLinkQuality.Fair])).toBe(
      PeerLinkQuality.Poor
    );
  });

  it('a lost link comes first', () => {
    expect(worstLinkQuality([PeerLinkQuality.Poor, PeerLinkQuality.Lost])).toBe(PeerLinkQuality.Lost);
  });

  it('an unknown one never hides a real problem', () => {
    expect(worstLinkQuality([PeerLinkQuality.Unknown, PeerLinkQuality.Good])).toBe(PeerLinkQuality.Good);
    expect(worstLinkQuality([PeerLinkQuality.Unknown, PeerLinkQuality.Fair])).toBe(PeerLinkQuality.Fair);
  });

  it('is unknown when they all are', () => {
    expect(worstLinkQuality([PeerLinkQuality.Unknown, PeerLinkQuality.Unknown])).toBe(PeerLinkQuality.Unknown);
  });
});

describe('isMeasured', () => {
  it('counts a fresh session as unmeasured', () => {
    expect(isMeasured(session({ grade: PeerSessionGrade.UNSPECIFIED, ping: 0, health: 0, speed: 0 }))).toBe(false);
  });

  it('counts one with a grade as measured', () => {
    expect(isMeasured(session({ grade: PeerSessionGrade.MIDDLE, ping: 0, health: 0 }))).toBe(true);
  });

  it('counts one with a latency as measured', () => {
    expect(isMeasured(session({ grade: PeerSessionGrade.UNSPECIFIED, ping: 12, health: 0 }))).toBe(true);
  });
});

describe('isRelayedLink', () => {
  it('reads the lowest grade as a relay', () => {
    expect(isRelayedLink(session({ grade: PeerSessionGrade.LOW }))).toBe(true);
  });

  it('counts anything else as direct', () => {
    expect(isRelayedLink(session({ grade: PeerSessionGrade.HIGH }))).toBe(false);
    expect(isRelayedLink(session({ grade: PeerSessionGrade.UNSPECIFIED }))).toBe(false);
  });
});

describe('what is shown for each', () => {
  it('gives every quality a label', () => {
    for (const quality of Object.values(PeerLinkQuality)) {
      expect(linkQualityLabelKey(quality)).toBe(`feature.lobby.linkQuality.${quality}`);
    }
  });

  it('gives every one an icon and a colour', () => {
    for (const quality of Object.values(PeerLinkQuality)) {
      expect(linkQualityIcon(quality)).toBeTruthy();
      expect(linkQualityColorClass(quality)).toBeTruthy();
    }
  });

  it('gives each a colour of its own', () => {
    const classes = Object.values(PeerLinkQuality).map(linkQualityColorClass);
    expect(new Set(classes).size).toBe(classes.length);
  });
});

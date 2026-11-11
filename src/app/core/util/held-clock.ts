/** How long a wait between two frames is, in milliseconds, past which the page may be held to have stood still over it. */
export const LONG_FRAME_MS = 200;

/** How many times the usual wait between frames a long wait has to be for the page to be held to have stood still. */
const STILL_FACTOR = 3;

/** How much of each wait the usual wait between frames is moved by. */
const USUAL_FOLLOWS = 0.2;

/** How many long waits in a row are held still before the page is taken to be slow all along. */
const HELD_IN_A_ROW = 2;

/** How long something has played at a frame, and whether the clock stood still over the wait before it. */
export interface HeldClockReading {
  readonly elapsed: number;
  readonly held: boolean;
}

/**
 * A clock of how long something has played, read at each frame, that stands still while the page
 * does. A wait between two frames of a page in view that is long, and far longer than the page
 * usually waits, as while it readies something heavy, counts as one usual frame only, so nothing of
 * what plays is passed over unseen. A page slow all along plays on in time at its own pace. A wait
 * while the page was out of view, as in a tab left in the background, counts in full, so what plays
 * there plays out.
 */
export class HeldClock {
  private last: number;
  private held = 0;
  private usual = 1000 / 60;
  private away = false;
  private longInARow = 0;

  constructor(private readonly startedAt: number) {
    this.last = startedAt;
  }

  /** Notes that the page went out of view, so that the wait until the next frame counts in full. */
  leftView(): void {
    this.away = true;
  }

  /** How long has played at a frame drawn at the moment given. */
  read(now: number): HeldClockReading {
    const wait = now - this.last;
    const long = !this.away && wait > LONG_FRAME_MS && wait > this.usual * STILL_FACTOR;
    this.longInARow = long ? this.longInARow + 1 : 0;
    // A long wait or two is the page standing still, and no wait it usually makes: taken into the
    // usual one, it would hide a stall coming soon after. Long waits on and on are a slow page, whose
    // pace the usual wait then follows; and a wait out of view tells nothing of the page's pace.
    const held = long && this.longInARow <= HELD_IN_A_ROW;
    if (held) this.held += wait - this.usual;
    else if (!this.away) this.usual += (wait - this.usual) * USUAL_FOLLOWS;
    this.last = now;
    this.away = false;
    return { elapsed: now - this.startedAt - this.held, held };
  }
}

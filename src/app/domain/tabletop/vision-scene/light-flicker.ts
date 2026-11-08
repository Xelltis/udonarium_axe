/**
 * How bright a light that pulses or flickers is at a moment, as a share of its full brightness: the
 * page's darkness and the scene a canvas draws both read it, so a torch flickers alike on either.
 */
export function animationIntensity(animation: string | undefined, timeMs: number): number {
  switch (animation) {
    case 'pulse':
      return 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(timeMs / 350));
    case 'flicker':
      return 0.6 + 0.4 * Math.abs(Math.sin(timeMs * 0.013) * Math.sin(timeMs * 0.027 + 1.3));
    default:
      return 1;
  }
}

/** Whether a light's brightness moves with time. */
export function flickers(animation: string | undefined): boolean {
  return animation === 'pulse' || animation === 'flicker';
}

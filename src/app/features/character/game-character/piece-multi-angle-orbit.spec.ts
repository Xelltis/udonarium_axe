import { signal } from '@angular/core';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { PieceGauge } from '@axe/domain/character/piece-gauge';
import {
  PieceMultiAngleOrbit,
  PieceMultiAngleOrbitHost,
} from '@axe/features/character/game-character/piece-multi-angle-orbit';

type Display = ReturnType<PieceMultiAngleOrbitHost['display']>;

describe('PieceMultiAngleOrbit', () => {
  function setup(over: Partial<Record<keyof PieceMultiAngleOrbitHost, unknown>> = {}) {
    const display = signal({
      multiAngleEnabled: true,
      multiAngleResourceBuffEnabled: false,
      multiAngleMotionMode: 'rotate',
      multiAngleRevolutionSeconds: 20,
      multiAnglePauseSeconds: 0,
      multiAnglePieceRevolutionSeconds: 40,
    } as unknown as Display);
    const state = {
      standsFlat: signal(true),
      name: signal('勇者'),
      riderNames: signal<string[]>([]),
      hideName: signal(false),
      hideBuff: signal(false),
      riding: signal(false),
      gauges: signal<PieceGauge[]>([]),
      buffs: signal<BuffBadge[]>([]),
    };
    const host: PieceMultiAngleOrbitHost = {
      standsFlat: state.standsFlat,
      display,
      identifier: () => 'piece-1',
      name: state.name,
      riderNames: state.riderNames,
      hideName: state.hideName,
      hideBuff: state.hideBuff,
      riding: state.riding,
      footprint: () => 50,
      gauges: state.gauges,
      buffs: state.buffs,
      buffIconScale: () => 1,
      ...(over as Partial<PieceMultiAngleOrbitHost>),
    };
    return { orbit: new PieceMultiAngleOrbit(host), state, display };
  }

  const buff = (name: string) => ({ name }) as BuffBadge;

  it('sends the name round only on a flat table that has the labels going round turned on', () => {
    const { orbit, state, display } = setup();
    expect(orbit.nameEnabled()).toBe(true);

    state.standsFlat.set(false);
    expect(orbit.nameEnabled()).toBe(false);

    state.standsFlat.set(true);
    display.update((now) => ({ ...now, multiAngleEnabled: false }));
    expect(orbit.nameEnabled()).toBe(false);
    expect(orbit.resourceBuffEnabled()).toBe(false);
  });

  it('writes the start of the buffs after the name where the buffs have no ring of their own', () => {
    const { orbit, state, display } = setup();
    state.buffs.set([buff('猛毒の霧'), buff('加速')]);
    expect(orbit.labelText()).toBe('勇者/猛毒の霧・');

    state.hideBuff.set(true);
    expect(orbit.labelText()).toBe('勇者');

    state.hideBuff.set(false);
    display.update((now) => ({ ...now, multiAngleResourceBuffEnabled: true }));
    expect(orbit.labelText()).toBe('勇者');
  });

  it('writes the riders before the piece they ride', () => {
    const { orbit, state } = setup();
    state.riderNames.set(['騎手', '従者']);

    expect(orbit.labelText()).toBe('騎手／従者／勇者');
  });

  it('shows nothing for a piece that rides another, or that has neither a name to show nor a ring to fill', () => {
    const { orbit, state, display } = setup();
    expect(orbit.visible()).toBe(true);

    state.riding.set(true);
    expect(orbit.visible()).toBe(false);

    state.riding.set(false);
    state.hideName.set(true);
    expect(orbit.visible()).toBe(false);

    display.update((now) => ({ ...now, multiAngleResourceBuffEnabled: true }));
    state.buffs.set([buff('加速')]);
    expect(orbit.visible()).toBe(true);
    state.hideBuff.set(true);
    expect(orbit.visible()).toBe(false);
  });

  it('turns the ring of the bars and the buffs slower than the name, each starting partway round', () => {
    const { orbit } = setup();
    const name = orbit.nameAnimation();

    expect(orbit.resourceBuffAnimation().durationSeconds).toBeCloseTo(name.durationSeconds * 1.25, 6);
    expect(orbit.nameDelaySeconds()).toBeLessThanOrEqual(0);
    expect(orbit.nameDelaySeconds()).toBeGreaterThan(-name.durationSeconds);
    expect(orbit.curvedNamePathId()).toBe('multi-angle-curved-name-piece-1');
  });

  it('holds how long the piece takes to turn between 5 and 300 seconds, and falls back for what is no number', () => {
    const { orbit, display } = setup();
    expect(orbit.pieceRevolutionSeconds()).toBe(40);

    display.update((now) => ({ ...now, multiAnglePieceRevolutionSeconds: 1 }));
    expect(orbit.pieceRevolutionSeconds()).toBe(5);
    display.update((now) => ({ ...now, multiAnglePieceRevolutionSeconds: 9999 }));
    expect(orbit.pieceRevolutionSeconds()).toBe(300);
    display.update((now) => ({ ...now, multiAnglePieceRevolutionSeconds: Number.NaN }));
    expect(orbit.pieceRevolutionSeconds()).toBeGreaterThanOrEqual(5);
  });
});

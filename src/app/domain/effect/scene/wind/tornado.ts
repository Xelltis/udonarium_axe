import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, haze, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import {
  debrisKindOf,
  type DebrisPose,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  smooth,
  type WindPaint,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';
import { tornadoTimingOf } from '@axe/domain/effect/wind-looks';

/*
 * A tornado: a funnel reaching for the sky from a swirl on the ground, narrow where it grinds at the
 * floor and opening into a crown, its axis writhing as waves run up it. Its body is a thick column in
 * a dark slate sheath, lit from one side, its pattern streaming up it, so that it holds over a bright
 * table; bands of wind wind round it over wide stripes of shadow, each with a bright head and a tail
 * that fades, the half of each behind the column dark and laid before it and the half before it
 * bright and laid after. What it takes up slides in along the floor, climbs it in turns, and is
 * thrown out at the top to fall and roll. Dust wheels about its foot over marks swept into the floor.
 * It rises in half a second, stands, and thins away as it lifts off the ground.
 */

/** How tall a tornado stands, in cells, and how wide it is at its foot and under its crown. */
const TALL_CELLS = 5.4;
const FOOT_CELLS = 0.38;
const SHOULDER_CELLS = 1.95;
/** How much wider its crown opens at the very top, in cells. */
const CROWN_FLARE_CELLS = 0.5;
/** How many levels its body is drawn through, and how many points each band of wind. */
const BODY_LEVELS = 26;
const BAND_POINTS = 11;
/** How many bands of wind wind round it at the middle grade, how many clouds its crown has, and how many marks are swept into the floor. */
const BANDS = 26;
/** How many stripes of shadow run under the bands, as a share of them. */
const STRIPES_SHARE = 0.7;
const CROWN_CLOUDS = 11;
const SWEEPS = 7;
/** How many things it carries at the middle grade. */
const DEBRIS = 66;
/** How hard what it throws out falls, in cells a second squared. */
const FALL_CELLS = 16;
/** How long a thing thrown out rolls where it lands before it is gone, in seconds. */
const ROLLS_S = 0.3;
/** How long the funnel takes to let go of all it carries once it starts to thin, in seconds. */
const LETS_GO_OVER_S = 0.2;
/** The dark the funnel's sheath is taken towards, so that it holds over a bright table. */
const SHEATHED = '#141b22';

/** The funnel as it stands at a moment: where its axis is and how wide it is at each share of its height. */
interface Funnel {
  readonly floor: Point;
  readonly cell: number;
  readonly seconds: number;
  /** How tall it stands now, in table pixels. */
  readonly tall: number;
  /** How much of it is there, from nothing as it starts to all of it, and back to nothing as it goes. */
  readonly present: number;
  /** How far up it its foot has lifted off the floor, as a share of its height. */
  readonly lifted: number;
  axisAt(share: number): Point;
  radiusAt(share: number): number;
}

function funnelOf(stage: Stage): Funnel {
  const { cell, duration } = stage;
  const t = stage.seconds;
  const timing = tornadoTimingOf(duration);
  const risen = outCubic(within(t, 0, timing.risenAt));
  const thinning = within(t, timing.thinsAt, timing.goneAt);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const tall = cell * TALL_CELLS * (0.12 + 0.88 * risen);
  const phase = (stage.seed % 628) / 100;
  const girth = (0.45 + 0.55 * risen) * (1 - 0.8 * thinning);
  return {
    floor,
    cell,
    seconds: t,
    tall,
    present: Math.min(within(t, 0, 0.12), 1 - thinning ** 1.5),
    lifted: 0.5 * thinning * thinning,
    axisAt: (share) => {
      const lean = cell * (0.05 + 0.5 * share ** 1.3) * (0.4 + 0.6 * risen);
      return {
        x: floor.x + lean * (0.75 * Math.sin(share * 5.2 - t * 3.1 + phase) + 0.5 * share * Math.sin(t * 0.9 + phase)),
        y: floor.y + lean * (0.55 * Math.cos(share * 4.1 - t * 2.6 + phase) + 0.4 * share * Math.cos(t * 0.7)),
        z: floor.z + share * tall,
      };
    },
    radiusAt: (share) =>
      cell *
      (FOOT_CELLS +
        (SHOULDER_CELLS - FOOT_CELLS) * share ** 1.2 +
        CROWN_FLARE_CELLS * smooth(0.78, 1, share) ** 2 * (0.5 + 0.5 * risen)) *
      (1 + 0.06 * Math.sin(share * 9 - t * 6)) *
      girth,
  };
}

/** A tornado over one target: the funnel on the first of a cast, and for each of the rest what the wind does to a piece caught round it. */
export function drawTornado(stage: Stage): Staged {
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const paint = windPaintOf(ramp);
  if (stage.index > 0) return drawCaught(stage, paint);
  const drawn = nothingStaged();
  const funnel = funnelOf(stage);
  const salt = (stage.seed % 997) / 97;
  const density = stage.preset.gradeDensity;
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  const keep = (ribbon: EffectRibbon, about: readonly Point[], dimmed?: number) => {
    const halves = halvesOf(ribbon, about, paint.shadow, dimmed);
    far.push(halves.far);
    near.push(halves.near);
  };
  layGround(drawn, stage, funnel, paint, salt);
  if (funnel.present > 0) {
    windBands(funnel, paint, Math.round(BANDS * density ** 0.8), salt, keep);
    crown(drawn, funnel, paint, salt, keep);
  }
  debris(stage, funnel, Math.round(DEBRIS * density), salt, keep);
  layRibbons(drawn, sweeps(stage, funnel, paint, salt));
  layRibbons(drawn, far);
  if (funnel.present > 0) layRibbons(drawn, body(funnel, paint));
  layRibbons(drawn, near);
  return drawn;
}

/**
 * The body of the funnel, what is under first: its shadow, wide and dark; the column, pale where the
 * light falls on it from one side and shaded on the other; and a streak of light down its lit side.
 * Each fades into the dust at its foot and into the crown at its top.
 */
function body(funnel: Funnel, paint: WindPaint): EffectRibbon[] {
  const points: Point[] = [];
  const widths: number[] = [];
  const alphas: number[] = [];
  for (let level = 0; level < BODY_LEVELS; level++) {
    const share = funnel.lifted + (1 - funnel.lifted) * (level / (BODY_LEVELS - 1));
    points.push(funnel.axisAt(share));
    widths.push(funnel.radiusAt(share) * 2);
    alphas.push(smooth(funnel.lifted, funnel.lifted + 0.14, share) * (1 - 0.7 * smooth(0.86, 1, share)));
  }
  const t = funnel.seconds;
  const sheet = (wide: number, fields: Omit<EffectRibbon, 'points' | 'widths' | 'alphas' | 'blend'>): EffectRibbon => ({
    points,
    widths: widths.map((width) => width * wide),
    alphas,
    blend: 'color',
    ...fields,
    alpha: fields.alpha * funnel.present,
  });
  return [
    sheet(1.18, {
      color: mixColor(paint.shadow, SHEATHED, 0.55),
      alpha: 0.92,
      soft: 0.22,
      torn: 0.45,
      flowed: t * 1.6,
    }),
    sheet(0.98, {
      color: mixColor(paint.shadow, SHEATHED, 0.2),
      core: mixColor(paint.shadow, paint.edge, 0.6),
      alpha: 0.92,
      soft: 0.24,
      torn: 0.6,
      flowed: t * 2.4 + 5,
      leans: -0.4,
    }),
    sheet(0.7, {
      color: paint.pale,
      core: '#ffffff',
      alpha: 0.3,
      soft: 0.9,
      torn: 0.9,
      flowed: t * 3.4 + 11,
      leans: -0.6,
    }),
  ];
}

/**
 * The bands of wind wound round the funnel: each climbs it from the dust to the crown as it turns,
 * its head bright and its tail fading out behind and below it. Under the bright ones run wider
 * stripes of shadow, fewer and slower, which give the turning body its grain.
 */
function windBands(
  funnel: Funnel,
  paint: WindPaint,
  count: number,
  salt: number,
  keep: (ribbon: EffectRibbon, about: readonly Point[]) => void
): void {
  const t = funnel.seconds;
  const stripes = Math.round(count * STRIPES_SHARE);
  for (let band = -stripes; band < count; band++) {
    const stripe = band < 0;
    const period = (stripe ? 1.5 : 0.9) + 0.8 * scatter(band, salt + 1);
    const head = (scatter(band, salt + 2) + t / period) % 1;
    const span = (stripe ? 2.2 : 1.5) + 1.7 * scatter(band, salt + 3);
    const drop = 0.06 + 0.1 * scatter(band, salt + 4);
    const wide = funnel.cell * (stripe ? 0.4 + 0.36 * scatter(band, salt + 5) : 0.15 + 0.17 * scatter(band, salt + 5));
    const out = stripe ? 0.98 : 1 + 0.14 * scatter(band, salt + 6);
    const turned = scatter(band, salt + 7) * Math.PI * 2 + t * (7 + 5 * scatter(band, salt + 8));
    const shown = Math.sin(Math.PI * head) ** 0.6 * funnel.present;
    const points: Point[] = [];
    const about: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let point = 0; point < BAND_POINTS; point++) {
      const along = point / (BAND_POINTS - 1);
      const share = Math.max(funnel.lifted, head - (1 - along) * drop);
      const turn = turned - (1 - along) * span;
      const middle = funnel.axisAt(share);
      const radius = funnel.radiusAt(share) * out;
      about.push(middle);
      points.push({ x: middle.x + Math.cos(turn) * radius, y: middle.y + Math.sin(turn) * radius, z: middle.z });
      widths.push(wide * along ** 0.7 * (1 - 0.7 * smooth(0.82, 1, along)));
      alphas.push(along ** 1.4);
    }
    keep(
      stripe
        ? {
            points,
            widths,
            alphas,
            color: mixColor(paint.shadow, SHEATHED, 0.5),
            alpha: 0.85 * shown,
            blend: 'color',
            soft: 0.3,
            torn: 0.45,
          }
        : {
            points,
            widths,
            alphas,
            color: paint.edge,
            core: '#ffffff',
            alpha: 0.95 * shown,
            blend: 'color',
            torn: 0.3,
          },
      about
    );
  }
}

/**
 * The crown the funnel opens into: flat shreds of cloud wheeling about its top, wider and slower than
 * the bands below, over a haze that gives it body.
 */
function crown(
  drawn: Staged,
  funnel: Funnel,
  paint: WindPaint,
  salt: number,
  keep: (ribbon: EffectRibbon, about: readonly Point[], dimmed?: number) => void
): void {
  const t = funnel.seconds;
  const top = funnel.axisAt(0.97);
  const reach = funnel.radiusAt(1);
  const forward = funnel.cell * 0.2;
  for (let puff = 0; puff < 5; puff++) {
    const turn = t * 1.3 + (puff / 5) * Math.PI * 2;
    const at = { x: top.x + Math.cos(turn) * reach * 0.5, y: top.y + Math.sin(turn) * reach * 0.5, z: top.z };
    drawn.motes.push(haze(at, reach * 1.5, mixColor(paint.shadow, SHEATHED, 0.3), 0.32 * funnel.present, forward));
  }
  for (let cloud = 0; cloud < CROWN_CLOUDS; cloud++) {
    const level = 0.86 + 0.16 * scatter(cloud, salt + 21);
    const out = reach * (0.72 + 0.5 * scatter(cloud, salt + 22));
    const span = 0.9 + 1 * scatter(cloud, salt + 23);
    const wide = funnel.cell * (0.4 + 0.4 * scatter(cloud, salt + 24));
    const turned = scatter(cloud, salt + 25) * Math.PI * 2 + t * (2.4 + 2.2 * scatter(cloud, salt + 26));
    const middle = funnel.axisAt(Math.min(1, level));
    const lift = (level - Math.min(1, level)) * funnel.tall;
    const steps = 8;
    const points: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let step = 0; step <= steps; step++) {
      const along = step / steps;
      const turn = turned - (1 - along) * span;
      points.push({
        x: middle.x + Math.cos(turn) * out * (1 + 0.14 * Math.sin(turn * 3 + cloud)),
        y: middle.y + Math.sin(turn) * out * (1 + 0.14 * Math.sin(turn * 3 + cloud)),
        z: middle.z + lift + Math.sin(turn * 2 + cloud) * funnel.cell * 0.12,
      });
      widths.push(wide * Math.sin(Math.PI * (0.08 + 0.84 * along)) ** 0.6);
      alphas.push(Math.sin(Math.PI * along) ** 0.5);
    }
    keep(
      {
        points,
        widths,
        alphas,
        color: mixColor(paint.edge, paint.shadow, 0.3),
        core: mixColor(paint.edge, paint.pale, 0.55),
        alpha: 0.72 * funnel.present,
        blend: 'color',
        soft: 0.6,
        torn: 1,
        flowed: t * 2 + cloud * 3.1,
      },
      points.map(() => ({ ...middle, z: middle.z + lift })),
      0.75
    );
  }
}

/** The marks the wind sweeps into the floor about the foot of the funnel: arcs of dust racing round it, the inner ones the faster. */
function sweeps(stage: Stage, funnel: Funnel, paint: WindPaint, salt: number): EffectRibbon[] {
  const t = funnel.seconds;
  const { cell } = funnel;
  const shown = swirlOf(stage);
  const reach = Math.max(cell * 2.4, stage.areaPx * 0.85);
  const ribbons: EffectRibbon[] = [];
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const out = cell * 0.6 + (reach - cell * 0.6) * ((sweep + scatter(sweep, salt + 31)) / SWEEPS);
    const span = 1.1 + 1.5 * scatter(sweep, salt + 32);
    const turned = scatter(sweep, salt + 33) * Math.PI * 2 + (t * 7 * cell) / (out + cell * 0.6);
    const steps = 9;
    const points: Point[] = [];
    const alphas: number[] = [];
    for (let step = 0; step <= steps; step++) {
      const along = step / steps;
      const turn = turned - (1 - along) * span;
      const drawnIn = out * (1 + 0.12 * (1 - along));
      points.push({
        x: funnel.floor.x + Math.cos(turn) * drawnIn,
        y: funnel.floor.y + Math.sin(turn) * drawnIn,
        z: funnel.floor.z + cell * 0.03,
      });
      alphas.push(Math.sin(Math.PI * along) ** 0.6);
    }
    const pale = sweep % 2 === 0;
    ribbons.push({
      points,
      widths: cell * (0.2 + 0.2 * scatter(sweep, salt + 34)),
      alphas,
      color: pale ? paint.dust : paint.dustDeep,
      core: pale ? mixColor(paint.dust, '#ffffff', 0.6) : undefined,
      alpha: (pale ? 0.45 : 0.4) * shown,
      blend: 'color',
      soft: 0.7,
      torn: 0.8,
      flowed: t * 3 + sweep,
    });
  }
  return ribbons;
}

/** How much of the swirl on the ground shows: there from the first, before the funnel rises out of it, and gone with it. */
function swirlOf(stage: Stage): number {
  const timing = tornadoTimingOf(stage.duration);
  return Math.min(within(stage.seconds, 0, 0.15), 1 - within(stage.seconds, timing.thinsAt + 0.1, timing.goneAt));
}

/**
 * What lies and turns on the ground under the funnel: its shadow on the floor, a skirt of dust
 * wheeling about its foot, drawn out the way it turns and laid dark and then pale, billows of it
 * between, and sand hopping round.
 */
function layGround(drawn: Staged, stage: Stage, funnel: Funnel, paint: WindPaint, salt: number): void {
  const { cell, floor } = funnel;
  const t = funnel.seconds;
  const shown = swirlOf(stage);
  if (shown <= 0) return;
  const forward = cell * 0.2;
  const foot = funnel.radiusAt(0.05);
  drawn.floor.push(floorMark('disc', floor, cell * 2.1, 1, paint.shadow, 0.34 * shown, 'color', 0));
  drawn.floor.push(
    floorMark('scorch', floor, cell * 1.25, 1, paint.dustDeep, 0.3 * shown, 'color', (stage.seed % 89) + 1, t * 2.2)
  );
  drawn.floor.push(floorMark('ring', floor, cell * 1.5, 0.16, paint.dust, 0.3 * shown, 'color', 0));
  const skirts = 18;
  for (const pass of [0, 1] as const) {
    for (let wisp = 0; wisp < skirts; wisp++) {
      const out = foot + cell * (0.25 + 1.15 * scatter(wisp, salt + 41));
      const turn = scatter(wisp, salt + 42) * Math.PI * 2 + (t * 6.5 * cell) / (out + cell * 0.5);
      const high = cell * (0.1 + 0.55 * scatter(wisp, salt + 43));
      const root = { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + high };
      const heading = {
        x: -Math.sin(turn) - Math.cos(turn) * 0.35,
        y: Math.cos(turn) - Math.sin(turn) * 0.35,
        z: 0.22,
      };
      const wide = cell * (0.45 + 0.4 * scatter(wisp, salt + 44)) * (pass === 0 ? 1.2 : 0.85);
      drawn.motes.push(
        flowingMote('wisp', root, heading, wide, wide * (2 + scatter(wisp, salt + 45)), t * 4 + wisp * 1.7, {
          color: pass === 0 ? paint.dustDeep : paint.dust,
          core: pass === 0 ? undefined : mixColor(paint.dust, '#ffffff', 0.5),
          alpha: (pass === 0 ? 0.52 : 0.55) * shown,
          forward,
          variant: wisp * 0.9,
        })
      );
    }
  }
  for (let puff = 0; puff < 6; puff++) {
    const turn = t * 5 + (puff / 6) * Math.PI * 2;
    const out = foot + cell * (0.15 + 0.5 * scatter(puff, salt + 46));
    const swell = 0.8 + 0.3 * Math.sin(t * 4 + puff * 1.9);
    drawn.motes.push(
      smokePuff(
        { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z + cell * 0.28 },
        cell * 0.6 * swell,
        puff % 2 === 0 ? paint.dust : paint.dustDeep,
        0.34 * shown,
        forward
      )
    );
  }
  for (let grain = 0; grain < 16; grain++) {
    const hop = (t / (0.32 + 0.3 * scatter(grain, salt + 47)) + scatter(grain, salt + 48)) % 1;
    const out = foot + cell * (0.3 + 1.5 * scatter(grain, salt + 49));
    const turn = scatter(grain, salt + 50) * Math.PI * 2 + t * (3 + 2 * scatter(grain, salt + 51));
    drawn.motes.push({
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.04 + 0.3 * Math.sin(Math.PI * hop)),
      size: cell * (0.05 + 0.04 * scatter(grain, salt + 52)),
      color: grain % 3 === 0 ? '#4b423d' : paint.dustDeep,
      alpha: shown,
      blend: 'color',
      shape: 'chunk',
      spin: t * 9 + grain,
      variant: grain,
      forward,
    });
  }
  for (let level = 0; level < 5; level++) {
    const share = funnel.lifted + (1 - funnel.lifted) * (0.12 + 0.19 * level);
    drawn.motes.push(
      haze(funnel.axisAt(share), funnel.radiusAt(share) * 2.6, paint.shadow, 0.2 * funnel.present, forward)
    );
  }
}

/**
 * What the funnel carries: each thing slides in along the floor, turning faster as it nears the foot,
 * climbs the funnel in turns, and is thrown out off the top to fall, land and roll; then another
 * comes in. None is taken up once the funnel thins, and what it carries then is let go where it is, to
 * fall from there.
 */
function debris(
  stage: Stage,
  funnel: Funnel,
  count: number,
  salt: number,
  keep: (ribbon: EffectRibbon, about: readonly Point[]) => void
): void {
  const { cell, floor } = funnel;
  const t = funnel.seconds;
  const timing = tornadoTimingOf(stage.duration);
  const fullTall = cell * TALL_CELLS;
  const fall = FALL_CELLS * cell;
  const reach = Math.max(cell * 2.6, Math.min(stage.areaPx, cell * 4));
  for (let thing = 0; thing < count; thing++) {
    const kind = debrisKindOf(thing);
    const slideS = 0.45 + 0.35 * scatter(thing, salt + 61);
    const climbS = 1 + 0.5 * scatter(thing, salt + 62);
    const topShare = 0.8 + 0.2 * scatter(thing, salt + 63);
    const up = cell * (0.3 + 1.2 * scatter(thing, salt + 64));
    const period = slideS + climbS + (up + Math.sqrt(up * up + 2 * fall * topShare * fullTall)) / fall + ROLLS_S;
    const startsAt = scatter(thing, salt + 65) * 0.9;
    if (t < startsAt) continue;
    const since = (t - startsAt) % period;
    const round = Math.floor((t - startsAt) / period);
    const begun = t - since;
    if (begun + slideS > timing.thinsAt) continue;
    const thrownAt = Math.min(begun + slideS + climbS, timing.thinsAt + LETS_GO_OVER_S * scatter(thing, salt + 74));
    const from = scatter(thing, salt + 66 + round) * Math.PI * 2;
    const turns = (2 + 1.2 * scatter(thing, salt + 67)) * Math.PI * 2;
    const out = 1.05 + 0.3 * scatter(thing, salt + 68);
    const variant = scatter(thing, salt + 69) * 8;
    const size =
      cell * (kind === 'stone' ? 0.16 + 0.1 * scatter(thing, salt + 70) : 0.24 + 0.14 * scatter(thing, salt + 70));
    const tumble = 6 + 9 * scatter(thing, salt + 71);
    let pose: DebrisPose;
    let middle: Point;
    if (since < slideS) {
      const slid = since / slideS;
      const away =
        funnel.radiusAt(0.02) * out +
        (reach * (0.6 + 0.4 * scatter(thing, salt + 72)) - cell * 0.3) * (1 - slid ** 1.5);
      const turn = from + slid * slid * 4;
      middle = floor;
      pose = {
        kind,
        at: { x: floor.x + Math.cos(turn) * away, y: floor.y + Math.sin(turn) * away, z: floor.z + size * 0.4 },
        size,
        turn: turn + Math.PI / 2 + slid * tumble,
        tip: 0.2 * Math.sin(slid * tumble * 2),
        alpha: Math.min(1, slid * 5) * swirlOf(stage),
        variant,
      };
    } else if (t < thrownAt) {
      const climbed = (since - slideS) / climbS;
      const share = Math.min(topShare * climbed ** 0.85, 1);
      const turn = from + 4 + turns * climbed;
      const away = funnel.radiusAt(share) * out;
      middle = funnel.axisAt(share);
      pose = {
        kind,
        at: { x: middle.x + Math.cos(turn) * away, y: middle.y + Math.sin(turn) * away, z: middle.z },
        size,
        turn: tumble * since + variant,
        tip: Math.sin(since * tumble * 0.7 + variant) * 0.9,
        alpha: 1,
        variant,
      };
    } else {
      const flown = t - thrownAt;
      const climbed = (thrownAt - begun - slideS) / climbS;
      const turn = from + 4 + turns * climbed;
      const top = topAt(stage, topShare * climbed ** 0.85, thrownAt);
      const landsS = (up + Math.sqrt(up * up + 2 * fall * Math.max(0, top.axis.z - floor.z))) / fall;
      if (flown >= landsS + ROLLS_S) continue;
      const away = top.radius * out;
      const speed = cell * (2.2 + 2.6 * scatter(thing, salt + 73));
      const wayX = Math.cos(turn) * 0.6 - Math.sin(turn) * 0.8;
      const wayY = Math.sin(turn) * 0.6 + Math.cos(turn) * 0.8;
      const inAir = Math.min(flown, landsS);
      const drifted = (speed * (1 - Math.exp(-1.2 * inAir))) / 1.2;
      const rolled = flown > landsS ? (speed * 0.3 * (1 - Math.exp(-5 * (flown - landsS)))) / 5 : 0;
      const high = Math.max(0, top.axis.z - floor.z + up * inAir - 0.5 * fall * inAir * inAir);
      const landed = flown >= landsS;
      middle = { ...funnel.axisAt(Math.min(1, high / Math.max(funnel.tall, 1))), z: floor.z + high };
      pose = {
        kind,
        at: {
          x: top.axis.x + Math.cos(turn) * away + wayX * (drifted + rolled),
          y: top.axis.y + Math.sin(turn) * away + wayY * (drifted + rolled),
          z: floor.z + high + size * 0.35,
        },
        size,
        turn: landed ? variant + rolled / Math.max(size, 1) : tumble * since + variant,
        tip: landed ? 0 : Math.sin(since * tumble * 0.7 + variant) * 0.9,
        alpha: 1 - within(flown, landsS + ROLLS_S * 0.4, landsS + ROLLS_S),
        variant,
      };
    }
    if (pose.alpha <= 0.01) continue;
    keep(
      debrisRibbon(pose),
      [middle, middle, middle].map((point) => ({ ...point, z: pose.at.z }))
    );
  }
}

/** Where the top of the funnel was at a moment gone by, for what was thrown off it then: its axis there and how wide it was. */
function topAt(stage: Stage, share: number, at: number): { readonly axis: Point; readonly radius: number } {
  const then = funnelOf({ ...stage, seconds: at });
  return { axis: then.axisAt(share), radius: Math.max(then.radiusAt(share), stage.cell * 0.4) };
}

/**
 * A piece caught round a tornado: the dust at its feet is torn off towards the funnel in shreds,
 * billows of it turn about its feet, and leaves are pulled past it into the wind.
 */
function drawCaught(stage: Stage, paint: WindPaint): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const timing = tornadoTimingOf(duration);
  const blowing = Math.min(within(t, 0, 0.3), 1 - within(t, timing.thinsAt, timing.goneAt));
  if (blowing <= 0) return drawn;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const centre = stage.targets.find((target) => target.index === 0) ?? stage.targets[0];
  const dx = (centre?.x ?? stage.x) - stage.x;
  const dy = (centre?.y ?? stage.y) - stage.y;
  const far = Math.hypot(dx, dy);
  const pull = far > 1 ? { x: dx / far, y: dy / far } : { x: 1, y: 0 };
  const side = { x: -pull.y, y: pull.x };
  const salt = (stage.seed % 997) / 97;
  const forward = cell * 0.2;
  for (const pass of [0, 1] as const) {
    for (let wisp = 0; wisp < 6; wisp++) {
      const cycle = (t * (1.3 + 0.6 * scatter(wisp, salt + 81)) + scatter(wisp, salt + 82)) % 1;
      const aside = (scatter(wisp, salt + 83) - 0.5) * cell * 0.9;
      const gone = cycle * cell * 1.3;
      const root = {
        x: floor.x + side.x * aside + pull.x * (gone - cell * 0.4),
        y: floor.y + side.y * aside + pull.y * (gone - cell * 0.4),
        z: floor.z + cell * (0.08 + 0.3 * cycle + 0.3 * scatter(wisp, salt + 84)),
      };
      const heading = { x: pull.x + side.x * 0.3, y: pull.y + side.y * 0.3, z: 0.25 };
      const wide = cell * (0.3 + 0.25 * scatter(wisp, salt + 85)) * (pass === 0 ? 1.2 : 0.85);
      drawn.motes.push(
        flowingMote('wisp', root, heading, wide, wide * 2.6, t * 4 + wisp * 2.3, {
          color: pass === 0 ? paint.dustDeep : paint.dust,
          core: pass === 0 ? undefined : mixColor(paint.dust, '#ffffff', 0.5),
          alpha: 0.5 * blowing * Math.sin(Math.PI * cycle) ** 0.6,
          forward,
          variant: wisp * 1.3,
        })
      );
    }
  }
  for (let puff = 0; puff < 6; puff++) {
    const turn = t * 6 + puff * 1.05;
    const out = cell * (0.3 + (puff % 3) * 0.12);
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * (0.12 + (puff % 4) * 0.1),
    };
    drawn.motes.push(smokePuff(at, cell * 0.32, puff % 2 ? paint.dust : paint.dustDeep, 0.4 * blowing, forward));
  }
  for (let leaf = 0; leaf < 4; leaf++) {
    const cycle = (t * (0.9 + 0.5 * scatter(leaf, salt + 86)) + scatter(leaf, salt + 87)) % 1;
    const aside = (scatter(leaf, salt + 88) - 0.5) * cell * 1.2;
    const gone = (cycle - 0.35) * Math.min(far * 0.6, cell * 2.6);
    const turn = t * (8 + 5 * scatter(leaf, salt + 89)) + leaf;
    layRibbons(drawn, [
      debrisRibbon({
        kind: 'leaf',
        at: {
          x: floor.x + side.x * aside * (1 - cycle) + pull.x * gone,
          y: floor.y + side.y * aside * (1 - cycle) + pull.y * gone,
          z: floor.z + cell * (0.15 + 0.9 * cycle * cycle + 0.1 * Math.sin(turn)),
        },
        size: cell * (0.16 + 0.08 * scatter(leaf, salt + 90)),
        turn,
        tip: Math.sin(turn * 0.7) * 0.8,
        alpha: blowing * Math.sin(Math.PI * cycle) ** 0.5,
        variant: leaf + stage.index,
      }),
    ]);
  }
  return drawn;
}

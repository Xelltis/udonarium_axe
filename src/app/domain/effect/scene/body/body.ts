import { bloodOf, drawDrops, type Drop, flungDrops } from '@axe/domain/effect/scene/body/blood';
import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { floorMark, haze, keptFor, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { drawStar, type StarSpike, starSpikes, strikeFrameOf } from '@axe/domain/effect/scene/strike/strike-parts';

/*
 * Blood bursting from a wound, as a piece is struck down. For the instant of the blow a splash of red
 * bursts out of the wound, longest away from the one who struck; a spray of drops is flung out after
 * it, most of it the same way, and falls, each drop splashing where it lands and leaving a splat; jets
 * pulse out of the wound the same way, each thinner, and a pool spreads under the piece.
 */

/** How long the splash of the blow lasts, in seconds. */
const SPLASH_S = 0.16;

const thrownByStage = new Map<string, { readonly drops: readonly Drop[]; readonly splash: readonly StarSpike[] }>();

/** Blood bursting from a wound: see the head of this file. */
export const gore: Choreography = {
  lingerS: 1.4,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const blood = bloodOf(ramp);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const wound = { x: stage.x, y: stage.y, z: stage.z + cell * 0.6 };
    const { way } = strikeFrameOf(stage);
    const ends = duration + 1.4;
    const fade = 1 - within(t, ends - 0.6, ends);
    const forward = cell * 0.5;
    const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        drops: [
          ...flungDrops(th, wound, th.count(40), 0, 0.05, 1, { away: way, lean: 0.9 }),
          ...flungDrops(th, wound, th.count(24), 0.15, duration * 0.6, 0.6, { away: way, lean: 0.6 }),
        ],
        splash: starSpikes(9, { ...way, z: 0.2 }, 0.75, stage.seed),
      };
    });
    const pooling = outCubic(within(t, 0.1, duration));
    drawn.floor.push(
      floorMark(
        'scorch',
        floor,
        cell * (0.3 + 0.55 * pooling),
        1,
        blood[0],
        0.75 * fade,
        'color',
        (stage.seed % 89) + 1
      )
    );
    drawn.floor.push(
      floorMark('scorch', floor, cell * (0.2 + 0.4 * pooling), 1, blood[1], 0.6 * fade, 'color', (stage.seed % 61) + 7)
    );
    const landsAt = stage.blowsAt[0] ?? 0;
    const since = t - landsAt;
    if (since >= 0 && since < SPLASH_S) {
      const open = 1 - Math.pow(since / SPLASH_S, 2);
      const tones = {
        rim: mixColor(blood[0], '#000000', 0.65),
        body: blood[1],
        pale: blood[2],
        hot: blood[2],
        glow: blood[2],
      };
      drawStar(drawn, wound, cell * 0.8, thrown.splash, tones, open, forward, blood[2]);
      drawn.motes.push(haze(wound, cell * (0.9 + since * 3), blood[1], 0.7 * open, forward - 1));
    }
    const toward = Math.atan2(way.y, way.x);
    for (let pulse = 0; pulse < 3; pulse++) {
      const born = 0.12 + pulse * 0.28;
      const local = within(t, born, born + 0.35);
      if (local <= 0 || local >= 1) continue;
      const angle = toward + ((stage.seed % 7) / 7 - 0.5) * 0.9 + (pulse - 1) * 0.5;
      const reach = cell * (1.1 - pulse * 0.2) * outCubic(local);
      const lean = { x: Math.cos(angle), y: Math.sin(angle) };
      const points = Array.from({ length: 7 }, (_unused, index) => {
        const share = index / 6;
        return {
          x: wound.x + lean.x * reach * share,
          y: wound.y + lean.y * reach * share,
          z: wound.z + reach * share * 0.6 - reach * share * share * 0.9,
        };
      });
      drawn.ribbons.push({
        points,
        widths: points.map((_point, index) => cell * (0.18 - pulse * 0.03) * (1 - index / 7)),
        color: blood[1],
        core: blood[2],
        alpha: 1 - local,
        blend: 'color',
      });
    }
    drawDrops(drawn, thrown.drops, t, cell, blood, fade, forward);
    return drawn;
  },
};

import type { SwordPaint } from '@axe/domain/effect/scene/blade/sword-paint';
import { alongTorrent, type SwordPose } from '@axe/domain/effect/scene/blade/sword-pose';
import { type TorrentLook, torrentWidthAt } from '@axe/domain/effect/scene/blade/sword-torrent';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { DUST } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, lightningPaths, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/storm/lightning';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { drawWindTorrent } from '@axe/domain/effect/scene/wind/wind-sword';

/*
 * What the torrent of a great sword carries, by its element, so that each is its own substance in a
 * still: flames roaring up off a torrent of fire and embers flung from it; shards and flakes of ice
 * tumbling down a torrent of freezing wind; bolts forking off a torrent of lightning and one running
 * jagged down its heart; stones and dust thrown up by a torrent of earth; black flames and smoke
 * boiling off a torrent of shadow; stars and feathers of light borne along a torrent of light; and
 * a torrent of wind a cyclone laid on its side.
 */

/** A place in the torrent a share of the way along what there is of it, a share of its width aside and up from its middle. */
function inTorrent(pose: SwordPose, look: TorrentLook, share: number, aside: number, lift: number) {
  const by = look.tail + (look.head - look.tail) * share;
  const wide = torrentWidthAt(pose, look, by);
  const middle = alongTorrent(pose, by);
  const at: Point = {
    x: middle.x - pose.way.y * aside * wide,
    y: middle.y + pose.way.x * aside * wide,
    z: Math.max(pose.floorZ + pose.cell * 0.04, middle.z + lift * wide),
  };
  return { at, wide };
}

/** Draws what the torrent carries at a moment; see the head of this file. */
export function drawTorrentElement(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: TorrentLook): void {
  const U = pose.cell;
  const { since, seed } = look;
  const alpha = look.alpha;
  if (look.head - look.tail < U * 0.4 || alpha <= 0.01) return;
  const forward = U * 0.35;
  const way = { x: pose.way.x, y: pose.way.y, z: 0 };
  const each = (count: number, every: number, draw: (index: number, age: number, share: number) => void) => {
    for (let index = 0; index < count; index++) {
      const age = (since / every + scatter(index, seed + 31)) % 1;
      draw(index, age, (scatter(index, seed + 32) + since * 0.9) % 1);
    }
  };
  const seen = (age: number) => Math.min(1, age * 6, (1 - age) * 2.5) * alpha;
  switch (paint.element) {
    case 'fire':
      each(16, 0.42, (index, age, share) => {
        const { at, wide } = inTorrent(pose, look, share, (scatter(index, 3) - 0.5) * 0.5, 0.3);
        if (wide < U * 0.3) return;
        drawn.motes.push(
          flowingMote(
            'lick',
            at,
            { x: way.x * 0.7, y: way.y * 0.7, z: 1 },
            U * (0.5 + 0.25 * (index % 3)) * (1 - 0.4 * age),
            U * (0.8 + 1.3 * age),
            since * 5 + index,
            {
              color: index % 3 === 0 ? paint.body : paint.sheath,
              core: index % 3 === 0 ? paint.inner : paint.body,
              alpha: seen(age),
              forward,
              variant: index,
            }
          )
        );
      });
      each(14, 0.5, (index, age, share) => {
        const { at } = inTorrent(pose, look, share, scatter(index, 4) - 0.5, 0.2);
        const up = U * (1.5 + 2 * scatter(index, 5));
        drawn.motes.push({
          ...glow(
            { ...at, z: at.z + up * age * (1 - 0.4 * age) },
            U * 0.07,
            index % 2 === 0 ? paint.inner : paint.body,
            seen(age),
            forward
          ),
          shape: 'spark',
          velocity: { x: way.x * U * 6, y: way.y * U * 6, z: up * (1 - age) },
          trail: 0.03,
        });
      });
      return;
    case 'ice':
      each(5, 0.6, (index, age, share) => {
        const { at, wide } = inTorrent(pose, look, share * 0.7, 0, 0);
        if (wide < U * 0.3) return;
        drawn.motes.push(
          flowingMote('gust', at, way, wide * 1.15, U * (2 + 1.5 * age), since * 8 + index, {
            color: '#ffffff',
            alpha: 0.4 * seen(age),
            forward,
            variant: index,
          })
        );
      });
      each(30, 0.36, (index, age, share) => {
        const { at } = inTorrent(pose, look, share, scatter(index, 3) - 0.5, (scatter(index, 4) - 0.4) * 0.8);
        const shard = index % 3 === 0;
        drawn.motes.push({
          ...glow(
            at,
            U * (shard ? 0.3 : 0.13 + 0.06 * (index % 3)),
            index % 2 === 0 ? '#ffffff' : paint.body,
            seen(age),
            forward
          ),
          blend: 'color',
          shape: 'flake',
          spin: since * (9 + (index % 5)) + index,
          variant: index,
        });
      });
      return;
    case 'thunder': {
      const flicker = Math.floor(since * 22);
      const spine = Array.from({ length: 4 }, (_unused, joint) => inTorrent(pose, look, 0.04 + joint * 0.3, 0, 0).at);
      for (let joint = 0; joint < 3; joint++) {
        const { main } = lightningPaths(spine[joint], spine[joint + 1], seed + joint, flicker, {
          bends: 8,
          jag: 0.09,
          forks: 0,
        });
        drawn.ribbons.push(
          { points: main, widths: U * 0.3, color: paint.sheath, alpha: 0.5 * alpha, blend: 'light', soft: 1 },
          { points: main, widths: U * 0.1, color: paint.body, core: '#ffffff', alpha, blend: 'color' }
        );
      }
      for (let bolt = 0; bolt < 6; bolt++) {
        const share = scatter(flicker * 5 + bolt, seed + 3);
        const { at, wide } = inTorrent(pose, look, share, 0, 0.1);
        if (wide < U * 0.3) continue;
        const out = (bolt % 2 === 0 ? 1 : -1) * U * (1 + 1.3 * scatter(flicker + bolt, 5));
        const to = {
          x: at.x - pose.way.y * out + pose.way.x * U * 0.8,
          y: at.y + pose.way.x * out + pose.way.y * U * 0.8,
          z: bolt % 3 === 0 ? pose.floorZ : at.z + U * (0.4 + 1.4 * scatter(flicker + bolt, 7)),
        };
        drawn.ribbons.push(
          ...lightningRibbons(at, to, seed + bolt * 31, flicker, U, paint.ramp, 0.9 * alpha, pose.floorZ, 0.9)
        );
      }
      return;
    }
    case 'earth':
      each(22, 0.5, (index, age, share) => {
        const { at } = inTorrent(pose, look, share, (scatter(index, 3) - 0.5) * 0.9, -0.3);
        const up = U * (1.2 + 2.2 * scatter(index, 5));
        drawn.motes.push({
          x: at.x + way.x * U * 1.5 * age,
          y: at.y + way.y * U * 1.5 * age,
          z: pose.floorZ + up * 4 * age * (1 - age) + U * 0.05,
          size: U * (0.1 + 0.1 * scatter(index, 6)),
          color: index % 2 === 0 ? paint.ramp[1] : '#5b4a3c',
          alpha: Math.min(1, (1 - age) * 4) * alpha,
          blend: 'color',
          shape: 'chunk',
          spin: since * 11 + index,
          variant: index,
          forward,
        });
      });
      each(10, 0.7, (index, age, share) => {
        const { at, wide } = inTorrent(pose, look, share, (index % 2 === 0 ? 1 : -1) * 0.45, -0.25);
        drawn.motes.push(
          smokePuff(
            { ...at, z: at.z + U * 0.5 * age },
            wide * (0.5 + 0.6 * age),
            mixColor(DUST, paint.ramp[2], 0.2),
            0.5 * seen(age),
            forward
          )
        );
      });
      return;
    case 'wind':
      drawWindTorrent(drawn, pose, paint, look);
      return;
    case 'dark':
      each(16, 0.5, (index, age, share) => {
        const { at, wide } = inTorrent(pose, look, share, (scatter(index, 3) - 0.5) * 0.5, 0.25);
        if (wide < U * 0.3) return;
        drawn.motes.push(
          flowingMote(
            'lick',
            at,
            { x: way.x * 0.8, y: way.y * 0.8, z: 0.9 },
            U * (0.5 + 0.22 * (index % 3)) * (1 - 0.4 * age),
            U * (0.8 + 1.2 * age),
            since * 4 + index,
            {
              color: index % 3 === 0 ? paint.sheath : paint.inner,
              core: index % 3 === 0 ? paint.inner : paint.heart,
              alpha: seen(age),
              forward,
              variant: index,
            }
          )
        );
      });
      each(9, 0.8, (index, age, share) => {
        const { at, wide } = inTorrent(pose, look, share, (index % 2 === 0 ? 1 : -1) * 0.5, 0.2);
        drawn.motes.push(
          smokePuff(
            { ...at, z: at.z + U * 0.6 * age },
            wide * (0.45 + 0.5 * age),
            paint.inner,
            0.55 * seen(age),
            forward
          )
        );
      });
      return;
    default:
      each(16, 0.45, (index, age, share) => {
        const { at } = inTorrent(pose, look, share, scatter(index, 3) - 0.5, (scatter(index, 4) - 0.3) * 0.9);
        drawn.motes.push({
          ...glow(at, U * (0.3 + 0.3 * scatter(index, 6)) * Math.sin(Math.PI * age), '#ffffff', seen(age), forward),
          shape: 'star',
          spin: since * 3 + index,
        });
      });
      each(9, 0.6, (index, age, share) => {
        const { at } = inTorrent(pose, look, share, scatter(index, 3) - 0.5, 0.3 + 0.5 * age);
        drawn.motes.push({
          ...at,
          size: U * (0.34 + 0.14 * scatter(index, 8)),
          color: index % 2 === 0 ? '#fffaf0' : paint.inner,
          alpha: 0.95 * seen(age),
          blend: 'color',
          shape: 'feather',
          spin: since * 6 + index,
          forward,
        });
      });
  }
}

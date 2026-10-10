import { PERF_PARTICLES, perfCounters } from '@axe/core/util/perf-counters';
import { EffectParticle, EffectParticleLayer } from '@axe/domain/effect/effect-particles';
import { particleTexture } from '@axe/features/effect/effect-canvas/particle-texture';

/**
 * Draws the particles onto a canvas.
 *
 * The smoke goes down plainly first and the glowing particles are laid over it additively.
 * The blending stays inside the canvas, so the depth of the board is untouched.
 */
export type TextureProvider = (shape: EffectParticle['shape'], color: string) => CanvasImageSource | null;

/**
 * Clears the canvas and draws one frame of a particle layer at the given pixel ratio.
 *
 * Smoke and chunks are painted normally first, and every other shape is added over them with
 * additive blending. Textures come from the shared particle texture cache unless another provider
 * is passed; a particle whose texture cannot be made is skipped.
 */
export function drawParticleLayer(
  context: CanvasRenderingContext2D,
  layer: EffectParticleLayer,
  pixelRatio: number,
  textureOf: TextureProvider = particleTexture
): void {
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, layer.width, layer.height);
  perfCounters.add(PERF_PARTICLES, layer.particles.length);

  // It walks the list twice; sorting into arrays first would throw seven hundred holders away every frame for a single sheet of weather.
  context.globalCompositeOperation = 'source-over';
  for (const particle of layer.particles) {
    if (isSolid(particle)) drawParticle(context, layer, particle, textureOf);
  }

  context.globalCompositeOperation = 'lighter';
  for (const particle of layer.particles) {
    if (!isSolid(particle)) drawParticle(context, layer, particle, textureOf);
  }

  context.globalCompositeOperation = 'source-over';
  context.globalAlpha = 1;
}

function isSolid(particle: EffectParticle): boolean {
  return particle.shape === 'smoke' || particle.shape === 'chunk';
}

function drawParticle(
  context: CanvasRenderingContext2D,
  layer: EffectParticleLayer,
  particle: EffectParticle,
  textureOf: TextureProvider
): void {
  if (particle.alpha <= 0.004 || particle.size <= 0) return;

  const texture = textureOf(particle.shape, particle.color);
  if (!texture) return;

  const width = particle.size * (particle.shape === 'streak' ? particle.stretch : 1);
  const height = particle.size * (particle.shape === 'streak' ? 1 : particle.stretch);

  context.globalAlpha = Math.min(particle.alpha, 1);
  context.translate(layer.originX + particle.x, layer.originY + particle.y);
  if (particle.angle !== 0) context.rotate(particle.angle);
  context.drawImage(texture, -width / 2, -height / 2, width, height);
  if (particle.angle !== 0) context.rotate(-particle.angle);
  context.translate(-(layer.originX + particle.x), -(layer.originY + particle.y));
}

export const LIGHT_IMAGE_TAG = '光源';

export const LIGHT_SKIN_IDS = [
  'light_campfire',
  'light_torch',
  'light_sconce',
  'light_lamp',
  'light_stand',
  'light_brazier',
  'light_lantern',
  'light_candle',
  'light_chandelier',
  'light_neon',
  'light_streetlamp',
  'light_fluorescent',
  'light_neon_pole',
] as const;

export type LightSkinId = (typeof LIGHT_SKIN_IDS)[number];

export const LIGHT_SKIN_ASSET_URLS: Record<LightSkinId, string> = {
  light_campfire: 'assets/images/lights/light_campfire.webp',
  light_torch: 'assets/images/lights/light_torch.webp',
  light_sconce: 'assets/images/lights/light_sconce.webp',
  light_lamp: 'assets/images/lights/light_lamp.webp',
  light_stand: 'assets/images/lights/light_stand.webp',
  light_brazier: 'assets/images/lights/light_brazier.webp',
  light_lantern: 'assets/images/lights/light_lantern.webp',
  light_candle: 'assets/images/lights/light_candle.webp',
  light_chandelier: 'assets/images/lights/light_chandelier.webp',
  light_neon: 'assets/images/lights/light_neon.webp',
  light_streetlamp: 'assets/images/lights/light_streetlamp.webp',
  light_fluorescent: 'assets/images/lights/light_fluorescent.webp',
  light_neon_pole: 'assets/images/lights/light_neon_pole.webp',
};

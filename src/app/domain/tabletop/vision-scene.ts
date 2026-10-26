/**
 * The scene the dark, the fog and the lights are worked out from, and what is worked out of it.
 *
 * It is kept in parts under vision-scene/, by what each works out; this file names what the rest of
 * the app may use of them.
 */
export { isLit, isSnuffed, lightLevelAt, lightReaches } from '@axe/domain/tabletop/vision-scene/light-reach';
export {
  computeLightBeam,
  computeLightGlow,
  floorRadii,
  lightAxis,
  lightFloorPool,
  seesInDark,
  withinCone,
} from '@axe/domain/tabletop/vision-scene/light-shape';
export { computeOverlayPlan } from '@axe/domain/tabletop/vision-scene/overlay-plan';
export { sameOverlayPlan, sameOverlayVision } from '@axe/domain/tabletop/vision-scene/sameness';
export type {
  LightBeam,
  LightGlow,
  LightSegment,
  OverlayPlan,
  OverlayShape,
  OverlayVision,
  SceneBrightness,
  SceneLight,
  SceneViewer,
  SceneVisionSource,
  ShadowCaster,
  ShadowShape,
  VisionScene,
  WallFace,
  WallLight,
  WallSilhouette,
} from '@axe/domain/tabletop/vision-scene/scene-model';
export { EYE_HEIGHT_CELLS, eyeHeightPx } from '@axe/domain/tabletop/vision-scene/scene-model';
export { ownedSources, viewerOwns, viewerShares } from '@axe/domain/tabletop/vision-scene/viewer';
export {
  darknessAlphaFor,
  isPointVisible,
  isPointVisibleFrom,
  objectBrightnessFor,
  objectLightLevel,
} from '@axe/domain/tabletop/vision-scene/visibility';
export { computeWallLights, computeWallSilhouettes } from '@axe/domain/tabletop/vision-scene/wall-light';

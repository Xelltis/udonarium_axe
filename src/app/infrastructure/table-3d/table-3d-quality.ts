/** How much a seat's screen spends on drawing the table. */
export type Table3dQuality = 'high' | 'standard' | 'light';

/** A seat's own choice: one of the qualities, or left to the screen. */
export type Table3dQualitySetting = Table3dQuality | 'auto';

/** The choices a seat has, in the order they are offered. */
export const TABLE_3D_QUALITY_SETTINGS: readonly Table3dQualitySetting[] = ['auto', 'high', 'standard', 'light'];

/** What each quality draws. */
export interface Table3dQualityPlan {
  /** How many lights at most cast shadows; the rest light without them. */
  readonly shadowedLights: number;
  /** Whether the sun and the moon throw shadows. */
  readonly skyShadows: boolean;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  readonly antialias: 'smaa' | 'fxaa' | 'none';
}

export const TABLE_3D_QUALITY: Readonly<Record<Table3dQuality, Table3dQualityPlan>> = {
  high: { shadowedLights: 4, skyShadows: true, ambientOcclusion: true, bloom: true, antialias: 'smaa' },
  standard: { shadowedLights: 2, skyShadows: true, ambientOcclusion: false, bloom: true, antialias: 'fxaa' },
  light: { shadowedLights: 0, skyShadows: false, ambientOcclusion: false, bloom: false, antialias: 'none' },
};

/**
 * The quality a seat's table is drawn at: the one chosen, or left to the screen, light where the
 * seat has asked the table to be drawn lightly, high where a graphics card draws it, and standard
 * elsewhere. A screen found to have no graphics card is not turned down below standard by itself.
 */
export function table3dQualityOf(
  setting: Table3dQualitySetting,
  drawnLightly: boolean,
  graphicsCard = false
): Table3dQuality {
  if (setting !== 'auto') return setting;
  if (drawnLightly) return 'light';
  return graphicsCard ? 'high' : 'standard';
}

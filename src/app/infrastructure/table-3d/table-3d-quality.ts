/** How much a seat's screen spends on drawing the table. */
export type Table3dQuality = 'high' | 'standard' | 'light';

/** A seat's own choice: one of the qualities, or left to the screen. */
export type Table3dQualitySetting = Table3dQuality | 'auto';

/** What each quality draws. */
export interface Table3dQualityPlan {
  /** How many lights at most cast shadows; the rest light without them. */
  readonly shadowedLights: number;
  readonly ambientOcclusion: boolean;
  readonly bloom: boolean;
  readonly antialias: 'smaa' | 'fxaa' | 'none';
}

export const TABLE_3D_QUALITY: Readonly<Record<Table3dQuality, Table3dQualityPlan>> = {
  high: { shadowedLights: 4, ambientOcclusion: true, bloom: true, antialias: 'smaa' },
  standard: { shadowedLights: 2, ambientOcclusion: false, bloom: true, antialias: 'fxaa' },
  light: { shadowedLights: 0, ambientOcclusion: false, bloom: false, antialias: 'none' },
};

/**
 * The quality a seat's table is drawn at: the one chosen, or left to the screen, light where the
 * seat has asked the table to be drawn lightly and standard elsewhere. A screen found to have no
 * graphics card is not turned down by itself.
 */
export function table3dQualityOf(setting: Table3dQualitySetting, drawnLightly: boolean): Table3dQuality {
  if (setting !== 'auto') return setting;
  return drawnLightly ? 'light' : 'standard';
}

import type { FieldAtmosphereId, FieldPropId } from '@axe/domain/tabletop/field/field-atmosphere';

/** The 3D models bundled with the app that open country can be stood with. */
export const FIELD_MODEL_IDS = [
  'tree_oak',
  'tree_beech',
  'tree_birch',
  'tree_poplar',
  'tree_willow',
  'tree_pine',
  'tree_dead',
  'tree_fir',
  'tree_spruce',
  'tree_oakAutumn',
  'tree_beechAutumn',
  'tree_birchAutumn',
  'tree_oakBare',
  'tree_birchBare',
  'tree_cherry',
  'tree_maple',
  'tree_ginkgo',
  'tree_mangrove',
  'tree_snowFir',
  'tree_snowSpruce',
  'tree_giant',
  'bush_round',
  'bush_wide',
  'bush_leafy',
  'rock_boulder',
  'rock_angular',
  'rock_slab',
  'rock_outcrop',
] as const;

export type FieldModelId = (typeof FIELD_MODEL_IDS)[number];

/** Where a bundled model's bytes are served from, beside the page. */
export function fieldModelUrl(id: FieldModelId): string {
  return `assets/models/nature/${id}.glb`;
}

/**
 * The bundled models each standing thing of open country may be drawn as, one of which is chosen
 * for each by where it stands. A thing with none is built of its blocks as ever.
 */
export const FIELD_PROP_MODELS: Readonly<Partial<Record<FieldPropId, readonly FieldModelId[]>>> = {
  tree: ['tree_oak', 'tree_beech', 'tree_birch', 'tree_fir', 'tree_spruce'],
  streetTree: ['tree_beech', 'tree_poplar', 'tree_birch'],
  bush: ['bush_round', 'bush_wide', 'bush_leafy'],
  boulder: ['rock_boulder', 'rock_angular', 'rock_slab'],
  outcrop: ['rock_outcrop'],
  giantTree: ['tree_giant'],
};

/**
 * The trees a mood of open country grows in place of those of a wood: the broadleaves of open
 * grassland, the willows and dead trees of a marsh, the evergreens of snow.
 */
export const FIELD_MOOD_PROP_MODELS: Readonly<
  Partial<Record<FieldAtmosphereId, Readonly<Partial<Record<FieldPropId, readonly FieldModelId[]>>>>>
> = {
  meadow: { tree: ['tree_oak', 'tree_beech', 'tree_poplar', 'tree_birch'] },
  marsh: { tree: ['tree_willow', 'tree_mangrove', 'tree_birch', 'tree_dead'] },
  snowfield: { tree: ['tree_snowFir', 'tree_snowSpruce', 'tree_snowFir', 'tree_birchBare', 'tree_dead'] },
};

/** The seasons open country may be grown in; the first, none in particular, grows it as in summer. */
export const FIELD_SEASONS = ['', 'spring', 'summer', 'autumn', 'winter'] as const;

export type FieldSeason = (typeof FIELD_SEASONS)[number];

/**
 * How a season changes the trees: those it turns into others, and those it grows among them where
 * there are trees it turns. Spring brings the cherries into flower; autumn turns the broadleaves and
 * grows maples and ginkgoes; winter strips the broadleaves bare and lays snow on the evergreens.
 */
const SEASON_TREES: Readonly<
  Partial<Record<FieldSeason, { turns: Partial<Record<FieldModelId, FieldModelId>>; joins: readonly FieldModelId[] }>>
> = {
  spring: { turns: {}, joins: ['tree_cherry', 'tree_cherry'] },
  autumn: {
    turns: { tree_oak: 'tree_oakAutumn', tree_beech: 'tree_beechAutumn', tree_birch: 'tree_birchAutumn' },
    joins: ['tree_maple', 'tree_ginkgo'],
  },
  winter: {
    turns: {
      tree_oak: 'tree_oakBare',
      tree_beech: 'tree_oakBare',
      tree_birch: 'tree_birchBare',
      tree_poplar: 'tree_birchBare',
      tree_willow: 'tree_dead',
      tree_mangrove: 'tree_dead',
      tree_fir: 'tree_snowFir',
      tree_spruce: 'tree_snowSpruce',
    },
    joins: [],
  },
};

/** The broadleaves a season turns or grows among: what spring's cherries and autumn's maples grow among. */
const BROADLEAVES: readonly FieldModelId[] = ['tree_oak', 'tree_beech', 'tree_birch', 'tree_poplar'];

/** The models a thing is drawn as in a season: as listed, turned by it, with what it grows among broadleaves. */
export function seasonModels(models: readonly FieldModelId[], season: FieldSeason): readonly FieldModelId[] {
  const change = SEASON_TREES[season];
  if (!change) return models;
  const turned = models.map((model) => change.turns[model] ?? model);
  return models.some((model) => BROADLEAVES.includes(model)) ? [...turned, ...change.joins] : turned;
}

/** How many cells across a stand of one kind of tree grows, before the next may be of another kind. */
const GROVE_CELLS = 6;

/**
 * How large each bundled model is as it was made, the box round it, in its own units: across, the
 * wider of its two sides, and tall. Read once off the files, which a spec holds them to.
 */
export const FIELD_MODEL_SIZES: Readonly<Record<FieldModelId, { readonly across: number; readonly tall: number }>> = {
  tree_oak: { across: 11.1336, tall: 15.1729 },
  tree_beech: { across: 10.1713, tall: 16.6659 },
  tree_birch: { across: 8.6392, tall: 15.4307 },
  tree_poplar: { across: 4.2466, tall: 18.4372 },
  tree_willow: { across: 7.8655, tall: 10.0769 },
  tree_pine: { across: 10.7923, tall: 18.3302 },
  tree_dead: { across: 8.3995, tall: 11.1466 },
  tree_fir: { across: 8.226, tall: 13.998 },
  tree_spruce: { across: 7.3256, tall: 12.995 },
  tree_oakAutumn: { across: 11.1336, tall: 15.1729 },
  tree_beechAutumn: { across: 10.1713, tall: 16.6659 },
  tree_birchAutumn: { across: 8.6392, tall: 15.4307 },
  tree_oakBare: { across: 8.6863, tall: 14.346 },
  tree_birchBare: { across: 6.1403, tall: 14.6008 },
  tree_cherry: { across: 8.2252, tall: 11.6052 },
  tree_maple: { across: 7.6517, tall: 9.416 },
  tree_ginkgo: { across: 10.6732, tall: 17.2179 },
  tree_mangrove: { across: 7.4, tall: 9.3479 },
  tree_snowFir: { across: 8.226, tall: 13.998 },
  tree_snowSpruce: { across: 7.3256, tall: 12.995 },
  tree_giant: { across: 22.9355, tall: 21.3551 },
  bush_round: { across: 1.848, tall: 1.0804 },
  bush_wide: { across: 2.3952, tall: 1.6323 },
  bush_leafy: { across: 2.1843, tall: 1.2968 },
  rock_boulder: { across: 1.3556, tall: 0.7302 },
  rock_angular: { across: 1.1457, tall: 0.6974 },
  rock_slab: { across: 1.3424, tall: 0.5183 },
  rock_outcrop: { across: 1.2821, tall: 1.064 },
};

/**
 * How wide and how tall a bundled model is drawn, in cells, to stand as large as it may within a box
 * so many cells across and so many tall: as the table draws a model, the box's narrower measure for
 * the model setting how large it is.
 */
export function fieldModelDrawnSize(
  model: FieldModelId,
  acrossCells: number,
  tallCells: number
): { readonly across: number; readonly tall: number } {
  const size = FIELD_MODEL_SIZES[model];
  const fitted = Math.min(acrossCells / size.across, tallCells / size.tall);
  return { across: fitted * size.across, tall: fitted * size.tall };
}

/**
 * Which of a thing's models stands at a cell, the same for the same field each time: those its mood
 * grows, or else those of a wood, as the season has them. Most cells take the kind of the stand they lie in, so that trees of
 * a kind grow together; one in four takes a kind of its own.
 */
export function fieldModelAt(
  prop: FieldPropId,
  x: number,
  y: number,
  seed: number,
  mood?: FieldAtmosphereId,
  season: FieldSeason = ''
): FieldModelId | null {
  const listed = (mood && FIELD_MOOD_PROP_MODELS[mood]?.[prop]) || FIELD_PROP_MODELS[prop];
  if (!listed?.length) return null;
  const models = seasonModels(listed, season);
  const own = mixed(x, y, seed);
  const stand = mixed(Math.floor(x / GROVE_CELLS), Math.floor(y / GROVE_CELLS), seed + 1);
  return models[(own % 4 === 0 ? own >>> 2 : stand) % models.length];
}

function mixed(x: number, y: number, seed: number): number {
  return Math.imul(x * 73856093 + y * 19349663 + seed, 2654435761) >>> 0;
}

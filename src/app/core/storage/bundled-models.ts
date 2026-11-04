/**
 * The 3D models bundled with the app that the sample room's pieces are drawn as, each by the
 * SHA-256 of its bytes, which is what a piece names its model by. Every seat reads them from beside
 * its own page, so they are never traded between peers, put up to a room's server or saved with a
 * room.
 */
export const BUNDLED_PIECE_MODELS = {
  archer: '042c3c29c0a06d57320b124b7eee418ed0b6d8bb9fe3c85fd912ffb7670f9b33',
  dragon: 'ecbf0a148d84f43031502689ca8f28df2159a5be1c376f697c0c6c930805d72a',
  goblin: '97d3d57f20f20e5ef3c4993c5d68b5c4ad5fb594373567536bf459b7706daeca',
  golem: '1e60d58f3b80a89fa6f4f601d60b0a1470b54c4189cea5e08eaaf13a727ce69a',
  knight: '442259934e6edc4b52d1a3e57b1670e04439a6cfa8d3363bc6e3e9476bde46f1',
  orc: '4c01bcef4e4672dd0bef0f119584f010f346f452509e3271dd781b9ad9414219',
  thief: '605b0eb2b28c0654b57acda2d25a5fbf0b23d41a69b10a830853754857b8edc7',
  warrior: 'e3b14996ade47c1c6a02da866e3528317c785f29283c66e5d1411ec9e6417f56',
  wizard: '683f7e41b37848e0fac919aef75c37881f986e4a739282087b5a298c60288650',
} as const;

export type BundledPieceModel = keyof typeof BUNDLED_PIECE_MODELS;

const BUNDLED_BY_IDENTIFIER: ReadonlyMap<string, BundledPieceModel> = new Map(
  Object.entries(BUNDLED_PIECE_MODELS).map(([name, identifier]) => [identifier, name as BundledPieceModel])
);

/** Whether a model is one bundled with the app, which every seat reads from beside its own page. */
export function isBundledModel(identifier: string): boolean {
  return BUNDLED_BY_IDENTIFIER.has(identifier);
}

/** The name of a bundled model, which its file is named by, or null for a model not bundled. */
export function bundledModelName(identifier: string): BundledPieceModel | null {
  return BUNDLED_BY_IDENTIFIER.get(identifier) ?? null;
}

/** Where a bundled model's bytes are served from, beside the page. */
export function bundledModelUrl(name: BundledPieceModel): string {
  return `assets/models/pieces/${name}.glb`;
}

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

/** Where the bytes of a model bundled for pieces are served from, beside the page. */
export function bundledPieceModelUrl(name: BundledPieceModel): string {
  return `assets/models/pieces/${name}.glb`;
}

/**
 * The 3D models bundled with the app that blocks are drawn as, read into the room's models by the
 * map editor and the map generator, each by the first `MAP_MODEL_KEY_LENGTH` digits of the SHA-256 of
 * its bytes: the bytes bundled now first, then those bundled before, which a room saved then still
 * holds. Unlike the pieces' models they are traded and kept as any other, but they are the app's
 * own, so the room cannot remove them. The digits kept, 64 bits of the hash, tell them from any model
 * brought in as surely as the whole hash would, and keep the list small enough to load with the page.
 */
const BUNDLED_MAP_MODELS: Readonly<Record<string, readonly string[]>> = {
  banner: ['df66e10493d43e05'],
  bench: ['eb141564ea43cc1e'],
  bush_leafy: ['57adea4a34f1eb95'],
  bush_round: ['83e6524eba9466cd'],
  bush_wide: ['e83e7df71e2d81f1'],
  cactus_saguaro: ['0086dd56f513b389'],
  cactus_tall: ['ccc52f260f0763d7'],
  cart: ['99fee1e59cdcc241'],
  crop_corn: ['ca521c63eee15732'],
  crop_rice: ['8559bdd1f0a4b674', '59e81a5a0dbf5933'],
  crop_vegetable: ['210e16416ce5c127'],
  crop_wheat: ['5f8c42f157cafd09'],
  door_iron_grate: ['a670a7f46be6ec01'],
  door_saloon: ['03f9ac99dec33ea5'],
  door_shutter: ['a9f7d680398e7d07'],
  door_steel: ['f7498b44a6de9e68'],
  door_stone: ['957d9db6838ef034'],
  door_wood: ['7357a63d5bd04c4d'],
  fountain: ['9c1e040c0955e73d'],
  hay: ['8442e6fc899f9a0b'],
  hearth: ['d24581996261d5df'],
  hide_wall: ['6627da2bbcbd1fce'],
  junk_drums: ['e9abc514db950fae'],
  junk_heap: ['fe7916427ddd2dec'],
  lamp_post: ['a3f70c30878f9940'],
  log_wall: ['e5caf0febc34d1d3'],
  market_stall_cloth: ['9c783d18c105301e'],
  market_stall_fruit: ['0a5e6ad48183c4ea'],
  market_stall_pottery: ['e79eaf2753e24ec1'],
  palisade_spikes: ['a8218a75dfebf5f7'],
  plank_wall: ['2f25069cdea1eded'],
  planter: ['8f08a087bd68c4fc'],
  prop_alchemyTable: ['10fbb0197971199f'],
  prop_altar: ['24099f91fb6ea1ca'],
  prop_anvil: ['2e852a442b55e26b'],
  prop_aquarium: ['8130c2f56f0c7d50'],
  prop_arcadeCabinet: ['26a309dcfba62e4c'],
  prop_backBar: ['af7962968da24c2e'],
  prop_barCounter: ['26adb5b834e2e6f4'],
  prop_barTable: ['374906e2d0a127f9'],
  prop_barrel: ['79fae36752b1620e'],
  prop_bed: ['c67e0d20a32e91ff'],
  prop_bookPile: ['a53700a845c71238'],
  prop_bookshelf: ['0b980ef41826ad9e'],
  prop_boothSofa: ['bca0afe2772dff01'],
  prop_breadOven: ['e44bedac191a2ce0'],
  prop_bunkBed: ['a1a88f63e651c994'],
  prop_candelabra: ['259db2527e2ac722'],
  prop_canopyBed: ['5fee876a255c87f4'],
  prop_cauldron: ['3a7150043048d613'],
  prop_chairWood: ['8262dd7f3bd15af9'],
  prop_chestWood: ['2716a61ab2a8fbba'],
  prop_containerBlue: ['ec2ecaf27fde52c8'],
  prop_containerGreen: ['786872c816131ff0'],
  prop_containerRed: ['4fd6234a063498d8'],
  prop_counter: ['58441d64235dfdd6'],
  prop_crate: ['94843a4d0f99b5f2'],
  prop_crystalPedestal: ['8be09add16ca89a6'],
  prop_cupboard: ['6f21d4d19270fac3'],
  prop_desk: ['3d5ab7d02146b931'],
  prop_drainPipe: ['b5e1b20895f6c64d'],
  prop_executiveDesk: ['4400bde11089c724'],
  prop_fireplace: ['3d13f52fd5e7df2a'],
  prop_flourSacks: ['a8afc83e3a0ff6b8'],
  prop_forge: ['05bb57c5f319d6f5'],
  prop_gamingTable: ['091d679435445b6d'],
  prop_gargoyle: ['5c606e572ec06efb'],
  prop_goodsShelf: ['bea164927f2c33af'],
  prop_jukebox: ['859a002111d50d0a'],
  prop_ladder: ['9cd4ca4e197152b3'],
  prop_lectern: ['a8272a3441fd6b3f'],
  prop_lowTable: ['b0ba8cc404d68db2'],
  prop_magicCircle: ['d44337cf65ed9cec'],
  prop_neonCocktail: ['7ffa490237d8d1ee'],
  prop_neonDice: ['d2237f6b42d07d46'],
  prop_neonHeart: ['51686e9ef92d2c7c'],
  prop_orrery: ['5d44b5f48daa1bcd'],
  prop_pew: ['4352b4a78778c466'],
  prop_pipe: ['f1d2ea6821cc3df3'],
  prop_pipeElbow: ['4049605446395e5a'],
  prop_pipeEnd: ['5b1b01cb26fc79ed'],
  prop_pipeValve: ['118ddc7472a9754e'],
  prop_plant: ['dd42a973a97d4b6a'],
  prop_potionShelf: ['1fc410e83c0737cd'],
  prop_rouletteTable: ['3f6f644bc1603bef'],
  prop_rubble: ['8c90f620fb7f1f2d'],
  prop_safe: ['f95bd17ea55cd4c9'],
  prop_shelfGoods: ['03533105a1ac3943'],
  prop_shopCounter: ['cdbe800bf26d54d7'],
  prop_slotMachine: ['68f2d947bad936ca'],
  prop_speaker: ['40b33a83f693d86f'],
  prop_still: ['8ab161a6654c72d4'],
  prop_stool: ['190e0f3ebf610b52'],
  prop_storageJars: ['6d7c30f0e6b73441'],
  prop_tableWood: ['9f24b294307386c9'],
  prop_tavernCounter: ['f29d4ca50ad2b7d0'],
  prop_telescope: ['52166920f636142a'],
  prop_treasureChest: ['9581af9778e3383a'],
  prop_vendingMachine: ['494ab8cc03207664'],
  prop_wardrobe: ['bb8ab05e9ef8b71e'],
  prop_weaponRack: ['cf1c1b01ebba415a'],
  prop_writingDesk: ['82f66be91c7693ae'],
  rail_fence: ['734df47cb01c814c'],
  rock_angular: ['1f994c6bd7eb9d52'],
  rock_boulder: ['0ef7bb538fb64053'],
  rock_outcrop: ['9d6a5242d6fbc109'],
  rock_slab: ['b94d872185f78a58'],
  roof_plant: ['c0daf83bbb426839'],
  roof_tank: ['91f1ae4fd82e2cd1'],
  sign_bakery: ['fc2abaa9d160dc84'],
  sign_inn: ['6fc6cb23805b6a12'],
  sign_shop: ['9988dafc35ca18e4'],
  sign_smithy: ['8cadb9095345f42e'],
  sign_tavern: ['7b6074078e139834'],
  stone_room_wall: ['59545a82a355865c', 'db9235a1afc8eb5c'],
  stone_tower_round: ['1751b22affb4b6b8'],
  stone_tower_square: ['7388c41bcbd11882'],
  stone_wall_battlement: ['7e67d1be78c8ebfe'],
  timber_frame_wall: ['6bf55d2ee59501d2'],
  totem: ['414d72ef3c5b3438'],
  town_brick: ['346d040d65ff92ff'],
  town_brownstone: ['60946554f3c8065b'],
  town_concrete: ['c94fa87b00a69a8e'],
  town_office: ['dfb14b725d894745'],
  town_sfGlass: ['71207d73daaabc81'],
  town_sfPanel: ['a4a98661f4f41d8d'],
  town_shack: ['d6b7593e403311bb'],
  tree_beech: ['d60c8177cfa04423', '5c2d9096576ef285'],
  tree_beechAutumn: ['32854d8fb27ec4e5'],
  tree_birch: ['d72bdc3adad4db6b', 'c6d2a279e3019c9d'],
  tree_birchAutumn: ['380d13af3daef4ca'],
  tree_birchBare: ['6f11385b8649eb46'],
  tree_cherry: ['cb88745076ac2fc6'],
  tree_dead: ['0c99282573227281', '16a615c0186f4dc0'],
  tree_fir: ['ec12480fbde83569', '81183054e1369cfb'],
  tree_giant: ['34834b6f1ee59a84'],
  tree_ginkgo: ['a8d00c3980049536'],
  tree_mangrove: ['adf802769ab288b1'],
  tree_maple: ['25572a67fb5c6338'],
  tree_oak: ['142698ad0def2e97', 'e6a8e88c6abfcbb7', 'e50260f6012f4f72', 'd7fd8773674928c5'],
  tree_oakAutumn: ['30f9c2c88f62c051'],
  tree_oakBare: ['88f319f7612a3e60'],
  tree_pine: ['5d6ac821664f4ecd', '78cc9c5ca4f5ebfd'],
  tree_poplar: ['6a2062ea1dc73873', 'a7c233506cbd6647'],
  tree_snowFir: ['cf7426c5d7ca47a9'],
  tree_snowSpruce: ['1cbe3a206fc4b0b4'],
  tree_spruce: ['0ed811a8b30d0403', '7bb5107fff26bbfe'],
  tree_willow: ['f82b83ff8c9e7f2f', '8315de8904f0f76b'],
  watchtower_wood: ['a9c6e0e09e84467a', 'c14fadb4be9596d1'],
  watermill: ['c2861bc1a6e12113'],
  well: ['cc10f1eb64ae1dfa'],
  windmill: ['2d90d2865085490e'],
};

/** How many of the first digits of a bundled map model's identifier it is told by. */
const MAP_MODEL_KEY_LENGTH = 16;

/** What a model's identifier is looked up by among the bundled map models: its first digits, where it is a whole hash. */
function mapModelKeyOf(identifier: string): string | null {
  return /^[0-9a-f]{64}$/.test(identifier) ? identifier.slice(0, MAP_MODEL_KEY_LENGTH) : null;
}

const BUNDLED_MAP_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(BUNDLED_MAP_MODELS).flatMap(([name, identifiers]) =>
    identifiers.map((identifier) => [identifier.slice(0, MAP_MODEL_KEY_LENGTH), name] as const)
  )
);

/** Whether a model is one of those bundled with the app that blocks are drawn as, now or before, by its identifier. */
export function isBundledMapModel(identifier: string): boolean {
  const key = mapModelKeyOf(identifier);
  return key !== null && BUNDLED_MAP_NAMES.has(key);
}

/** The name of a bundled model blocks are drawn as, which its file is named by, or null for any other. */
export function bundledMapModelName(identifier: string): string | null {
  const key = mapModelKeyOf(identifier);
  return key === null ? null : (BUNDLED_MAP_NAMES.get(key) ?? null);
}

/**
 * The first digits of the identifiers of the bundled models blocks are drawn as, as bundled now, by
 * name, as their files are named.
 */
export function bundledMapModels(): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(BUNDLED_MAP_MODELS).map(([name, [now]]) => [name, now]));
}

/**
 * Whether a model is the app's own, bundled for pieces or for blocks, which the room can neither
 * remove nor take out of its store.
 */
export function isAppModel(identifier: string): boolean {
  return isBundledModel(identifier) || isBundledMapModel(identifier);
}

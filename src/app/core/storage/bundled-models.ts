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
 * map editor and the map generator, each by the SHA-256 of its bytes: the bytes bundled now first,
 * then those bundled before, which a room saved then still holds. Unlike the pieces' models they are
 * traded and kept as any other, but they are the app's own, so the room cannot remove them.
 */
const BUNDLED_MAP_MODELS: Readonly<Record<string, readonly string[]>> = {
  banner: ['df66e10493d43e05b1c1ddf74d282880ce0f73cec9603ca90eca82c3f374be6b'],
  bench: ['eb141564ea43cc1eb3d17286c9f6f7011baeb9cbcb83aedde5ee3e34546cb0c5'],
  bush_leafy: ['57adea4a34f1eb95ac2f76015e574db153eac9f1e21df022e746f9568f149c09'],
  bush_round: ['83e6524eba9466cd07f236eade08281141d08255bbd8809fb464ca3d136593ac'],
  bush_wide: ['e83e7df71e2d81f1ba401531d9e32e11687beddd942c10095948a17327fcacbd'],
  cactus_saguaro: ['0086dd56f513b389ebf8a29a582e00e02c74469cb3aaa981af2648ac76e3f359'],
  cactus_tall: ['ccc52f260f0763d7ceb709429bdd491aba1a8d7943afe56d0d7b9252724fa8dc'],
  cart: ['99fee1e59cdcc241bab80ce484e8b80852cf0f9ebc1bdae7e12f2b3906a068bb'],
  crop_corn: ['ca521c63eee15732966f4800362264b457a363aa6262a07bc025764a57b2afe1'],
  crop_rice: [
    '8559bdd1f0a4b674d830462c1123a1dd055da007910a7c12056be8a3dc462cac',
    '59e81a5a0dbf5933537ca0338160826fd1fbf75b4820fc70ac6d18015d9f23c3',
  ],
  crop_vegetable: ['210e16416ce5c127e164c5940424332cfdccbca15cd8f78afe75d904a977e7b0'],
  crop_wheat: ['5f8c42f157cafd090960286464e1d4178a0720f35b47543bfbc5a77ac488038b'],
  door_iron_grate: ['a670a7f46be6ec019ac6688b0e48447f57f0f77821da09aa3dfbadf620d10bc2'],
  door_saloon: ['03f9ac99dec33ea52f60b64657362f8d08aff102882709cecfa992fe731459f2'],
  door_shutter: ['a9f7d680398e7d079aa92b0e0be03073fc1ab70bcb86e71dfa30025e974b9c49'],
  door_steel: ['f7498b44a6de9e68f6839a8a20d51de74cb1b4c74ce7f5cb13d96bc2910fd828'],
  door_stone: ['957d9db6838ef0341aa5f798f44c3e956fe3cb2b55d6a972cddf26c2fdb0f348'],
  door_wood: ['7357a63d5bd04c4df7b11d9fece71531e763ac8bfde7e615371aa8ad02ee850a'],
  fountain: ['9c1e040c0955e73d8f37f937f2ac358da27a9d5c3b302896a2ac4d6a94c5df33'],
  hay: ['8442e6fc899f9a0b783cd709091864ee3c6a9d685e92dbbe192118478c89b264'],
  hearth: ['d24581996261d5df040dd2b10264422f57db1f5a1ecb6921b5b5a85cf6a53482'],
  hide_wall: ['6627da2bbcbd1fce437f50143f957b1f3d18ba4f66c3c9e1514394f5ec8aa5cb'],
  junk_drums: ['e9abc514db950faeb0045b4be9611a93c33d14ff83378781fef353aa14133c5a'],
  junk_heap: ['fe7916427ddd2dec6867cf529d167e6a736562ab6a8c561dd837956aa45a51e2'],
  lamp_post: ['a3f70c30878f994085e8854a5556e73336a0b629b88f4a9eb08e2349ddd1d043'],
  log_wall: ['e5caf0febc34d1d304b56e4f1666be55142cc7326a840d2a999b8656bda29b5a'],
  market_stall_cloth: ['9c783d18c105301eff2c8046290cd6b4324e82a223c7914f53211725c83f7d9d'],
  market_stall_fruit: ['0a5e6ad48183c4ea266047c6b173dd6430ad0b171d5978953819929821059185'],
  market_stall_pottery: ['e79eaf2753e24ec11cadfee2491b6a9db6df506e219c27c2b1fa825798fc19f4'],
  palisade_spikes: ['a8218a75dfebf5f765cd2014b2caa14eb09d211d126fa24c77d40230276a4259'],
  plank_wall: ['2f25069cdea1eded72ece8b960dba81a6bb2f8d61a6feb0f764e57c43f3b2f42'],
  planter: ['8f08a087bd68c4fc1bdb448cb9724ea12e60d796b0c04af676a8c4187f874e8d'],
  prop_alchemyTable: ['10fbb0197971199f45b10109b3b3c8c67b6a0f9935f4e7d26a4a4fa5ba43977e'],
  prop_altar: ['24099f91fb6ea1ca20b06a934092d90c266c00b591a41317c164d13b5d1ab411'],
  prop_anvil: ['2e852a442b55e26bf8622fa56966e4f29a45d97595f0819bd1cb37b0c0a53dbc'],
  prop_aquarium: ['8130c2f56f0c7d5060cea6d051b3c09da5effd8b979cc0132e30b13969bb2c3f'],
  prop_arcadeCabinet: ['26a309dcfba62e4c553fe3522a3dce5b952ab8a80fbbc38bfde6ef51a7be44b8'],
  prop_backBar: ['af7962968da24c2efcfc66f5cf3cc44c38a16e82ee9a171c545d1fe69c531b18'],
  prop_barCounter: ['26adb5b834e2e6f424a8baa40cddc3f6a051eb80b0be87048edb59d4211dd5f7'],
  prop_barTable: ['374906e2d0a127f91db9a1f2b9279a1467d564fb8a1e6d92974a959499169d78'],
  prop_barrel: ['79fae36752b1620ef0d0c8e21348cc83789c7654494e2c5a28c664b71b140d36'],
  prop_bed: ['c67e0d20a32e91ff93edfb55e53140ac31a58cecd618a5a903cd15cbd30326b8'],
  prop_bookPile: ['a53700a845c71238d99f860d8180e838b2ccad71d7a11ff586afc49a69ddba08'],
  prop_bookshelf: ['0b980ef41826ad9e3b8f30aa221473474ca077f2dbb88a13a4f2b541ac98a891'],
  prop_boothSofa: ['bca0afe2772dff014b4584ad7e0cf66bbea263e7a825791b3e9ee970de895866'],
  prop_breadOven: ['e44bedac191a2ce0c07fa0327d49ca5dffda3769b02969e8890cf43ee07010e6'],
  prop_bunkBed: ['a1a88f63e651c994c87a49bd03caf3b512def3c239649fb3574d023e0b1f6246'],
  prop_candelabra: ['259db2527e2ac72224c9502bcac68e6d1bca61e880ef729b9bb206292a00dc38'],
  prop_canopyBed: ['5fee876a255c87f42dcd121e2f529b0728f4ec70306d159494e04a69f414eaa4'],
  prop_cauldron: ['3a7150043048d61383692d562f298e1854065fb8fc7012d21730c66b3f133f45'],
  prop_chairWood: ['8262dd7f3bd15af999365be4c45d1fa24905608b2ffb96c8fee2c942c17b3aac'],
  prop_chestWood: ['2716a61ab2a8fbba310b4ce1d28bfcd2c99a8b32797ae287679879169996eaa4'],
  prop_containerBlue: ['ec2ecaf27fde52c818195c34a0ccad6c6edd0e1a3d62d93c6464c7d1e4a72961'],
  prop_containerGreen: ['786872c816131ff03bfc78ad928b68d4659f2d45a2d00d39fd2bdd84f925bcc7'],
  prop_containerRed: ['4fd6234a063498d8ef8a8854ecf35f3769231633c75570b3eae913e50bd631c4'],
  prop_counter: ['58441d64235dfdd642d8809b125b4f36952d50441d21d63b65b9398802d44890'],
  prop_crate: ['94843a4d0f99b5f2ed41ee54e8163940caa8d4c560305f802c0742e59703f369'],
  prop_crystalPedestal: ['8be09add16ca89a6d6f58f1d32543b6cc7ccd6cb1fc98cb1154a22a939bdef6b'],
  prop_cupboard: ['6f21d4d19270fac3ebc69c56a94525770ec93393b0902bf829a57fab62079019'],
  prop_desk: ['3d5ab7d02146b9315d571ddf37721eeaac59b805ffc438b14d984c4079a74184'],
  prop_drainPipe: ['b5e1b20895f6c64dd9c1ea510b9ffb0c859e66cb7dbffe72f999a225769ade32'],
  prop_executiveDesk: ['4400bde11089c7245c8f26597dba28672424d8fe597f9ffca4dd35cde3408fad'],
  prop_fireplace: ['3d13f52fd5e7df2afd6a9f0b45a9d9b83c5d063531c339704bde9440d59134c5'],
  prop_flourSacks: ['a8afc83e3a0ff6b8e4cff22f7bc850eba4fb04918b4f8149436f4f9229a66176'],
  prop_forge: ['05bb57c5f319d6f5efbe9470a7c39ac78894062b73d68e2084d011b9adc69ac5'],
  prop_gamingTable: ['091d679435445b6df1dec9402fe721c268a8b028ce6cbe48da97f4597906f411'],
  prop_gargoyle: ['5c606e572ec06efb5319adbe7dd9deeec4ce650554480396bb0d1bc0c9a052bb'],
  prop_goodsShelf: ['bea164927f2c33afabe7227c9a788125d4d26be132e36ebb50116f87c5976598'],
  prop_jukebox: ['859a002111d50d0a23cc612c92bb5d665477c4e56bdf92b13fd196ea5234159d'],
  prop_ladder: ['9cd4ca4e197152b33a6da40d458ea6a8e2b792fa4c04b831adb5d2f100db2cfb'],
  prop_lectern: ['a8272a3441fd6b3ff56693949abd4171d2f3ce411540ed34ce2cdc8ecc01794c'],
  prop_lowTable: ['b0ba8cc404d68db22e8c2292d4c7aaf6905dfea91343985fea3e934727fbf4c0'],
  prop_magicCircle: ['d44337cf65ed9cec985f5df3d56807dec02080aea58e8efb92b4ba3aed099a07'],
  prop_neonCocktail: ['7ffa490237d8d1eeb1011619478de8ee7534fdbd23372dc988bd8f9524ec2a77'],
  prop_neonDice: ['d2237f6b42d07d467df131304bc821d0087724cad240780a3814abf56f9563d2'],
  prop_neonHeart: ['51686e9ef92d2c7c5743d4de41d0840ac1f75ddb74489396d71a49351e943fe4'],
  prop_orrery: ['5d44b5f48daa1bcdf8020aa65634785e896690442ac4d5005dd7313ba1b45553'],
  prop_pew: ['4352b4a78778c466988c31b7c651acba294b3764d9cd64a801c7fb1e4ee7a381'],
  prop_pipe: ['f1d2ea6821cc3df317634edabd5e2d140e656a106196095153046ddfc368778c'],
  prop_pipeElbow: ['4049605446395e5aedefe0523ee74d15b25774f1e18fe01095659bf528ca7397'],
  prop_pipeEnd: ['5b1b01cb26fc79ed798428c0ee0030b130510f0e88c4df8198bab0d567ec6f4d'],
  prop_pipeValve: ['118ddc7472a9754e4fdb1b437a6ed2db7a798b1e33aa19459d4ebb27b92adf1c'],
  prop_plant: ['dd42a973a97d4b6a84d0c82e9dc7ffab52ce7117a0ffb2270b2f9abe99ce6538'],
  prop_potionShelf: ['1fc410e83c0737cdb508e2bae61e97af8504dc4f66ecf6cad2e1affbe8ad0ab8'],
  prop_rouletteTable: ['3f6f644bc1603bef24e752edbe5fbb18f54f8a7ee6cff154dd8c88c20fadfb02'],
  prop_rubble: ['8c90f620fb7f1f2df587831cb68878b6fe2d04ee83e05d7f8ffa1435dbc41341'],
  prop_safe: ['f95bd17ea55cd4c9c019686fe7b045f81643508ae897dc24a832fba2babc3fde'],
  prop_shelfGoods: ['03533105a1ac39434b6e3cd39e095b2f717b9fc3771c4d1aa0710de3bc8e7ca2'],
  prop_shopCounter: ['cdbe800bf26d54d7e3cc9883dfc348d56ada534a0da310f09113e47b5485056c'],
  prop_slotMachine: ['68f2d947bad936ca2aaca2272856089f364882d74b3619ef02a77367b2748cf8'],
  prop_speaker: ['40b33a83f693d86fcdcd10ba9e364c1a01df87ec128eae838a56957ed2fc31dd'],
  prop_still: ['8ab161a6654c72d467e449a5e6de1516d867c472d2648ad699359af9e8086874'],
  prop_stool: ['190e0f3ebf610b520072ff6f8b44a56febbbadcf0297572ee809661a4b949839'],
  prop_storageJars: ['6d7c30f0e6b734413f62f7dedc23c4d2ee2f111d4781395dbc4b5769c730e896'],
  prop_tableWood: ['9f24b294307386c95138c0710b01eb25250f6d859fc695f26fcf1d672f03da32'],
  prop_tavernCounter: ['f29d4ca50ad2b7d0c154367e93119b92590fcaa3fab5951fca3f65bb06e72b40'],
  prop_telescope: ['52166920f636142a153875dd4f6ef56c8b61365e0ccf8932f7f97e0981a3e8eb'],
  prop_treasureChest: ['9581af9778e3383a17fac68d7ddad2ccf8287e1453a66ce377d684dc80df58fb'],
  prop_vendingMachine: ['494ab8cc03207664387bde35dd9a789da71f8dfe5b481e02b0688ac5e5bec041'],
  prop_wardrobe: ['bb8ab05e9ef8b71e6f4e047d46f935c32bbf12247da96cc1eb8ab80866afc61d'],
  prop_weaponRack: ['cf1c1b01ebba415ad5d37274a719e96e8f4825a1e4311281153b06d8bf5a0467'],
  prop_writingDesk: ['82f66be91c7693aedbc8cc545a5f2c43f639997440c97daa6b2135bd5e0268f3'],
  rail_fence: ['734df47cb01c814c3ec267b1798569194d597ad7a4fb3827546180b2f4ac7f88'],
  rock_angular: ['1f994c6bd7eb9d52d2944f6789c25008a28ad3c1db485e781b5e008a758e6af2'],
  rock_boulder: ['0ef7bb538fb640534ad96fa690a50ee561333a243be159f4d42076129f924085'],
  rock_outcrop: ['9d6a5242d6fbc1090ae1e637ce3b5999a1125a37fb551688afe925aeabba57f9'],
  rock_slab: ['b94d872185f78a58f06286936801c58192215a9572b493d0e09281cd8162a5ce'],
  roof_plant: ['c0daf83bbb42683900ed69423d86419c5091330973700e2fee573de68c2adfa0'],
  roof_tank: ['91f1ae4fd82e2cd1b3f9b4c141f909755ab60a11f558f8f8f6a0721b6dafaafa'],
  sign_bakery: ['fc2abaa9d160dc849e707c126562b977b8db60a37cbbe7089e852b85794df22a'],
  sign_inn: ['6fc6cb23805b6a123a73ae1cfb82f3d827be42abd65a269046e82a16bc92a1f1'],
  sign_shop: ['9988dafc35ca18e4d62627f2008cc241fedfe621b849a38eab5a370f536ebfdd'],
  sign_smithy: ['8cadb9095345f42edd99a520c99452b7b3ceb571d754070886f843a727654c37'],
  sign_tavern: ['7b6074078e1398341059a618d87b82e920b91a5d30d9343b7472eada1e923dac'],
  stone_room_wall: [
    '59545a82a355865c8fc207574d8513ffa007247f0ccb32086e9cd51dd4d88f05',
    'db9235a1afc8eb5c2d31884590b2a67b247601dda691670254ef4403fbc03fd4',
  ],
  stone_tower_round: ['1751b22affb4b6b80e17e848d9f3bc5380168a50aeefd348da3ef59fb87b3e42'],
  stone_tower_square: ['7388c41bcbd11882192c8e66101040080d508b367a5e272afe52246cf386de24'],
  stone_wall_battlement: ['7e67d1be78c8ebfee69e5118606ea55af7acc4c906934323f210712bc14878d1'],
  timber_frame_wall: ['6bf55d2ee59501d20f97c92534117a666e133937c4d4aa7d91de1e9c6239b337'],
  totem: ['414d72ef3c5b343858ef34da90b2eb943b9d24317a887bd52ebeebbb440735ea'],
  town_brick: ['346d040d65ff92ff1192d829a0a1d887ada734d3354d13ada3c41d6a3c1ea93a'],
  town_brownstone: ['60946554f3c8065bde56b5f134af3bc7c0983ed14fd286b046aaefa0ad5e687b'],
  town_concrete: ['c94fa87b00a69a8ebe938087c92d29786136fb453ef0dae0b3f5213384b3d8f2'],
  town_office: ['dfb14b725d894745154631cbf0cf55a1de8209dac1e879b41d9a0599dd2d3458'],
  town_sfGlass: ['71207d73daaabc81550782096fec75a61636259101df98b7d9bd91046c74a274'],
  town_sfPanel: ['a4a98661f4f41d8d3df7e825e0c18aea4f13f7972a1d150f655089a96a40a9eb'],
  town_shack: ['d6b7593e403311bb953413e4c3a00c668203037ea8653a84928118e1b5929a84'],
  tree_beech: [
    'd60c8177cfa044237ec38bab6927e013ecae3278c2d99ce21e822fa8522cbdf1',
    '5c2d9096576ef285e043b4be668bc73cbbce723bc87adae6548350a714f4afb0',
  ],
  tree_beechAutumn: ['32854d8fb27ec4e523921d3f0f0764e25ad376ed0917e5a8b06c0e0cb9899e4b'],
  tree_birch: [
    'd72bdc3adad4db6b18848a6b1670ff02710924a63497779fe7263eb938dc3cc9',
    'c6d2a279e3019c9df3de1dedbdf4e1960a75b8344efe92da639d0174bffd9031',
  ],
  tree_birchAutumn: ['380d13af3daef4cae5537c413a346ac07a096788e020ff08301054761c4e502d'],
  tree_birchBare: ['6f11385b8649eb46e21350d5976e4b1c1aedfbc29f186c773194ea75bf93d0f5'],
  tree_cherry: ['cb88745076ac2fc6b9f5bb51b7c57638c0ad61c208fa29d3021f08a1c3a54edb'],
  tree_dead: [
    '0c9928257322728125c5e7905b1376974566faa66dad03d45391db613172bbf2',
    '16a615c0186f4dc07511bf0485448f9148e6645686103879a00de468a0a8b060',
  ],
  tree_fir: [
    'ec12480fbde8356980f2d459f0f88d529ac85c289427c0b6b200b8da6f4061ab',
    '81183054e1369cfb183cf1adeb48e835b3051cdbcc4c9bbf8be1cd14784bbf24',
  ],
  tree_giant: ['34834b6f1ee59a845af678b3f10358a3fd60c419c6aa6444f0dcc1ae8971fed3'],
  tree_ginkgo: ['a8d00c3980049536ac38046b22a688a662f4cbd66f11c5d63532ffd10860aae9'],
  tree_mangrove: ['adf802769ab288b196569f72b28d5e6360f954f3df3728ebf6150afe01d41366'],
  tree_maple: ['25572a67fb5c63380d98ac81ba224614926ae14a8a2a2d715525da6346a9362d'],
  tree_oak: [
    '142698ad0def2e9785df805940742a9514362fb5ad159e3429f0995535e0b0ce',
    'e6a8e88c6abfcbb7d21d3ecca6d17b24a2832d2de847670540cb4c8928cebb57',
    'e50260f6012f4f721017ef6dfa0bd802c854b1df7fa77faada471eafaf2adee9',
    'd7fd8773674928c50c11b66d12c636d49bdcc15a8b1c7fbb98e6f63a3439a3f3',
  ],
  tree_oakAutumn: ['30f9c2c88f62c0512f550b65774312d57bec5cff05d5041730e31b1aece50301'],
  tree_oakBare: ['88f319f7612a3e60775961b16719b1af4dcd4b20e34f747bf226326ebb1b0820'],
  tree_pine: [
    '5d6ac821664f4ecdd05b0d6a53e51cf1891debe678b4e7c16b9a46ad5ea41198',
    '78cc9c5ca4f5ebfd49f83d71ab3d75fc86599381b8f400af04cd675199902960',
  ],
  tree_poplar: [
    '6a2062ea1dc738734774e0518bce262b3dabc97286fbea78f28f11353e8cc53c',
    'a7c233506cbd664733795d18f6b3ea3d57d3fb1041ebbec422da6ffa4431ee07',
  ],
  tree_snowFir: ['cf7426c5d7ca47a930b91e55c410abaffab2d0f79f5d5c3be7140e2cb6404edc'],
  tree_snowSpruce: ['1cbe3a206fc4b0b4907fd2a06af3c9fb68f7ebea077b4bd573d50e6c7c6be3d9'],
  tree_spruce: [
    '0ed811a8b30d04033cfcaa0362da8214656466ce203d3cb75e9ea4a42e1bac0c',
    '7bb5107fff26bbfe3f9230bde4d7af47422bb8b03236c59b5787a033c0eb5cf7',
  ],
  tree_willow: [
    'f82b83ff8c9e7f2f59cfa3c0ffcb20e019f2e279f82467959ee97b2e6f3ce09f',
    '8315de8904f0f76b34b282413d37ea4bbbfff280f7ffc70bbb7717f5fc7ecd83',
  ],
  watchtower_wood: [
    'a9c6e0e09e84467aee8fb67328d73b25e0434b0d5a6b869c6b9950d2154db034',
    'c14fadb4be9596d16ced08ad5dc19effdac80a2b2ab84ee95665b30fa682d137',
  ],
  watermill: ['c2861bc1a6e12113169edb9e7fa8b5854d1f2aba2dbf72d46934c3ed4ed1ea27'],
  well: ['cc10f1eb64ae1dfaf32d3a55c363f876e6534c0155c80ddd0cf3213d0cd3c8f0'],
  windmill: ['2d90d2865085490e3b502a28f67c7aae6f10df60faf658fd10c3745acc23d26b'],
};

const BUNDLED_MAP_NAMES: ReadonlyMap<string, string> = new Map(
  Object.entries(BUNDLED_MAP_MODELS).flatMap(([name, identifiers]) =>
    identifiers.map((identifier) => [identifier, name] as const)
  )
);

/** Whether a model is one of those bundled with the app that blocks are drawn as, now or before, by its identifier. */
export function isBundledMapModel(identifier: string): boolean {
  return BUNDLED_MAP_NAMES.has(identifier);
}

/** The name of a bundled model blocks are drawn as, which its file is named by, or null for any other. */
export function bundledMapModelName(identifier: string): string | null {
  return BUNDLED_MAP_NAMES.get(identifier) ?? null;
}

/** The identifiers of the bundled models blocks are drawn as, as bundled now, by name, as their files are named. */
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

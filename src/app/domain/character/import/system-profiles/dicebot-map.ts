const CHARASHEET_DICEBOT: Record<string, string> = {
  coc: 'Cthulhu',
  coc7: 'Cthulhu7th',
  ara2: 'Arianrhod',
  dx3: 'DoubleCross',
  elysion: 'Elysion',
  gracre: 'GranCrest',
  gorder: 'GardenOrder',
  mk: 'MeikyuKingdom',
  swordworld2: 'SwordWorld2.0',
  swordworld: 'SwordWorld',
  nechro: 'Nechronica',
  nw3: 'NightWizard3rd',
  parabla: 'ParasiteBlood',
  ryutama: 'Ryutama',
  sengen: 'Sengensyou',
  utakaze: 'Utakaze',
  gobusla: 'GoblinSlayer',
  aeng: 'AssaultEngine',
  kmgkr: 'Kamigakari',
  araguild: 'Arianrhod',
  gracreland: 'GranCrest',
  ryutamad: 'Ryutama',
  utakazecal: 'Utakaze',
};

const APPSPOT_DICEBOT: Record<string, string> = {
  dx3: 'DoubleCross',
  shinobigami: 'ShinobiGami',
  insane: 'Insane',
  helltv: 'KillDeathBusiness',
  hm: 'HuntersMoon',
  blcr: 'BloodCrusade',
  bloodmoon: 'BloodMoon',
  stratoshout: 'StratoShout',
  cardranker: 'CardRanker',
  ddd: 'DarkDaysDrive',
  yy: 'YankeeYogSothoth',
  mglg: 'MagicaLogia',
  kancolle: 'KanColle',
  stellar: 'StellarKnights',
  bbt: 'BeastBindTrinity',
  starrydolls: 'StarryDolls',
};

/**
 * The dice bot id for an archive system token, ignoring case and surrounding spaces. Empty for a
 * token with no known dice bot.
 */
export function resolveCharasheetDicebot(game: string): string {
  return CHARASHEET_DICEBOT[game.trim().toLowerCase()] ?? '';
}

/**
 * The dice bot id for a warehouse system slug, ignoring case and surrounding spaces. Empty for a
 * slug with no known dice bot.
 */
export function resolveAppspotDicebot(system: string): string {
  return APPSPOT_DICEBOT[system.trim().toLowerCase()] ?? '';
}

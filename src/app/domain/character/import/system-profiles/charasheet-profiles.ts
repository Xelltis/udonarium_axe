import { parseCharasheetCharacter } from '@axe/domain/character/import/charasheet-character-parser';
import { ImportedCharacter } from '@axe/domain/character/import/imported-character';
import { buildAra2CharasheetCharacter } from '@axe/domain/character/import/system-profiles/ara2-charasheet-profile';
import { charasheetGameOf } from '@axe/domain/character/import/system-profiles/charasheet-shared';
import { buildCoc6CharasheetCharacter } from '@axe/domain/character/import/system-profiles/coc6-charasheet-profile';
import { buildCoc7CharasheetCharacter } from '@axe/domain/character/import/system-profiles/coc7-charasheet-profile';
import { resolveCharasheetDicebot } from '@axe/domain/character/import/system-profiles/dicebot-map';
import { buildDx3CharasheetCharacter } from '@axe/domain/character/import/system-profiles/dx3-charasheet-profile';
import { buildElysionCharasheetCharacter } from '@axe/domain/character/import/system-profiles/elysion-charasheet-profile';
import { buildGorderCharasheetCharacter } from '@axe/domain/character/import/system-profiles/gorder-charasheet-profile';
import { buildGracreCharasheetCharacter } from '@axe/domain/character/import/system-profiles/gracre-charasheet-profile';
import { charasheetLabelMap } from '@axe/domain/character/import/system-profiles/label-maps';
import { buildMkCharasheetCharacter } from '@axe/domain/character/import/system-profiles/mk-charasheet-profile';
import { buildNechroCharasheetCharacter } from '@axe/domain/character/import/system-profiles/nechro-charasheet-profile';
import { buildNw3CharasheetCharacter } from '@axe/domain/character/import/system-profiles/nw3-charasheet-profile';
import { buildParablaCharasheetCharacter } from '@axe/domain/character/import/system-profiles/parabla-charasheet-profile';
import { buildRyutamaCharasheetCharacter } from '@axe/domain/character/import/system-profiles/ryutama-charasheet-profile';
import { buildSengenCharasheetCharacter } from '@axe/domain/character/import/system-profiles/sengen-charasheet-profile';
import { buildSwordWorldCharasheetCharacter } from '@axe/domain/character/import/system-profiles/swordworld-charasheet-profile';
import { buildSwordWorld2CharasheetCharacter } from '@axe/domain/character/import/system-profiles/swordworld2-charasheet-profile';
import { buildUtakazeCharasheetCharacter } from '@axe/domain/character/import/system-profiles/utakaze-charasheet-profile';

/** The token the archive uses for a system, and how that system is built. */
const BUILDERS: Record<string, (parsed: unknown) => ImportedCharacter | null> = {
  coc: buildCoc6CharasheetCharacter,
  coc7: buildCoc7CharasheetCharacter,
  ara2: buildAra2CharasheetCharacter,
  dx3: buildDx3CharasheetCharacter,
  elysion: buildElysionCharasheetCharacter,
  gracre: buildGracreCharasheetCharacter,
  gorder: buildGorderCharasheetCharacter,
  mk: buildMkCharasheetCharacter,
  swordworld2: buildSwordWorld2CharasheetCharacter,
  swordworld: buildSwordWorldCharasheetCharacter,
  nechro: buildNechroCharasheetCharacter,
  nw3: buildNw3CharasheetCharacter,
  parabla: buildParablaCharasheetCharacter,
  ryutama: buildRyutamaCharasheetCharacter,
  sengen: buildSengenCharasheetCharacter,
  utakaze: buildUtakazeCharasheetCharacter,
};

/**
 * Reads an archive sheet with the profile for its system token, falling back to the general parser.
 *
 * A system with no dedicated profile is read with `labelMap`, or with the headings generated for
 * that system when none is given, and is given the system's dice bot where one is known.
 */
export function parseCharasheetCharacterForSystem(
  parsed: unknown,
  labelMap?: Record<string, string>
): ImportedCharacter | null {
  const build = BUILDERS[charasheetGameOf(parsed)];
  if (build) return build(parsed);

  const game = charasheetGameOf(parsed);
  const character = parseCharasheetCharacter(parsed, labelMap ?? charasheetLabelMap(game));
  if (character && character.dicebot.trim() === '') {
    character.dicebot = resolveCharasheetDicebot(game);
  }
  return character;
}

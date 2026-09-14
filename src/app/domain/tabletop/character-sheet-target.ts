import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { RangeArea } from '@axe/domain/tabletop/range';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TextNote } from '@axe/domain/tabletop/text-note';

/**
 * Everything the sheet component can open.
 * It handles several kinds of object on one screen, which this reflects.
 * The eight of them are gathered here rather than written out in three places.
 */
export type CharacterSheetTarget =
  GameCharacter | DiceSymbol | Card | CardStack | Terrain | TextNote | RangeArea | GameTableMask;

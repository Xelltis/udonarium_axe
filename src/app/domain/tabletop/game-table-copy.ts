import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { xml2element } from '@axe/core/util/xml-util';
import { GameTable } from '@axe/domain/tabletop/game-table';

/**
 * Makes a copy of a table under another name, with everything on it: the ground, the walls, the
 * lights, the layers and the switches, each under an identifier of its own. It is written out and
 * read back as a dropped save is, and is not shown until somebody picks it. Null when the table
 * could not be read back.
 */
export function copyGameTable(table: GameTable, name: string): GameTable | null {
  const element = xml2element(table.toXml());
  if (!element) return null;
  element.setAttribute('name', name);
  element.setAttribute('selected', 'false');
  const copy = ObjectSerializer.instance.parseXml(element);
  return copy instanceof GameTable ? copy : null;
}

/**
 * A name for a new table that no table here goes by yet: the name wanted, else it numbered from 2.
 * A scene or a switch finds its table by name after a save is read back, which two tables of one
 * name would leave it unable to do.
 */
export function freeTableName(wanted: string, taken: readonly string[]): string {
  const names = new Set(taken.map((name) => name.trim()));
  if (!names.has(wanted.trim())) return wanted;
  for (let count = 2; ; count++) {
    const numbered = `${wanted} (${count})`;
    if (!names.has(numbered)) return numbered;
  }
}

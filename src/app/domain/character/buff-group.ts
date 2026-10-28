import { DataElement, DataElementAttribute } from '@axe/domain/data/data-element';

/**
 * The buff a row is one of, by the name of its first row, where one buff moves several statuses a
 * row apiece; empty for a buff of a single row, as every buff was before.
 */
export function buffGroupOf(data: DataElement): string {
  return (data.getAttribute(DataElementAttribute.BUFF_GROUP) ?? '').trim();
}

/**
 * Whether a row is one of the further rows of a buff that moves several statuses: its first row
 * stands for it on the badge, in the chat and when it is taken off by name.
 */
export function isBuffGroupMember(data: DataElement): boolean {
  const group = buffGroupOf(data);
  return group.length > 0 && group !== data.name;
}

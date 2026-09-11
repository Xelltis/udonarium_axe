import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { DataElement } from '@axe/domain/data/data-element';

function parseElementTree(xml: string): DataElement | null {
  const parsed = ObjectSerializer.instance.parseXml(xml);
  if (parsed instanceof DataElement) return parsed;
  parsed?.destroy();
  return null;
}

export function duplicateDataElement(element: DataElement, parent: DataElement): DataElement | null {
  const copy = parseElementTree(element.toXml());
  if (!copy) return null;
  copy.name = DataElement.createUniqueSiblingName(parent, element.name);
  return copy;
}

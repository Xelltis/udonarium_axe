import { DataElement } from '@axe/domain/data/data-element';

/** Every element below the root, depth first with parents before their children; the root itself is left out. */
export function collectDataElements(root: DataElement | null): DataElement[] {
  if (!root) return [];

  const elements: DataElement[] = [];
  const walk = (element: DataElement) => {
    for (const child of element.children) {
      elements.push(child);
      walk(child);
    }
  };
  walk(root);
  return elements;
}

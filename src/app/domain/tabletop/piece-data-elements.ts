import { DataElement, DataElementType } from '@axe/domain/data/data-element';

/**
 * Adds the name, the given size values and the opacity to a piece's common data.
 *
 * The opacity is stored as a resource whose maximum and current value both start at the given
 * amount. The piece's data elements must already have been created.
 */
export function appendPieceDataElements(
  target: { identifier: string; commonDataElement: DataElement | null },
  name: string,
  sizes: Record<string, number>,
  opacity: number
): void {
  const common = target.commonDataElement!;
  common.appendChild(DataElement.create('name', name, {}, `name_${target.identifier}`));
  for (const [key, value] of Object.entries(sizes)) {
    common.appendChild(DataElement.create(key, value, {}, `${key}_${target.identifier}`));
  }
  common.appendChild(
    DataElement.create(
      'opacity',
      opacity,
      { type: DataElementType.NUMBER_RESOURCE, currentValue: opacity },
      `opacity_${target.identifier}`
    )
  );
}

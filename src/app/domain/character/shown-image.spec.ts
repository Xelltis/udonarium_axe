import { shownImageIdentifier } from '@axe/domain/character/shown-image';
import { DataElement } from '@axe/domain/data/data-element';

describe('shownImageIdentifier', () => {
  function images(...identifiers: string[]): DataElement {
    const holder = DataElement.create('image', '');
    for (const identifier of identifiers) holder.appendChild(DataElement.create('imageIdentifier', identifier));
    return holder;
  }

  function sheetPicking(currentValue: string): DataElement {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('ICON', 2, { type: 'numberResource', currentValue }));
    return detail;
  }

  it('shows the picture the ICON resource picks, held to the last one', () => {
    expect(shownImageIdentifier(images('a', 'b'), sheetPicking('1'))).toBe('b');
    expect(shownImageIdentifier(images('a', 'b'), sheetPicking('9'))).toBe('b');
  });

  it('takes an ICON with a fraction as the whole number below it', () => {
    expect(shownImageIdentifier(images('a', 'b', 'c'), sheetPicking('1.5'))).toBe('b');
    expect(shownImageIdentifier(images('a', 'b', 'c'), sheetPicking('-0.5'))).toBe('');
  });

  it('shows the first picture where the sheet has no ICON', () => {
    expect(shownImageIdentifier(images('a', 'b'), DataElement.create('detail', ''))).toBe('a');
  });
});

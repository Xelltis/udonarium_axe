import { inventoryTabFromElement } from '@axe/features/inventory/game-object-inventory/inventory-folder-drag';

describe('inventoryTabFromElement()', () => {
  it('reads the tab off whatever inside it was under the pointer', () => {
    const tab = document.createElement('label');
    tab.setAttribute('data-inventory-tab', 'graveyard');
    const name = document.createElement('span');
    tab.append(name);

    expect(inventoryTabFromElement(name)).toBe('graveyard');
  });

  it('finds no tab outside the tabs', () => {
    expect(inventoryTabFromElement(document.createElement('div'))).toBeNull();
    expect(inventoryTabFromElement(null)).toBeNull();
  });
});

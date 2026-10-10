import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { resourceSliderRange, showsResourceSlider } from '@axe/domain/character/resource-slider';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

function resource(attributes: Record<string, string> = {}): DataElement {
  const element = DataElement.create('HP', 20, { type: DataElementType.NUMBER_RESOURCE, ...attributes });
  element.currentValue = 12;
  return element;
}

describe('showsResourceSlider', () => {
  it('shows a slider on a resource set to have one', () => {
    expect(showsResourceSlider(resource({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' }))).toBe(true);
  });

  it('shows none on a resource an older version saved, which knows nothing of the setting', () => {
    expect(showsResourceSlider(resource())).toBe(false);
  });

  it('shows none for a setting left empty', () => {
    expect(showsResourceSlider(resource({ [DataElementAttribute.RESOURCE_SLIDER]: '' }))).toBe(false);
  });

  it('shows none on a field that is not a resource, whatever it is set to', () => {
    const note = DataElement.create('memo', 'text', { [DataElementAttribute.RESOURCE_SLIDER]: 'true' });

    expect(showsResourceSlider(note)).toBe(false);
  });

  it('keeps the setting through a save and a load', () => {
    const saved = resource({ [DataElementAttribute.RESOURCE_SLIDER]: 'true' });
    const xml = ObjectSerializer.instance.toXml(saved);
    saved.destroy();
    ObjectStore.instance.clearDeleteHistory();

    const loaded = ObjectSerializer.instance.parseXml(xml) as DataElement;

    expect(showsResourceSlider(loaded)).toBe(true);
    expect(Number(loaded.currentValue)).toBe(12);
  });
});

describe('resourceSliderRange', () => {
  it('runs from 0 to the maximum where no lowest point is set', () => {
    expect(resourceSliderRange('', '20')).toEqual({ min: 0, max: 20 });
  });

  it('runs from the lowest point set, below 0 as well', () => {
    expect(resourceSliderRange('-5', '20')).toEqual({ min: -5, max: 20 });
  });

  it('has nothing to run over without a maximum', () => {
    expect(resourceSliderRange('', '')).toBeNull();
  });

  it('has nothing to run over with a maximum that is not a number', () => {
    expect(resourceSliderRange('', 'many')).toBeNull();
  });

  it('has nothing to run over with a maximum no higher than the lowest point', () => {
    expect(resourceSliderRange('10', '10')).toBeNull();
    expect(resourceSliderRange('', '0')).toBeNull();
  });
});

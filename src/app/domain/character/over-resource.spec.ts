import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { allowsOverResource } from '@axe/domain/character/over-resource';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

function resource(attributes: Record<string, string> = {}): DataElement {
  const element = DataElement.create('命中V', 1, { type: DataElementType.NUMBER_RESOURCE, ...attributes });
  element.currentValue = 3;
  return element;
}

describe('allowsOverResource', () => {
  it('lets a resource set to go over its maximum do so', () => {
    expect(allowsOverResource(resource({ [DataElementAttribute.OVER_RESOURCE]: 'true' }))).toBe(true);
  });

  it('holds a resource an older version saved, which knows nothing of the setting, at its maximum', () => {
    expect(allowsOverResource(resource())).toBe(false);
  });

  it.each(['', 'false', '1'])('holds it there for a setting of %j', (value) => {
    expect(allowsOverResource(resource({ [DataElementAttribute.OVER_RESOURCE]: value }))).toBe(false);
  });

  it('holds nothing that is not a resource, whatever it is set to', () => {
    const note = DataElement.create('memo', 'text', { [DataElementAttribute.OVER_RESOURCE]: 'true' });

    expect(allowsOverResource(note)).toBe(false);
  });

  it('keeps the setting and the value over the maximum through a save and a load', () => {
    const saved = resource({ [DataElementAttribute.OVER_RESOURCE]: 'true' });
    const xml = ObjectSerializer.instance.toXml(saved);
    saved.destroy();
    ObjectStore.instance.clearDeleteHistory();

    const loaded = ObjectSerializer.instance.parseXml(xml) as DataElement;

    expect(allowsOverResource(loaded)).toBe(true);
    expect(Number(loaded.currentValue)).toBe(3);
  });
});

import { Attributes } from '@axe/core/sync/attributes';
import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { parseAttributesKeepingIdentifier, toAttributesKeepingIdentifier } from '@axe/core/sync/persisted-identifier';

@SyncObject('persisted-identifier-probe')
class Probe extends GameObject {
  @SyncVar() label: string = '';

  toAttributes(): Attributes {
    return toAttributesKeepingIdentifier(this);
  }

  parseAttributes(attributes: NamedNodeMap): void {
    parseAttributesKeepingIdentifier(this, attributes);
  }
}

describe('keeping an identifier through a file', () => {
  afterEach(() => {
    for (const probe of ObjectStore.instance.getObjects(Probe)) ObjectStore.instance.delete(probe, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  function read(xml: string): Probe {
    return ObjectSerializer.instance.parseXml(xml) as Probe;
  }

  it('writes the identifier with the fields', () => {
    const probe = new Probe('probe-1');
    probe.label = '見張り';

    expect(probe.toXml()).toBe(
      '<persisted-identifier-probe label="見張り" identifier="probe-1"></persisted-identifier-probe>'
    );
  });

  it('comes back under the identifier it was written with', () => {
    const probe = read('<persisted-identifier-probe label="見張り" identifier="probe-1"></persisted-identifier-probe>');

    expect(probe.identifier).toBe('probe-1');
    expect(probe.label).toBe('見張り');
    expect(ObjectStore.instance.get('probe-1')).toBe(probe);
  });

  it('keeps the identifier out of the fields it synchronises', () => {
    const probe = read('<persisted-identifier-probe label="見張り" identifier="probe-1"></persisted-identifier-probe>');

    expect(Object.keys(probe.toContext().syncData as object)).toEqual(['label']);
  });

  it('stays under a fresh identifier when the one written was deleted here', () => {
    const gone = new Probe('probe-1');
    gone.initialize();
    gone.destroy();

    const probe = read('<persisted-identifier-probe label="見張り" identifier="probe-1"></persisted-identifier-probe>');

    expect(probe.identifier).not.toBe('probe-1');
    expect(probe.label).toBe('見張り');
  });

  it('stays under a fresh identifier when the file carries none, as one written before identifiers were', () => {
    const probe = read('<persisted-identifier-probe label="見張り"></persisted-identifier-probe>');

    expect(probe.identifier).toBeTruthy();
    expect(probe.label).toBe('見張り');
  });

  it('stays under a fresh identifier when the one written is empty', () => {
    const probe = read('<persisted-identifier-probe identifier=""></persisted-identifier-probe>');

    expect(probe.identifier).toBeTruthy();
  });
});

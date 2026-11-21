import { TestBed } from '@angular/core/testing';
import { ModelNamesService, NO_MODEL_NAMES } from '@axe/application/tabletop/model-names.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { binaryGltf } from '@axe/testing/binary-gltf';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelNamesService', () => {
  let names: ModelNamesService;
  let held: Record<string, { blob: Blob | null }>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    held = {};
    vi.spyOn(TestBed.inject(ModelStorage), 'get').mockImplementation(
      (identifier) => (held[identifier] ?? null) as never
    );
    names = TestBed.inject(ModelNamesService);
  });

  afterEach(() => vi.restoreAllMocks());

  const knight = () =>
    new Blob([
      binaryGltf({
        animations: [{ name: 'Idle' }, { name: 'Slash' }],
        materials: [{ name: 'Armour' }],
        meshes: [{ primitives: [{ targets: [{}] }], extras: { targetNames: ['Blink'] } }],
      }),
    ]);

  it('names nothing of a model until it has been read, and then what its file names', async () => {
    held['knight'] = { blob: knight() };

    expect(names.namesOf('knight')).toBe(NO_MODEL_NAMES);
    await vi.waitFor(() => expect(names.namesOf('knight').motions).toEqual(['Idle', 'Slash']));

    expect(names.namesOf('knight')).toEqual({ motions: ['Idle', 'Slash'], shapes: ['Blink'], materials: ['Armour'] });
  });

  it('reads a model once, however often it is asked after', async () => {
    const blob = knight();
    const slices = vi.spyOn(blob, 'slice');
    held['knight'] = { blob };

    names.namesOf('knight');
    names.namesOf('knight');
    await vi.waitFor(() => expect(names.namesOf('knight').motions).toHaveLength(2));
    names.namesOf('knight');

    expect(slices).toHaveBeenCalledTimes(2);
  });

  it('names nothing of a model not held here, and reads it once it has come', async () => {
    expect(names.namesOf('knight')).toBe(NO_MODEL_NAMES);
    held['knight'] = { blob: null };
    expect(names.namesOf('knight')).toBe(NO_MODEL_NAMES);

    held['knight'] = { blob: knight() };
    names.namesOf('knight');
    await vi.waitFor(() => expect(names.namesOf('knight').materials).toEqual(['Armour']));
  });

  it('names nothing of bytes that are no model', async () => {
    held['junk'] = { blob: new Blob([new Uint8Array(64)]) };

    names.namesOf('junk');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(names.namesOf('junk')).toBe(NO_MODEL_NAMES);
  });
});

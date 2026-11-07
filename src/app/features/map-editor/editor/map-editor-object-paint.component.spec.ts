import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { placeableModelOf } from '@axe/domain/tabletop/placeable-models';
import { MapEditorObjectPaintComponent } from '@axe/features/map-editor/editor/map-editor-object-paint.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapEditorObjectPaintComponent', () => {
  let fixture: ComponentFixture<MapEditorObjectPaintComponent>;
  let state: MapEditorState;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapEditorObjectPaintComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    }).compileComponents();
    state = TestBed.inject(MapEditorState);
    state.functionRole.set('object');
    fixture = TestBed.createComponent(MapEditorObjectPaintComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const host = () => fixture.nativeElement as HTMLElement;

  /** Opens a shelf of the model list and picks a model off it by its name. */
  function pick(shelf: string, model: string): void {
    const shelves = [...host().querySelectorAll('[data-testid="object-shelves"] button')] as HTMLButtonElement[];
    shelves.find((one) => one.textContent?.trim() === shelf)!.click();
    fixture.detectChanges();
    const tiles = [...host().querySelectorAll('[data-testid="object-models"] button')] as HTMLButtonElement[];
    tiles.find((one) => one.getAttribute('aria-label') === model)!.click();
    fixture.detectChanges();
  }

  it('takes up a bundled model as it is wont to stand, named after it, one to a cell where it is no thing of open country', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    pick('家具', '机');

    const desk = placeableModelOf('prop_desk')!;
    expect(state.functionSpec().object).toMatchObject({
      model: 'prop_desk',
      name: '机',
      size: desk.size,
      blocksMove: true,
      blocksSight: false,
      arrangement: 'cell',
    });
    expect(host().querySelector('[data-testid="object-model-name"]')?.textContent?.trim()).toBe('机');
    expect(host().querySelector('[data-testid="object-density"]')).toBeNull();
    expect(host().querySelector('[data-testid="object-height"]')).toBeNull();
  });

  it('scatters a tree, and sets the brush out another way on asking', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    pick('自然', 'シラカバ');
    const seed = state.functionSpec().object.seed;

    (host().querySelector('[data-testid="object-rearrange"]') as HTMLButtonElement).click();

    expect(state.functionSpec().object.arrangement).toBe('scatter');
    expect(state.functionSpec().object.seed).not.toBe(seed);
  });

  it('offers the models held in the room, a cell across and a cell tall, with a height to set', async () => {
    const storage = TestBed.inject(ModelStorage);
    vi.spyOn(storage, 'models', 'get').mockReturnValue([
      { identifier: 'held-statue', name: 'statue.glb', isReady: true },
    ] as never);
    vi.spyOn(storage, 'get').mockReturnValue({ identifier: 'held-statue', name: 'statue.glb' } as never);
    fixture.detectChanges();
    await fixture.whenStable();

    pick('部屋のモデル', 'statue.glb');

    expect(state.functionSpec().object).toMatchObject({ model: 'held-statue', name: 'statue', size: 1, height: 1 });
    expect(host().querySelector('[data-testid="object-height"]')).not.toBeNull();
  });

  it('lets nothing hide what is behind it that a piece walks over', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    (host().querySelector('[data-testid="object-blocks-move"]') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    const sight = host().querySelector('[data-testid="object-blocks-sight"]') as HTMLInputElement;
    expect(state.functionSpec().object.blocksMove).toBe(false);
    expect(sight.disabled).toBe(true);
    expect(sight.checked).toBe(false);
  });
});

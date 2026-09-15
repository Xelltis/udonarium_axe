import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MapEditorLayerDrawerComponent } from '@axe/features/map-editor/editor/map-editor-layer-drawer.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { MapLayer } from '@axe/features/map-editor/model/scene';
import { addLayer } from '@axe/features/map-editor/model/scene-ops';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface Drawer {
  onLayerDrop(event: DragEvent): void;
  layerDrag: { begin(id: string): void; hover(id: string): void };
  deleteLayer(layer: { id: string; locked?: boolean }): void;
  addLayerOfKind(kind: MapLayer['kind']): void;
  addLayerMenuOpen: { set(open: boolean): void; (): boolean };
  commitRename(layer: MapLayer, name: string): void;
  toggleVisible(layer: MapLayer): void;
}

describe('MapEditorLayerDrawerComponent', () => {
  let fixture: ComponentFixture<MapEditorLayerDrawerComponent>;
  let drawer: Drawer;
  let state: MapEditorState;
  let ask: ReturnType<typeof vi.spyOn>;

  function shapeLayer(id: string, locked = false): MapLayer {
    return { id, kind: 'shape', name: 'S', visible: true, locked, opacity: 1, items: [] };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MapEditorLayerDrawerComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    });
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
    state = TestBed.inject(MapEditorState);
    fixture = TestBed.createComponent(MapEditorLayerDrawerComponent);
    fixture.componentRef.setInput('thumbnails', new Map());
    drawer = fixture.componentInstance as unknown as Drawer;
  });

  function dropOn(): DragEvent {
    const dropped = { preventDefault: vi.fn(), stopPropagation: vi.fn() } as unknown as DragEvent;
    drawer.onLayerDrop(dropped);
    return dropped;
  }

  it('leaves a drop it has no layer to move for the rest of the page to answer', () => {
    const dropped = dropOn();
    expect(dropped.preventDefault).not.toHaveBeenCalled();
    expect(dropped.stopPropagation).not.toHaveBeenCalled();
  });

  it('keeps the drop that moves a layer to itself', () => {
    drawer.layerDrag.begin('a');
    drawer.layerDrag.hover('b');
    const dropped = dropOn();
    expect(dropped.preventDefault).toHaveBeenCalled();
    expect(dropped.stopPropagation).toHaveBeenCalled();
  });

  it('deletes the layer when the dialogue agrees, and keeps it otherwise', async () => {
    state.applyCommitted(() => addLayer(state.current, shapeLayer('layer-1')));
    const before = state.current.layers.length;

    drawer.deleteLayer({ id: 'layer-1' });
    await Promise.resolve();
    expect(state.current.layers.length).toBe(before);

    ask.mockResolvedValue(true);
    drawer.deleteLayer({ id: 'layer-1' });
    await Promise.resolve();
    expect(state.current.layers.find((l) => l.id === 'layer-1')).toBeUndefined();
  });

  it('neither asks nor deletes for a locked layer', async () => {
    state.applyCommitted(() => addLayer(state.current, shapeLayer('layer-4', true)));
    const before = state.current.layers.length;

    drawer.deleteLayer({ id: 'layer-4', locked: true });
    await Promise.resolve();

    expect(ask).not.toHaveBeenCalled();
    expect(state.current.layers.length).toBe(before);
  });

  it('adds a layer named after its kind and closes the menu', () => {
    drawer.addLayerMenuOpen.set(true);
    const before = state.current.layers.filter((l) => l.kind === 'text').length;
    drawer.addLayerOfKind('text');
    const added = state.current.layers.filter((l) => l.kind === 'text');
    expect(added).toHaveLength(before + 1);
    expect(added[added.length - 1].name).toMatch(new RegExp(`${before + 1}$`));
    expect(drawer.addLayerMenuOpen()).toBe(false);
  });

  it('offers a pencil on the layer in hand, for a screen that cannot double-click its name', () => {
    state.applyCommitted(() => addLayer(state.current, shapeLayer('layer-6')));
    state.applyCommitted(() => addLayer(state.current, shapeLayer('layer-7')));
    state.activeLayerId.set('layer-6');
    fixture.detectChanges();

    const pencils = fixture.nativeElement.querySelectorAll('[data-testid="map-layer-rename"]');
    expect(pencils).toHaveLength(1);

    (pencils[0] as HTMLButtonElement).click();

    expect((drawer as unknown as { renamingLayerId(): string | null }).renamingLayerId()).toBe('layer-6');
  });

  it('renames a layer and hides it', () => {
    state.applyCommitted(() => addLayer(state.current, shapeLayer('layer-5')));
    const layer = state.current.layers.find((l) => l.id === 'layer-5')!;
    drawer.commitRename(layer, 'Walls');
    drawer.toggleVisible(layer);
    const found = state.current.layers.find((l) => l.id === 'layer-5')!;
    expect(found.name).toBe('Walls');
    expect(found.visible).toBe(false);
  });
});

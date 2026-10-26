import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StampLayer } from '@axe/domain/map-editor/scene';
import { MapEditorSelectedItemComponent } from '@axe/features/map-editor/editor/map-editor-selected-item.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapEditorSelectedItemComponent', () => {
  let fixture: ComponentFixture<MapEditorSelectedItemComponent>;
  let state: MapEditorState;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapEditorSelectedItemComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    }).compileComponents();
    state = TestBed.inject(MapEditorState);
    state.newScene(10, 8, 50, 'transparent');
    fixture = TestBed.createComponent(MapEditorSelectedItemComponent);
  });

  async function drawn(): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while nothing is picked', async () => {
    expect((await drawn()).querySelector('button')).toBeNull();
  });

  it('shows the size of a picked stamp, and deletes it', async () => {
    state.stampId.set('door-single');
    state.stampSize.set(64);
    state.placeStamp(100, 100, 'スタンプ 1');
    state.selection.set(state.hitTest(100, 100));

    const element = await drawn();
    expect((element.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('64');

    (element.querySelector('button') as HTMLButtonElement).click();

    expect(state.selection()).toBeNull();
    expect((state.current.layers.find((layer) => layer.kind === 'stamp') as StampLayer).items).toHaveLength(0);
  });
});

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

  it('tells what the tool does and its keys while nothing is picked, with nothing to press', async () => {
    const element = await drawn();

    expect(element.querySelector('button')).toBeNull();
    const guide = element.querySelector('[data-testid="map-editor-select-guide"]')!;
    expect(guide.textContent).toContain('クリックで選び、ドラッグで動かします');
    expect([...guide.querySelectorAll('dt')].map((key) => key.textContent?.trim())).toContain('Delete');
  });

  it('takes the guide away once something is picked', async () => {
    state.stampId.set('door-single');
    state.placeStamp(100, 100, 'スタンプ 1');
    state.selection.set(state.hitTest(100, 100));

    expect((await drawn()).querySelector('[data-testid="map-editor-select-guide"]')).toBeNull();
  });

  it('shows the size of a picked stamp, and deletes it', async () => {
    state.stampId.set('door-single');
    state.stampSize.set(64);
    state.placeStamp(100, 100, 'スタンプ 1');
    state.selection.set(state.hitTest(100, 100));

    const element = await drawn();
    expect((element.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('64');
    expect(element.querySelector('input[type="range"] + span')?.textContent?.trim()).toBe('64px');

    (element.querySelector('button') as HTMLButtonElement).click();

    expect(state.selection()).toBeNull();
    expect((state.current.layers.find((layer) => layer.kind === 'stamp') as StampLayer).items).toHaveLength(0);
  });
});

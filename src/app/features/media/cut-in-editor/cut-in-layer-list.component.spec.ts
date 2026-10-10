import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInLayerListComponent } from '@axe/features/media/cut-in-editor/cut-in-layer-list.component';
import { TIMELINE_ROW_H_PX } from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { reorderRows } from '@axe/ui/dragging/row-reorder';

describe('CutInLayerListComponent', () => {
  let fixture: ComponentFixture<CutInLayerListComponent>;
  let component: CutInLayerListComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInLayerListComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CutInLayerListComponent);
    component = fixture.componentInstance;
  });

  function makeLayer(name: string): CutInLayer {
    const layer = new CutInLayer();
    layer.initialize();
    layer.name = name;
    return layer;
  }

  function show(layers: CutInLayer[]): void {
    fixture.componentRef.setInput('layers', layers);
    fixture.componentRef.setInput('isEditable', true);
    fixture.detectChanges();
  }

  function rowText(): string[] {
    return [...fixture.nativeElement.querySelectorAll('li span')].map((el) => (el as HTMLElement).textContent?.trim());
  }

  it('has no heads to show where there are no layers', () => {
    show([]);

    expect(fixture.nativeElement.querySelectorAll('li')).toHaveLength(0);
  });

  it('stands each head as tall as the band it sits beside', () => {
    show([makeLayer('上'), makeLayer('下')]);

    const rows = [...fixture.nativeElement.querySelectorAll('li')] as HTMLElement[];
    for (const row of rows) expect(row.style.height).toBe(`${TIMELINE_ROW_H_PX}px`);
  });

  it('reads the stack from the top down', () => {
    show([makeLayer('下'), makeLayer('中'), makeLayer('上')]);

    expect(rowText()).toEqual(['上', '中', '下']);
  });

  it('names a layer that was never named', () => {
    show([makeLayer('')]);

    expect(rowText()).toEqual(['（名称未設定）']);
  });

  it('hands out the layer that was clicked', () => {
    const layers = [makeLayer('下'), makeLayer('上')];
    show(layers);
    let picked: CutInLayer | null = null;
    component.selectLayer.subscribe((layer) => (picked = layer));

    (fixture.nativeElement.querySelectorAll('li')[0] as HTMLElement).click();

    expect(picked).toBe(layers[1]);
  });

  it('moves a layer up the list from the menu held on its row, for a screen that cannot drag it', () => {
    const t = TestBed.inject(TRANSLATE_FN);
    const layers = [makeLayer('下'), makeLayer('中'), makeLayer('上')];
    show(layers);
    vi.spyOn(TestBed.inject(PointerDeviceService), 'isAllowedToOpenContextMenu', 'get').mockReturnValue(true);
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const asked: { held: CutInLayer; over: CutInLayer; side: 'before' | 'after' | null }[] = [];
    component.reorder.subscribe((dropped) => asked.push(dropped));

    const middle = fixture.nativeElement.querySelectorAll('li')[1] as HTMLElement;
    middle.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const actions = open.mock.calls[0][1] as ContextMenuAction[];
    actions.find((action) => action.name === t('common.reorder.up'))?.action?.();

    expect(asked).toHaveLength(1);
    const order = reorderRows(layers, asked[0].held, asked[0].over, asked[0].side)!;
    expect([...order].reverse().map((layer) => layer.name)).toEqual(['中', '上', '下']);
    vi.restoreAllMocks();
  });

  it('asks for a layer to be turned off', () => {
    const layers = [makeLayer('下')];
    show(layers);
    let toggled: CutInLayer | null = null;
    component.toggleHidden.subscribe((layer) => (toggled = layer));

    (fixture.nativeElement.querySelector('li button') as HTMLElement).click();

    expect(toggled).toBe(layers[0]);
  });
});

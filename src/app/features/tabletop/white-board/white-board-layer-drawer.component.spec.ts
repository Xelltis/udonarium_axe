import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createLayer, MapLayer } from '@axe/domain/map-editor/scene';
import {
  LayerDrawerAction,
  WhiteBoardLayerDrawerComponent,
} from '@axe/features/tabletop/white-board/white-board-layer-drawer.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('WhiteBoardLayerDrawerComponent', () => {
  let fixture: ComponentFixture<WhiteBoardLayerDrawerComponent>;
  let actions: LayerDrawerAction[];
  const sheet = createLayer('freehand', '');
  const named = createLayer('shape', 'Plan');

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [WhiteBoardLayerDrawerComponent], providers: [...TEST_PROVIDERS] });
    fixture = TestBed.createComponent(WhiteBoardLayerDrawerComponent);
    fixture.componentRef.setInput('groups', [
      { name: '', layers: [sheet] },
      { name: 'Maps', layers: [named] },
    ]);
    fixture.componentRef.setInput('layerCount', 2);
    fixture.componentRef.setInput('groupNames', ['Maps']);
    fixture.componentRef.setInput('activeLayerId', sheet.id);
    fixture.componentRef.setInput('standing', []);
    actions = [];
    fixture.componentInstance.action.subscribe((action) => actions.push(action));
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function buttonWithIcon(icon: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const found = buttons.find((button) => button.textContent?.trim() === icon);
    if (!found) throw new Error(`no button showing ${icon}`);
    return found;
  }

  it('shows the sheet worked on in the group it is filed in, and in none where it is filed in none', async () => {
    const shownGroup = async (activeLayerId: string) => {
      fixture.componentRef.setInput('activeLayerId', activeLayerId);
      fixture.detectChanges();
      await fixture.whenStable();
      const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
      return select.options[select.selectedIndex]?.value;
    };
    fixture.componentRef.setInput('groups', [
      { name: '', layers: [sheet] },
      { name: 'Maps', layers: [{ ...named, group: 'Maps' }] },
    ]);
    fixture.componentRef.setInput('groupNames', ['Battle', 'Maps']);

    expect(await shownGroup(named.id)).toBe('Maps');
    expect(await shownGroup(sheet.id)).toBe('');
  });

  it('asks for a new sheet and a new group from the header', () => {
    buttonWithIcon('add').click();
    buttonWithIcon('create_new_folder').click();
    expect(actions).toEqual([{ kind: 'addSheet' }, { kind: 'makeGroup' }]);
  });

  it('names an unnamed sheet after what it holds, and hands back a clearing rename as nothing', () => {
    const inputs: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input:not([type])'));
    const kindName = (fixture.componentInstance as unknown as { layerName(layer: MapLayer): string }).layerName(sheet);
    expect(kindName.length).toBeGreaterThan(0);
    expect(inputs[0].value).toBe(kindName);

    inputs[0].value = kindName;
    inputs[0].dispatchEvent(new Event('change'));
    inputs[0].value = ' Sketch ';
    inputs[0].dispatchEvent(new Event('change'));

    expect(actions).toEqual([
      { kind: 'renameLayer', layer: sheet, name: '' },
      { kind: 'renameLayer', layer: sheet, name: 'Sketch' },
    ]);
  });

  it('shows the controls of the sheet being worked on only', () => {
    const ranges: HTMLInputElement[] = Array.from(fixture.nativeElement.querySelectorAll('input[type="range"]'));
    expect(ranges).toHaveLength(1);
    ranges[0].value = '0.5';
    ranges[0].dispatchEvent(new Event('input'));
    expect(actions).toEqual([{ kind: 'setLayerOpacity', layer: sheet, opacity: 0.5 }]);
  });
});

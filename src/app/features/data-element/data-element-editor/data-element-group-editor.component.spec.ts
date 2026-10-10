import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BottomSheetRef, BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ObjectNode } from '@axe/core/sync/object-node';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { DataElementFieldEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-field-editor.component';
import { DataElementGroupEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-group-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function sheet(): { owner: ObjectNode; resources: DataElement; basic: DataElement; extra: DataElement } {
  const owner = new ObjectNode();
  owner.initialize();
  const root = DataElement.create('character', '');
  const detail = DataElement.create('detail', '');
  const resources = DataElement.create('リソース', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const basic = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  const extra = DataElement.create('追加', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  basic.appendChild(DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
  owner.appendChild(root);
  root.appendChild(detail);
  detail.appendChild(resources);
  resources.appendChild(basic);
  resources.appendChild(extra);
  return { owner, resources, basic, extra };
}

const names = (parent: DataElement) => parent.children.map((child) => (child as DataElement).name);

describe('DataElementGroupEditorComponent', () => {
  let fixture: ComponentFixture<DataElementGroupEditorComponent>;
  let ref: BottomSheetRef;
  let opened: { component: unknown; inputs: Record<string, unknown> | undefined }[];

  function open(element: DataElement): HTMLElement {
    ref = new BottomSheetRef();
    opened = [];
    TestBed.configureTestingModule({
      imports: [DataElementGroupEditorComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: BottomSheetRef, useValue: ref },
        {
          provide: BottomSheetService,
          useValue: {
            open: (component: unknown, options: { inputs?: Record<string, unknown> }) => {
              opened.push({ component, inputs: options.inputs });
              return new BottomSheetRef();
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(DataElementGroupEditorComponent);
    fixture.componentRef.setInput('element', element);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.inject(SnackbarService).dismiss());

  const press = (host: HTMLElement, testId: string) => {
    (host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('renames the group once the name is left', () => {
    const { basic } = sheet();
    const host = open(basic);
    const box = host.querySelector('[data-testid="group-editor-name"]') as HTMLInputElement;

    box.value = '能力';
    box.dispatchEvent(new Event('input'));
    box.dispatchEvent(new Event('change'));

    expect(basic.name).toBe('能力');
  });

  it('gives the heading a mark from the list, and takes it away again', () => {
    const { basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-icon');
    (host.querySelector('[data-testid="group-editor-icons"] button[aria-label="shield"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(basic.getAttribute('cs-icon')).toBe('shield');

    press(host, 'group-editor-icon');
    const clear = [...host.querySelectorAll<HTMLButtonElement>('[data-testid="group-editor-icons"] button')].find(
      (button) => !button.getAttribute('aria-label') && !button.querySelector('.material-icons')
    )!;
    clear.click();
    expect(basic.getAttribute('cs-icon')).toBe('');
  });

  it('shows the group as a table, with the table settings', () => {
    const { basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-table');

    expect(basic.viewMode).toBe(DataElementViewMode.TABLE);
    expect(host.querySelector('game-data-element-field-options')).not.toBeNull();
  });

  it('adds a field of the kind picked, and hands over to its editor', async () => {
    const { basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-add-field');
    (host.querySelector('[role="radio"][data-type="number"]') as HTMLButtonElement).click();

    expect(names(basic)).toHaveLength(2);
    expect((basic.children[1] as DataElement).fieldType).toBe(DataElementFieldType.NUMBER);
    expect(opened).toEqual([
      { component: DataElementFieldEditorComponent, inputs: { element: basic.children[1], focusName: true } },
    ]);
    await expect(ref.closed).resolves.toBeNull();
  });

  it('steps the group among those beside it', () => {
    const { resources, basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-moveDown');

    expect(names(resources)).toEqual(['追加', '基本']);
  });

  it('saves the group as a template and says so', () => {
    const { basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-save-template');

    expect(TestBed.inject(SnackbarService).current()?.message).toContain('基本');
    expect(host.querySelector('[data-testid="group-editor-templates"]')).not.toBeNull();
  });

  it('deletes the group with everything in it, closing the editor', async () => {
    const { resources, basic } = sheet();
    const host = open(basic);

    press(host, 'group-editor-delete');

    await expect(ref.closed).resolves.toBeNull();
    expect(names(resources)).toEqual(['追加']);
  });

  it('names its delete after what it deletes', () => {
    const { resources } = sheet();
    const host = open(resources);

    expect(host.querySelector('[data-testid="group-editor-delete"]')?.textContent).toContain('セクション');
    expect(host.querySelector('[data-testid="group-editor-move-to"]')).toBeNull();
  });
});

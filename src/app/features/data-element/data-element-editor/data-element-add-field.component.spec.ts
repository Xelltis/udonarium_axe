import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BottomSheetRef, BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { DataElementAddFieldComponent } from '@axe/features/data-element/data-element-editor/data-element-add-field.component';
import { DataElementFieldEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-field-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DataElementAddFieldComponent', () => {
  let fixture: ComponentFixture<DataElementAddFieldComponent>;
  let ref: BottomSheetRef<DataElement>;
  let opened: { component: unknown; inputs?: Record<string, unknown> }[];

  function open(container: DataElement): HTMLElement {
    ref = new BottomSheetRef<DataElement>();
    opened = [];
    TestBed.configureTestingModule({
      imports: [DataElementAddFieldComponent],
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
    fixture = TestBed.createComponent(DataElementAddFieldComponent);
    fixture.componentRef.setInput('container', container);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('makes a field of the kind picked at the end of the group, and hands over to its editor', async () => {
    const group = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
    group.appendChild(DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
    const host = open(group);

    (host.querySelector('[role="radio"][data-type="resource"]') as HTMLButtonElement).click();

    const added = group.children[1] as DataElement;
    expect(added.fieldType).toBe(DataElementFieldType.RESOURCE);
    expect(opened).toEqual([
      { component: DataElementFieldEditorComponent, inputs: { element: added, focusName: true } },
    ]);
    await expect(ref.closed).resolves.toBe(added);
  });

  it('only closes where the group takes no field', async () => {
    const section = DataElement.create('能力', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
    const host = open(section);

    (host.querySelector('[role="radio"][data-type="text"]') as HTMLButtonElement).click();

    await expect(ref.closed).resolves.toBeNull();
    expect(section.children).toHaveLength(0);
    expect(opened).toEqual([]);
  });
});

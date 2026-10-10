import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BottomSheetRef } from '@axe/application/ui/bottom-sheet.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
} from '@axe/domain/data/data-element';
import { DataElementFieldEditorComponent } from '@axe/features/data-element/data-element-editor/data-element-field-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function sheet(): { basic: DataElement; hp: DataElement; mp: DataElement; skills: DataElement } {
  const detail = DataElement.create('detail', '');
  const resources = DataElement.create('リソース', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const basic = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  const hp = DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
  const mp = DataElement.create('MP', 5, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
  const skillSection = DataElement.create('スキル', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
  const skills = DataElement.create('アクション', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  detail.appendChild(resources);
  resources.appendChild(basic);
  basic.appendChild(hp);
  basic.appendChild(mp);
  detail.appendChild(skillSection);
  skillSection.appendChild(skills);
  return { basic, hp, mp, skills };
}

const names = (parent: DataElement) => parent.children.map((child) => (child as DataElement).name);

describe('DataElementFieldEditorComponent', () => {
  let fixture: ComponentFixture<DataElementFieldEditorComponent>;
  let ref: BottomSheetRef;

  function open(element: DataElement): HTMLElement {
    ref = new BottomSheetRef();
    TestBed.configureTestingModule({
      imports: [DataElementFieldEditorComponent],
      providers: [...TEST_PROVIDERS, { provide: BottomSheetRef, useValue: ref }],
    });
    fixture = TestBed.createComponent(DataElementFieldEditorComponent);
    fixture.componentRef.setInput('element', element);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.inject(SnackbarService).dismiss());

  const nameBox = (host: HTMLElement) => host.querySelector('[data-testid="field-editor-name"]') as HTMLInputElement;
  const type = (host: HTMLElement, kind: string) =>
    host.querySelector(`[role="radio"][data-type="${kind}"]`) as HTMLButtonElement;
  const press = (host: HTMLElement, testId: string) =>
    (host.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();

  function typeName(host: HTMLElement, value: string): void {
    const box = nameBox(host);
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('renames the row once the name is left', () => {
    const { hp } = sheet();
    const host = open(hp);

    typeName(host, '体力');
    nameBox(host).dispatchEvent(new Event('change'));

    expect(hp.name).toBe('体力');
  });

  it('turns away a name another row beside it has, and says why', () => {
    const { hp } = sheet();
    const host = open(hp);

    typeName(host, 'MP');
    nameBox(host).dispatchEvent(new Event('change'));

    expect(hp.name).toBe('HP');
    expect(nameBox(host).getAttribute('aria-invalid')).toBe('true');
  });

  it('marks the kind of the row and changes it from the grid', () => {
    const { hp } = sheet();
    const host = open(hp);
    expect(type(host, 'text').getAttribute('aria-checked')).toBe('true');

    type(host, 'check').click();
    fixture.detectChanges();

    expect(hp.fieldType).toBe(DataElementFieldType.CHECK);
    expect(type(host, 'check').getAttribute('aria-checked')).toBe('true');
  });

  it('shows the settings of a kind that has them', () => {
    const { hp } = sheet();
    const host = open(hp);
    expect(host.querySelector('game-data-element-field-options')).toBeNull();

    type(host, 'resource').click();
    fixture.detectChanges();

    expect(host.querySelector('game-data-element-field-options')).not.toBeNull();
  });

  it('steps the row down, and greys out what it cannot do from there', () => {
    const { basic, hp } = sheet();
    const host = open(hp);
    expect((host.querySelector('[data-testid="field-editor-moveUp"]') as HTMLButtonElement).disabled).toBe(true);

    press(host, 'field-editor-moveDown');
    fixture.detectChanges();

    expect(names(basic)).toEqual(['MP', 'HP']);
    expect((host.querySelector('[data-testid="field-editor-moveUp"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('moves the row into another group picked from the list', () => {
    const { basic, hp, skills } = sheet();
    const host = open(hp);

    press(host, 'field-editor-move-to');
    fixture.detectChanges();
    const target = host.querySelector('[data-testid="field-editor-move-targets"] li button') as HTMLButtonElement;
    expect(target.textContent).toContain('スキル › アクション');
    target.click();
    fixture.detectChanges();

    expect(names(basic)).toEqual(['MP']);
    expect(names(skills)).toEqual(['HP']);
    expect(host.querySelector('[data-testid="field-editor"]')).not.toBeNull();
  });

  it('adds a row below and goes on to edit it', () => {
    const { basic, hp } = sheet();
    const host = open(hp);

    press(host, 'field-editor-add-below');
    fixture.detectChanges();

    expect(names(basic)).toHaveLength(3);
    expect(nameBox(host).value).toBe(names(basic)[1]);
  });

  it('deletes the row, closing the editor, with a notice that can put it back', async () => {
    const { basic, hp } = sheet();
    const host = open(hp);

    press(host, 'field-editor-delete');

    await expect(ref.closed).resolves.toBeNull();
    expect(names(basic)).toEqual(['MP']);
    expect(TestBed.inject(SnackbarService).current()?.action).toBeDefined();
  });

  it('switches the popup from its row', () => {
    const { hp } = sheet();
    const host = open(hp);

    press(host, 'field-editor-popup');
    fixture.detectChanges();

    expect(hp.getAttribute(DataElementAttribute.POPUP)).toBe('true');
    expect(host.querySelector('[data-testid="field-editor-popup"]')?.getAttribute('aria-checked')).toBe('true');
  });
});

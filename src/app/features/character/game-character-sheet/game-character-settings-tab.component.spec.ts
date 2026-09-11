import { ComponentRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { saveElementTemplate } from '@axe/domain/data/data-element-templates';
import { GameCharacterSettingsTabComponent } from '@axe/features/character/game-character-sheet/game-character-settings-tab.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameCharacterSettingsTabComponent', () => {
  let component: GameCharacterSettingsTabComponent;
  let fixture: ComponentFixture<GameCharacterSettingsTabComponent>;
  let componentRef: ComponentRef<GameCharacterSettingsTabComponent>;
  let pointerDeviceService: PointerDeviceService;
  let character: GameCharacter;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameCharacterSettingsTabComponent],
      providers: [...TEST_PROVIDERS],
    });
    await TestBed.compileComponents();
    fixture = TestBed.createComponent(GameCharacterSettingsTabComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;
    pointerDeviceService = TestBed.inject(PointerDeviceService);
    character = GameCharacter.create('settings-test', 1, '');
    componentRef.setInput('character', character);
  });

  afterEach(() => {
    character.destroy();
  });

  it('can be created', () => {
    expect(component).toBeTruthy();
  });

  describe('templates kept on the piece', () => {
    function partTables(): readonly DataElement[] {
      return character.detailDataElement!.getFirstElementByName('パーツ')!.children;
    }

    it('lists the templates the piece keeps', () => {
      saveElementTemplate(character, partTables()[0]);

      expect(component.elementTemplates().map((template) => template.name)).toEqual(['頭']);
    });

    it('leaves the sheet and its names where they were found', () => {
      const root = character.rootDataElement!;
      saveElementTemplate(character, partTables()[0]);

      expect(character.rootDataElement).toBe(root);
      expect(character.detailDataElement?.parent).toBe(root);
      expect(DataElement.findElementByReference(root, '義眼')).toBe(partTables()[0].children[0]);
    });

    it('opens every template in an editor of its own', () => {
      const [head, arm] = partTables();
      saveElementTemplate(character, head);
      saveElementTemplate(character, arm);

      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelectorAll('.elm-template-editor')).toHaveLength(2);
    });

    it('adds a template to the end of the sheet as a section of its own', () => {
      saveElementTemplate(character, partTables()[0]);

      component.addTemplateToSheet(component.elementTemplates()[0]);

      const added = character.detailDataElement!.children.at(-1)!;
      expect(added.name).toBe('頭');
      expect(added.fieldRole).toBe(DataElementRole.SECTION);
      expect(added.viewMode).toBe(DataElementViewMode.TABLE);
      expect(added.children.map((row) => row.name)).toEqual(['義眼', 'センサー']);
    });
  });

  it('clamps the piece size, ends the drag and says it changed', () => {
    const objectChange = TestBed.inject(ObjectChangeService);
    const notifySpy = vi.spyOn(objectChange, 'notifyChanged');
    character.komaImageHeight = 120;
    pointerDeviceService.isDragging = true;

    component.chkKomaSize(900);

    expect(character.komaImageHeight).toBe(750);
    expect(pointerDeviceService.isDragging).toBe(false);
    expect(notifySpy).toHaveBeenCalledWith(character.identifier);
  });

  it('keeps the size it had for a value it cannot read', () => {
    character.komaImageHeight = 180;
    component.chkKomaSize(Number.NaN);
    expect(character.komaImageHeight).toBe(180);
  });

  it('sets the flag and says it changed', () => {
    const objectChange = TestBed.inject(ObjectChangeService);
    const notifySpy = vi.spyOn(objectChange, 'notifyChanged');

    component.setSpecifyKomaImageFlag(true);

    expect(character.specifyKomaImageFlag).toBe(true);
    expect(notifySpy).toHaveBeenCalledWith(character.identifier);
  });

  it('turns the old check fields into proper tables', () => {
    const section = DataElement.create('旧情報', '', { [DataElementAttribute.ROLE]: DataElementRole.SECTION });
    const group = DataElement.create('基本', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
    const legacy = DataElement.create('旧表', '|項目|済み|\n|灯火|[]|', {
      [DataElementAttribute.ROLE]: DataElementRole.FIELD,
      [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.CHECK_TABLE,
      type: DataElementType.CHECK_TABLE,
    });
    section.appendChild(group);
    group.appendChild(legacy);
    character.detailDataElement!.appendChild(section);

    component.convertLegacyCheckTables();

    const migrated = character.detailDataElement!.children.find((child) => child.name === '旧表');
    const checkCell = migrated?.children[0].getFirstElementByName('済み');
    expect(migrated?.fieldRole).toBe(DataElementRole.SECTION);
    expect(migrated?.viewMode).toBe(DataElementViewMode.TABLE);
    expect(checkCell?.fieldType).toBe(DataElementFieldType.CHECK);
    expect(checkCell?.value).toBe(0);
    expect(group.getFirstElementByName('旧表')).toBeNull();
  });

  it('counts what there is to convert', () => {
    expect(component.legacyCheckTableCount()).toBe(0);
  });

  it('emits the change of place and leaves the setting to its parent', () => {
    const emitted: string[] = [];
    component.locationChange.subscribe((v) => emitted.push(v));

    const select = document.createElement('select');
    select.innerHTML = '<option value="table"></option><option value="common"></option>';
    select.value = 'common';
    const event = new Event('change');
    Object.defineProperty(event, 'target', { value: select });

    component.onSetLocation(event);
    expect(emitted).toEqual(['common']);
  });

  it('puts both angles back to nothing', () => {
    character.rotate = 90;
    character.roll = 180;

    component.resetRotate();
    component.resetRoll();

    expect(character.rotate).toBe(0);
    expect(character.roll).toBe(0);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DataElement,
  DataElementAttribute,
  DataElementFieldType,
  DataElementRole,
  DataElementType,
  DataElementViewMode,
} from '@axe/domain/data/data-element';
import { GameDataElementFieldOptionsComponent } from '@axe/features/data-element/game-data-element-field-options/game-data-element-field-options.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('GameDataElementFieldOptionsComponent', () => {
  let component: GameDataElementFieldOptionsComponent;
  let fixture: ComponentFixture<GameDataElementFieldOptionsComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [GameDataElementFieldOptionsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(GameDataElementFieldOptionsComponent);
    component = fixture.componentInstance;
  });

  function show(element: DataElement, kind: 'field' | 'container' = 'field'): HTMLElement {
    fixture.componentRef.setInput('element', element);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  describe('the bounds of a number', () => {
    it('writes the maximum onto the attribute', () => {
      const element = DataElement.create('Str', 10, { fieldType: DataElementFieldType.NUMBER });
      show(element);

      component.maxText = 100;

      expect(element.getAttribute(DataElementAttribute.MAX)).toBe('100');
    });

    it('stores the bounds as attributes even when they arrive as numbers', () => {
      const element = DataElement.create('Str', 10, { fieldType: DataElementFieldType.NUMBER });
      show(element);

      component.maxText = 300;
      component.minText = 0;

      expect(element.getAttribute(DataElementAttribute.MAX)).toBe('300');
      expect(element.getAttribute(DataElementAttribute.MIN)).toBe('0');
    });

    it('removes the attribute when a bound is cleared', () => {
      const element = DataElement.create('Str', 10, { fieldType: DataElementFieldType.NUMBER, max: '300' });
      show(element);

      component.maxText = null;

      expect(element.getAttribute(DataElementAttribute.MAX)).toBe('');
    });

    it('shows the bounds of a number and not those of a resource', () => {
      const host = show(DataElement.create('Str', 10, { fieldType: DataElementFieldType.NUMBER }));

      expect(host.querySelector('input[name="data-min"]')).not.toBeNull();
      expect(host.querySelector('input[name="data-max-base"]')).toBeNull();
    });
  });

  describe('the maximum of a resource', () => {
    function resource(): DataElement {
      return DataElement.create('HP', 20, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: 20,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
      });
    }

    it('follows its base and correction once they are set', () => {
      const element = resource();
      show(element);

      component.maxBaseText = 30;
      expect(Number(element.value)).toBe(30);

      component.maxCorrectionText = 5;
      expect(Number(element.value)).toBe(35);
    });

    it('reads the plain maximum as the base where no base is set', () => {
      const element = resource();
      element.setAttribute(DataElementAttribute.MAX, '25');
      show(element);

      expect(component.maxBaseText).toBe('25');
    });
  });

  it('stores the field metadata as attributes', () => {
    const element = DataElement.create('種族', '人間', { fieldType: DataElementFieldType.SELECT });
    show(element);

    component.choicesText = '人間\nエルフ';
    component.unitText = '点';
    component.minText = '0';
    component.maxText = '100';

    expect(element.getAttribute(DataElementAttribute.CHOICES)).toBe('人間\nエルフ');
    expect(element.getAttribute(DataElementAttribute.UNIT)).toBe('点');
    expect(element.getAttribute(DataElementAttribute.MIN)).toBe('0');
    expect(element.getAttribute(DataElementAttribute.MAX)).toBe('100');

    component.unitText = '';

    expect(element.getAttribute(DataElementAttribute.UNIT)).toBe('');
  });

  it('keeps the formula of a calculated field', () => {
    const element = DataElement.create('合計', '', { fieldType: DataElementFieldType.CALC });
    show(element);

    component.formulaText = 'HP + MP';

    expect(element.getAttribute(DataElementAttribute.FORMULA)).toBe('HP + MP');
    expect(component.formulaText).toBe('HP + MP');
  });

  describe('a cell of a table', () => {
    function cellOfTable(): DataElement {
      const table = DataElement.create('技能表', '', {
        role: DataElementRole.SECTION,
        viewMode: DataElementViewMode.TABLE,
      });
      const row = DataElement.create('ギャップ', '', { role: DataElementRole.GROUP });
      const cell = DataElement.create('ギャップ1', 0, {
        role: DataElementRole.FIELD,
        fieldType: DataElementFieldType.CHECK,
      });
      table.appendChild(row);
      row.appendChild(cell);
      return cell;
    }

    it('is told apart from a field outside a table', () => {
      show(cellOfTable());
      expect(component.isTableCellField()).toBe(true);

      show(DataElement.create('メモ', '', { role: DataElementRole.FIELD }));
      expect(component.isTableCellField()).toBe(false);
    });

    it('sets the cell metadata', () => {
      const cell = cellOfTable();
      show(cell);

      component.columnLabelText = 'G';
      component.columnGroupText = '技巧';
      component.tableCellText = '技巧-身体';
      component.isGapCell = true;

      expect(cell.getAttribute(DataElementAttribute.COLUMN_LABEL)).toBe('G');
      expect(cell.getAttribute(DataElementAttribute.COLUMN_GROUP)).toBe('技巧');
      expect(cell.getAttribute(DataElementAttribute.CELL_TEXT)).toBe('技巧-身体');
      expect(cell.getAttribute(DataElementAttribute.CELL_KIND)).toBe('gap');

      component.isGapCell = false;

      expect(cell.getAttribute(DataElementAttribute.CELL_KIND)).toBe('');
    });

    it('gives a gap cell a heading where it has none', () => {
      const cell = cellOfTable();
      show(cell);

      component.isGapCell = true;

      expect(cell.getAttribute(DataElementAttribute.COLUMN_LABEL)).not.toBe('');
    });
  });

  it('sets the row heading of a table', () => {
    const table = DataElement.create('技能表タイプ2', '', {
      role: DataElementRole.SECTION,
      viewMode: DataElementViewMode.TABLE,
    });
    show(table, 'container');

    component.rowHeaderLabelText = '技能';

    expect(table.getAttribute(DataElementAttribute.ROW_HEADER_LABEL)).toBe('技能');
  });

  it('offers the judgement settings only once judgement is on', () => {
    const table = DataElement.create('技能表', '', {
      role: DataElementRole.SECTION,
      viewMode: DataElementViewMode.TABLE,
    });
    const host = show(table, 'container');
    expect(host.querySelector('input[name="data-base-difficulty"]')).toBeNull();

    component.toggleJudgeModeEnabled();
    fixture.detectChanges();

    expect(host.querySelector('input[name="data-base-difficulty"]')).not.toBeNull();
  });

  it('switches the full-size pop-up of an image on and off', () => {
    const element = DataElement.create('参考画像', '', { fieldType: DataElementFieldType.IMAGE });
    show(element);

    expect(component.isImagePopupOriginal()).toBe(false);

    component.toggleImagePopupOriginal();

    expect(component.isImagePopupOriginal()).toBe(true);
    expect(element.getAttribute(DataElementAttribute.IMAGE_POPUP_ORIGINAL)).toBe('true');

    component.toggleImagePopupOriginal();

    expect(component.isImagePopupOriginal()).toBe(false);
    expect(element.getAttribute(DataElementAttribute.IMAGE_POPUP_ORIGINAL)).toBe('');
  });

  describe('what a resource does when it moves', () => {
    function resourceField(): DataElement {
      return DataElement.create('HP', 200, {
        type: DataElementType.NUMBER_RESOURCE,
        currentValue: 200,
        [DataElementAttribute.FIELD_TYPE]: DataElementFieldType.RESOURCE,
      });
    }

    it('is asked about only for a resource', () => {
      show(DataElement.create('メモ', 'テキスト'));
      expect(component.canShowChangeFeedback()).toBe(false);

      show(resourceField());
      expect(component.canShowChangeFeedback()).toBe(true);
    });

    it('starts out neither seen nor heard', () => {
      show(resourceField());

      expect(component.playsEffectOnChange()).toBe(false);
      expect(component.playsSoundOnChange()).toBe(false);
    });

    it('turns each one on and off again', () => {
      show(resourceField());

      component.toggleChangeEffect();
      expect(component.playsEffectOnChange()).toBe(true);
      component.toggleChangeEffect();
      expect(component.playsEffectOnChange()).toBe(false);

      component.toggleChangeSound();
      expect(component.playsSoundOnChange()).toBe(true);
      component.toggleChangeSound();
      expect(component.playsSoundOnChange()).toBe(false);
    });

    it('picks the sound of flesh or of a machine', () => {
      const element = resourceField();
      show(element);

      expect(component.soundSetOnChange()).toBe('flesh');

      component.setSoundSetOnChange('mech');
      expect(component.soundSetOnChange()).toBe('mech');
      expect(element.getAttribute(DataElementAttribute.CHANGE_SOUND_SET)).toBe('mech');

      component.setSoundSetOnChange('flesh');
      expect(component.soundSetOnChange()).toBe('flesh');
    });

    it('offers the type only once the sound is on, showing what is stored', async () => {
      const element = resourceField();
      element.setAttribute(DataElementAttribute.CHANGE_SOUND_SET, 'mech');
      const host = show(element);

      const query = () => host.querySelector('select[name="data-change-sound-set"]');
      expect(query()).toBeNull();

      component.toggleChangeSound();
      fixture.detectChanges();
      await fixture.whenStable();

      const select = query() as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.value).toBe('mech');
    });

    it('leaves anything that is not a resource alone', () => {
      const note = DataElement.create('メモ', 'テキスト');
      show(note);

      component.toggleChangeSound();
      component.setSoundSetOnChange('mech');
      component.togglePieceGauge();
      component.toggleResourceSlider();

      expect(note.getAttribute(DataElementAttribute.CHANGE_SOUND)).toBe('');
      expect(note.getAttribute(DataElementAttribute.CHANGE_SOUND_SET)).toBe('');
      expect(note.getAttribute(DataElementAttribute.PIECE_GAUGE)).toBe('');
      expect(note.getAttribute(DataElementAttribute.RESOURCE_SLIDER)).toBe('');
    });
  });
});

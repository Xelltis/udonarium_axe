import { TestBed } from '@angular/core/testing';
import { DataElement } from '@axe/domain/data/data-element';
import { MarkDown } from '@axe/domain/data/mark-down';

describe('MarkDown', () => {
  let markDown: MarkDown;

  beforeEach(() => {
    TestBed.configureTestingModule({});

    markDown = new MarkDown();
    markDown.initialize();
  });

  describe('markDownCheckBox()', () => {
    it('renders an empty check box', () => {
      const result = markDown.markDownCheckBox('[]項目1', 'base');
      expect(result).toContain('<input');
      expect(result).toContain('type="checkbox"');
      expect(result).not.toContain('checked');
    });

    it('renders a ticked one', () => {
      const result = markDown.markDownCheckBox('[x]項目1', 'base');
      expect(result).toContain('checked="checked"');
    });

    it('renders a full-width one', () => {
      const result = markDown.markDownCheckBox('［x］項目1', 'base');
      expect(result).toContain('checked="checked"');
    });

    it('renders one ticked with a capital', () => {
      const result = markDown.markDownCheckBox('[X]項目1', 'base');
      expect(result).toContain('checked="checked"');
    });

    it('gives each an identifier built from the base', () => {
      const result = markDown.markDownCheckBox('[]項目', 'test-id');
      expect(result).toContain('id="test-id_mark_00000000"');
    });

    it('numbers those identifiers in order', () => {
      const result = markDown.markDownCheckBox('[]項目1[]項目2', 'base');
      expect(result).toContain('id="base_mark_00000000"');
      expect(result).toContain('id="base_mark_00000001"');
    });

    it('escapes the markup', () => {
      const result = markDown.markDownCheckBox('<script>alert(1)</script>', 'base');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&lt;script&gt;');
    });

    it('keeps an identifier with quotes and brackets inside the id, which still reads back as written', () => {
      const identifier = `a"b'c<d>e&f`;
      const host = document.createElement('div');
      host.innerHTML = markDown.markDownCheckBox('[]item', identifier);

      const inputs = host.querySelectorAll('input');
      expect(inputs.length).toBe(1);
      expect(inputs[0].getAttributeNames().sort()).toEqual(['class', 'id', 'type']);
      expect(inputs[0].id).toBe(`${identifier}_mark_00000000`);
    });
  });

  describe('markDownTable()', () => {
    it('renders a table written in cells', () => {
      const input = '|列1|列2|\n|データ1|データ2|';
      const result = markDown.markDownTable(input);
      expect(result).toContain('markdown_table');
      expect(result).toContain('markdown_table_row');
      expect(result).toContain('markdown_table_cell');
      expect(result).toContain('列1');
      expect(result).toContain('列2');
    });

    it('leaves a line that is not a table alone', () => {
      const result = markDown.markDownTable('通常のテキスト');
      expect(result).toContain('通常のテキスト');
      expect(result).not.toContain('markdown_table');
    });

    it('closes the table when ordinary text follows it', () => {
      const input = '|列1|列2|\n通常テキスト';
      const result = markDown.markDownTable(input);
      expect(result).toContain('</div>');
      expect(result).toContain('通常テキスト');
    });

    it('reads a full-width bar as a separator too', () => {
      const input = '｜列1｜列2｜';
      const result = markDown.markDownTable(input);
      expect(result).toContain('markdown_table');
    });
  });

  describe('changeMarkDownCheckBox()', () => {
    it('does nothing for an identifier it cannot use', () => {
      markDown.changeMarkDownCheckBox('invalid', 1);
      // and throws nothing
    });

    it('does nothing for an object that is not there', () => {
      markDown.changeMarkDownCheckBox('nonexistent_mark_00000000', 1);
      // and throws nothing
    });

    it('ignores a second call at the same moment', () => {
      markDown.changeMarkDownCheckBox('any_mark_00000000', 100);
      markDown.changeMarkDownCheckBox('any_mark_00000000', 100);
      // the second does nothing, the moment being the same
    });

    it('throws nothing for text with no check boxes in it', () => {
      const data = DataElement.create('memo', 'plain text');

      expect(() => markDown.changeMarkDownCheckBox(`${data.identifier}_mark_00000000`, 1)).not.toThrow();
      expect(data.value).toBe('plain text');
    });
  });
});

import { DataElement, DataElementAttribute, DataElementFieldType } from '@axe/domain/data/data-element';
import { evalCalcFormula } from '@axe/domain/data/data-element-calc';
import {
  buildCalcEnv,
  calcSourceIdentifiers,
  createCalcPass,
  evaluateCalcElement,
} from '@axe/domain/data/data-element-calc-env';

describe('buildCalcEnv', () => {
  it('returns an environment that looks numeric leaves up by name', () => {
    const detail = DataElement.create('detail', '');
    const hp = DataElement.create('HP', '15');
    detail.appendChild(hp);

    const env = buildCalcEnv(hp);
    expect(env['HP']).toBe(15);
  });

  it('leaves out anything that is not a number', () => {
    const detail = DataElement.create('detail', '');
    const memo = DataElement.create('memo', 'こんにちは');
    detail.appendChild(memo);

    const env = buildCalcEnv(memo);
    expect(env['memo']).toBeUndefined();
  });

  it('looks a deep leaf up by its full path', () => {
    const detail = DataElement.create('detail', '');
    const section = DataElement.create('基本', '');
    const group = DataElement.create('能力', '');
    const str = DataElement.create('筋力', '8');
    detail.appendChild(section);
    section.appendChild(group);
    group.appendChild(str);

    const env = buildCalcEnv(str);
    expect(env['基本/能力/筋力']).toBe(8);
    expect(env['筋力']).toBe(8);
  });

  it('sets no short name where two leaves share one', () => {
    const detail = DataElement.create('detail', '');
    const sectionA = DataElement.create('A', '');
    const sectionB = DataElement.create('B', '');
    const valueA = DataElement.create('値', '3');
    const valueB = DataElement.create('値', '7');
    detail.appendChild(sectionA);
    detail.appendChild(sectionB);
    sectionA.appendChild(valueA);
    sectionB.appendChild(valueB);

    const env = buildCalcEnv(valueA);
    expect(env['A/値']).toBe(3);
    expect(env['B/値']).toBe(7);
    expect(env['値']).toBeUndefined();
  });

  it('reads the number where a note beside it answers to the same name', () => {
    const detail = DataElement.create('detail', '');
    const sheet = DataElement.create('表', '');
    const memo = DataElement.create('備考', '');
    detail.appendChild(sheet);
    detail.appendChild(memo);
    sheet.appendChild(DataElement.create('HP', '15'));
    memo.appendChild(DataElement.create('hp', '要確認'));

    const env = buildCalcEnv(detail);
    expect(env['HP']).toBe(15);
  });

  it('resolves a formula together with the evaluator', () => {
    const detail = DataElement.create('detail', '');
    const hp = DataElement.create('HP', '10');
    const buff = DataElement.create('buff', '5');
    detail.appendChild(hp);
    detail.appendChild(buff);

    const env = buildCalcEnv(hp);
    expect(evalCalcFormula('HP + buff', env)).toBe(15);
  });
});

describe('a resource among the sources', () => {
  function makeResource(name: string, current: number, max: number): DataElement {
    const element = DataElement.create(name, max, { type: 'numberResource', currentValue: current });
    return element;
  }

  it('stands at what it is now rather than at the top of its bar', () => {
    const detail = DataElement.create('detail', '');
    detail.appendChild(makeResource('HP', 4, 20));

    const env = buildCalcEnv(detail);

    expect(env['HP']).toBe(4);
  });
});

describe('evaluateCalcElement', () => {
  function makeCalc(name: string, formula: string): DataElement {
    const element = DataElement.create(name, '');
    element.setAttribute(DataElementAttribute.FIELD_TYPE, DataElementFieldType.CALC);
    element.setAttribute(DataElementAttribute.FORMULA, formula);
    return element;
  }

  it('works a name out from the field holding a number, not the note sharing its name', () => {
    const detail = DataElement.create('detail', '');
    const sheet = DataElement.create('表', '');
    const memo = DataElement.create('備考', '');
    detail.appendChild(sheet);
    detail.appendChild(memo);
    sheet.appendChild(DataElement.create('HP', '15'));
    memo.appendChild(DataElement.create('hp', '要確認'));
    const calc = makeCalc('総HP', 'HP * 2');
    detail.appendChild(calc);

    expect(evaluateCalcElement(calc)).toBe('30');
  });

  it('still means neither where two fields holding numbers share a name', () => {
    const detail = DataElement.create('detail', '');
    const sectionA = DataElement.create('A', '');
    const sectionB = DataElement.create('B', '');
    detail.appendChild(sectionA);
    detail.appendChild(sectionB);
    sectionA.appendChild(DataElement.create('値', '3'));
    sectionB.appendChild(DataElement.create('値', '7'));
    const calc = makeCalc('合計', '値 + 1');
    detail.appendChild(calc);

    expect(evaluateCalcElement(calc)).toBe('?');
  });

  it('works out the formula it holds', () => {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('筋力', '8'));
    const calc = makeCalc('攻撃力', '筋力 * 2');
    detail.appendChild(calc);

    expect(evaluateCalcElement(calc)).toBe('16');
  });

  it('reads a field that works itself out in turn', () => {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('筋力', '8'));
    detail.appendChild(makeCalc('攻撃力', '筋力 * 2'));
    const total = makeCalc('総計', '攻撃力 + 1');
    detail.appendChild(total);

    expect(evaluateCalcElement(total)).toBe('17');
  });

  it('gives up rather than going round for ever on a field naming itself', () => {
    const detail = DataElement.create('detail', '');
    const a = makeCalc('あ', 'い + 1');
    const b = makeCalc('い', 'あ + 1');
    detail.appendChild(a);
    detail.appendChild(b);

    expect(evaluateCalcElement(a)).toBe('?');
  });

  it('shows nothing at all where no formula was written', () => {
    const detail = DataElement.create('detail', '');
    const calc = makeCalc('未設定', '');
    detail.appendChild(calc);

    expect(evaluateCalcElement(calc)).toBe('');
  });
});

describe('what a sheet full of calculating fields costs', () => {
  /**
   * A sheet where every field stands on the one below it, which is the shape that costs more
   * with each field added unless a field worked out once is kept for the rest.
   */
  function stack(depth: number): { detail: DataElement; fields: DataElement[] } {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('素', '2'));
    const fields: DataElement[] = [];
    for (let at = 0; at < depth; at++) {
      const field = DataElement.create(`段${at}`, '');
      field.setAttribute(DataElementAttribute.FIELD_TYPE, DataElementFieldType.CALC);
      field.setAttribute(DataElementAttribute.FORMULA, at === 0 ? '素 + 1' : `段${at - 1} + 1`);
      detail.appendChild(field);
      fields.push(field);
    }
    return { detail, fields };
  }

  /** How many times a formula was read, which is how many times one was worked out. */
  function countingFormulaReads(run: () => void): number {
    const original = DataElement.prototype.getAttribute;
    let reads = 0;
    DataElement.prototype.getAttribute = function (name: string) {
      if (name === DataElementAttribute.FORMULA) reads++;
      return original.call(this, name);
    };
    try {
      run();
    } finally {
      DataElement.prototype.getAttribute = original;
    }
    return reads;
  }

  it('works each field out once for the whole sheet rather than once per field that reads it', () => {
    const { fields } = stack(12);

    const reads = countingFormulaReads(() => {
      const pass = createCalcPass();
      for (const field of fields) evaluateCalcElement(field, pass);
    });

    // Once each. Anything that grows with the square, let alone with the power, of the
    // count is the shape this guards against.
    expect(reads).toBe(fields.length);
  });

  it('works each field out once even when only the last one is asked for', () => {
    const { fields } = stack(12);

    const reads = countingFormulaReads(() => evaluateCalcElement(fields[fields.length - 1]));

    expect(reads).toBe(fields.length);
  });

  it('gets the same answers from one shared pass as from a pass each', () => {
    const { fields } = stack(12);
    const pass = createCalcPass();

    const shared = fields.map((field) => evaluateCalcElement(field, pass));
    const apart = fields.map((field) => evaluateCalcElement(field));

    expect(shared).toEqual(apart);
    // 素 is 2, the first step adds one to it, and each of the eleven after adds one more.
    expect(shared[11]).toBe('14');
  });

  it('does not settle a field on what was unknown while some other field was being worked out', () => {
    const { fields } = stack(12);
    const pass = createCalcPass();

    // Asking for the foot of the stack first must not leave every field above it remembered as
    // unworkable, though each is reached while the one it stands on is still going.
    evaluateCalcElement(fields[0], pass);

    expect(fields.map((field) => evaluateCalcElement(field, pass))).toEqual(
      fields.map((field) => evaluateCalcElement(field))
    );
    expect(evaluateCalcElement(fields[11], pass)).toBe('14');
  });

  it('reads only the fields a formula names, not the whole sheet', () => {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('素', '2'));
    const named = (name: string, formula: string): DataElement => {
      const field = DataElement.create(name, '');
      field.setAttribute(DataElementAttribute.FIELD_TYPE, DataElementFieldType.CALC);
      field.setAttribute(DataElementAttribute.FORMULA, formula);
      detail.appendChild(field);
      return field;
    };
    const wanted = named('ほしい', '素 + 1');
    for (let at = 0; at < 30; at++) named(`他${at}`, '素 * 2');

    const reads = countingFormulaReads(() => evaluateCalcElement(wanted));

    // Its own formula and nothing else: the thirty fields beside it are never touched.
    expect(reads).toBe(1);
  });

  it('still gives up on a ring of fields, and does not poison the pass', () => {
    const detail = DataElement.create('detail', '');
    detail.appendChild(DataElement.create('素', '4'));
    const make = (name: string, formula: string): DataElement => {
      const field = DataElement.create(name, '');
      field.setAttribute(DataElementAttribute.FIELD_TYPE, DataElementFieldType.CALC);
      field.setAttribute(DataElementAttribute.FORMULA, formula);
      detail.appendChild(field);
      return field;
    };
    const a = make('あ', 'い + 1');
    const b = make('い', 'あ + 1');
    const plain = make('平', '素 * 2');

    const pass = createCalcPass();

    expect(evaluateCalcElement(a, pass)).toBe('?');
    expect(evaluateCalcElement(b, pass)).toBe('?');
    // A field outside the ring is unharmed by having been read during it.
    expect(evaluateCalcElement(plain, pass)).toBe('8');
  });
});

describe('calcSourceIdentifiers', () => {
  it('names the whole sheet the field reads, not only what its formula mentions', () => {
    const detail = DataElement.create('detail', '');
    const section = DataElement.create('基本', '');
    const str = DataElement.create('筋力', '8');
    const calc = DataElement.create('攻撃力', '');
    detail.appendChild(section);
    section.appendChild(str);
    detail.appendChild(calc);

    const identifiers = calcSourceIdentifiers(calc);

    expect(identifiers).toContain(detail.identifier);
    expect(identifiers).toContain(section.identifier);
    expect(identifiers).toContain(str.identifier);
  });
});

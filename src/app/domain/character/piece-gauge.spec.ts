import {
  fixedGaugeColor,
  gaugeColor,
  gaugeNumbersOf,
  gaugeRatio,
  HIDDEN_GAUGE_NUMBERS,
  isGaugeInverted,
  selectPieceGauges,
} from '@axe/domain/character/piece-gauge';
import { DataElement, DataElementAttribute, DataElementType } from '@axe/domain/data/data-element';

describe('gaugeRatio()', () => {
  it('returns the share of the maximum, between none and all', () => {
    expect(gaugeRatio(50, 200)).toBe(0.25);
    expect(gaugeRatio(200, 200)).toBe(1);
  });

  it('does not fall over outside that range or at no maximum', () => {
    expect(gaugeRatio(-10, 200)).toBe(0);
    expect(gaugeRatio(300, 200)).toBe(1);
    expect(gaugeRatio(10, 0)).toBe(0);
    expect(gaugeRatio(Number.NaN, 200)).toBe(0);
  });
});

describe('gaugeColor()', () => {
  it('runs from green through yellow to red as it empties', () => {
    expect(gaugeColor(1)).toBe(gaugeColor(0.51));
    expect(gaugeColor(0.5)).toBe(gaugeColor(0.26));
    expect(gaugeColor(0.25)).toBe(gaugeColor(0));
    expect(new Set([gaugeColor(1), gaugeColor(0.5), gaugeColor(0.1)]).size).toBe(3);
  });

  it('runs the other way on a resource that grows worse as it fills', () => {
    expect(gaugeColor(1, true)).toBe(gaugeColor(0));
    expect(gaugeColor(0, true)).toBe(gaugeColor(1));
    expect(gaugeColor(0.6, true)).toBe(gaugeColor(0.4));
  });
});

describe('selectPieceGauges()', () => {
  const created: DataElement[] = [];

  function resource(name: string, current: number, max: number, onPiece: boolean, inverted = false): DataElement {
    const element = DataElement.create(name, max, { type: DataElementType.NUMBER_RESOURCE, currentValue: current });
    if (onPiece) element.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
    if (inverted) element.setAttribute(DataElementAttribute.GAUGE_INVERTED, 'true');
    created.push(element);
    return element;
  }

  afterEach(() => {
    for (const element of created.splice(0)) element.destroy();
  });

  it('picks up only the resources set to show on the piece', () => {
    const root = DataElement.create('detail', '', {});
    created.push(root);
    const section = DataElement.create('リソース', '', {});
    created.push(section);
    root.appendChild(section);
    section.appendChild(resource('HP', 50, 200, true));
    section.appendChild(resource('MP', 30, 40, true));
    section.appendChild(resource('所持金', 1500, 9999, false));

    const gauges = selectPieceGauges(root);

    expect(gauges.map((gauge) => gauge.name)).toEqual(['HP', 'MP']);
    expect(gauges[0]).toMatchObject({ initial: 'H', current: 50, max: 200, ratio: 0.25 });
    expect(gauges[1].color).toBe(gaugeColor(0.75));
  });

  it('carries the colours reversed on such a resource', () => {
    const root = DataElement.create('detail', '', {});
    created.push(root);
    const madness = resource('狂気度', 150, 200, true, true);
    root.appendChild(madness);

    const [gauge] = selectPieceGauges(root);

    expect(isGaugeInverted(madness)).toBe(true);
    expect(gauge).toMatchObject({ ratio: 0.75, inverted: true });
    expect(gauge.color).toBe(gaugeColor(0.25));
  });

  it('draws a bar in the colour set for it however full it stands, its rise still read as worse where it is inverted', () => {
    const root = DataElement.create('detail', '', {});
    created.push(root);
    const hp = resource('HP', 10, 200, true);
    hp.setAttribute(DataElementAttribute.GAUGE_COLOR, '#E53935');
    root.appendChild(hp);
    const madness = resource('狂気度', 150, 200, true, true);
    madness.setAttribute(DataElementAttribute.GAUGE_COLOR, '#3949ab');
    root.appendChild(madness);

    const [hpGauge, madnessGauge] = selectPieceGauges(root);

    expect(hpGauge.color).toBe('#e53935');
    expect(madnessGauge).toMatchObject({ color: '#3949ab', inverted: true });
  });

  it('follows how full the bar stands where no colour is set, an empty one or one that is not a colour', () => {
    const root = DataElement.create('detail', '', {});
    created.push(root);
    const empty = resource('HP', 150, 200, true);
    empty.setAttribute(DataElementAttribute.GAUGE_COLOR, '');
    const wrong = resource('MP', 150, 200, true);
    wrong.setAttribute(DataElementAttribute.GAUGE_COLOR, 'red');
    root.appendChild(resource('SAN', 150, 200, true));
    root.appendChild(empty);
    root.appendChild(wrong);

    expect(selectPieceGauges(root).map((gauge) => gauge.color)).toEqual([
      gaugeColor(0.75),
      gaugeColor(0.75),
      gaugeColor(0.75),
    ]);
    expect(fixedGaugeColor('')).toBe('');
  });

  it('picks up nothing that is not a resource', () => {
    const root = DataElement.create('detail', '', {});
    created.push(root);
    const note = DataElement.create('メモ', 'テキスト', {});
    note.setAttribute(DataElementAttribute.PIECE_GAUGE, 'true');
    created.push(note);
    root.appendChild(note);

    expect(selectPieceGauges(root)).toEqual([]);
  });

  it('returns nothing when it is unset', () => {
    expect(selectPieceGauges(null)).toEqual([]);
  });
});

describe('gaugeNumbersOf()', () => {
  const gauge = { current: 7, max: 12 } as Parameters<typeof gaugeNumbersOf>[0];

  it('reads out the numbers for whoever may read the piece', () => {
    expect(gaugeNumbersOf(gauge, true)).toBe('7/12');
  });

  it('keeps them back from whoever may not', () => {
    expect(gaugeNumbersOf(gauge, false)).toBe(HIDDEN_GAUGE_NUMBERS);
  });
});

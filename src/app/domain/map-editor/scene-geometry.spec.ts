import { ShapeItem, TextItem } from '@axe/domain/map-editor/scene';
import {
  pointToPolylineDistance,
  pointToSegmentDistance,
  shapeBox,
  strokeSlack,
  textBox,
  useTextMeasurer,
} from '@axe/domain/map-editor/scene-geometry';

function words(text: string, extra: Partial<TextItem> = {}): TextItem {
  return {
    id: 't',
    x: 100,
    y: 50,
    text,
    fontSize: 20,
    color: '#000',
    bold: false,
    italic: false,
    align: 'left',
    ...extra,
  } as TextItem;
}

describe('scene geometry', () => {
  it('grabs a stroke within six pixels, or a little past half its width', () => {
    expect(strokeSlack(1)).toBe(6);
    expect(strokeSlack(8)).toBe(6);
    expect(strokeSlack(20)).toBe(12);
  });

  it('measures the distance to a segment and to the nearest piece of a polyline', () => {
    expect(pointToSegmentDistance(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(pointToSegmentDistance(15, 0, 0, 0, 10, 0)).toBe(5);
    expect(pointToSegmentDistance(3, 4, 0, 0, 0, 0)).toBe(5);
    expect(pointToPolylineDistance(50, 1, [0, 0, 100, 0, 100, 100])).toBe(1);
    expect(pointToPolylineDistance(101, 50, [0, 0, 100, 0, 100, 100])).toBe(1);
    expect(pointToPolylineDistance(0, 0, [])).toBe(Infinity);
    expect(pointToPolylineDistance(3, 4, [0, 0])).toBe(5);
  });

  it('boxes a rectangle the same way round whichever way it was dragged', () => {
    const backwards = { id: 's', shape: 'rect', points: [100, 80, -60, -30] } as ShapeItem;
    expect(shapeBox(backwards)).toEqual({ x: 40, y: 50, w: 60, h: 30 });
    const polyline = { id: 's', shape: 'polyline', points: [10, 10, 40, 0, 20, 30] } as ShapeItem;
    expect(shapeBox(polyline)).toEqual({ x: 10, y: 0, w: 30, h: 30 });
  });

  it('gives Japanese words a full square each when nothing measures them', () => {
    expect(textBox(words('abcde'))).toEqual({ x: 100, y: 50, w: 60, h: 24 });
    expect(textBox(words('あいうえお'))).toEqual({ x: 100, y: 50, w: 100, h: 24 });
    expect(textBox(words('abcde', { align: 'right' })).x).toBe(40);
    expect(textBox(words('abcde', { align: 'center' })).x).toBe(70);
  });

  it('reaches past a background and an outline, and never narrower than one letter', () => {
    const boxed = textBox(
      words('ab', { background: '#fff', outline: { color: '#000', width: 2 } } as Partial<TextItem>)
    );
    expect(boxed).toEqual({ x: 88, y: 38, w: 48, h: 48 });
    expect(textBox(words('')).w).toBe(20);
  });

  it('lets a measurer be lent and given back', () => {
    const stop = useTextMeasurer(() => 300);
    expect(textBox(words('ab')).w).toBe(300);
    stop();
    expect(textBox(words('ab')).w).toBe(24);
  });
});

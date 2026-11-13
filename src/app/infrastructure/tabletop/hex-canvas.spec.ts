import { HexPathSink, traceHexPath } from '@axe/domain/tabletop/hex-geometry';
import { fillHexPath, strokeHexPath } from '@axe/infrastructure/tabletop/hex-canvas';

type Call = [string, ...number[]];

function recordingContext(log: Call[]): CanvasRenderingContext2D {
  const sink: HexPathSink & { beginPath(): void; stroke(): void; fill(): void } = {
    beginPath: () => log.push(['beginPath']),
    moveTo: (x, y) => log.push(['moveTo', x, y]),
    lineTo: (x, y) => log.push(['lineTo', x, y]),
    closePath: () => log.push(['closePath']),
    stroke: () => log.push(['stroke']),
    fill: () => log.push(['fill']),
  };
  return sink as unknown as CanvasRenderingContext2D;
}

describe('hex-canvas', () => {
  const angles = [0, Math.PI / 6, Math.PI / 2];
  const radii = [10, 28.8675];
  const centres: [number, number][] = [
    [0, 0],
    [125, 75.5],
  ];

  it('strokes a closed six-sided path', () => {
    const log: Call[] = [];
    strokeHexPath(recordingContext(log), 0, 0, 10, 0);
    expect(log[0]).toEqual(['beginPath']);
    expect(log.filter(([call]) => call === 'moveTo')).toHaveLength(1);
    expect(log.filter(([call]) => call === 'lineTo')).toHaveLength(5);
    expect(log.filter(([call]) => call === 'closePath')).toHaveLength(1);
    expect(log[log.length - 1]).toEqual(['stroke']);
  });

  it('fills one', () => {
    const log: Call[] = [];
    fillHexPath(recordingContext(log), 0, 0, 10, 0);
    expect(log[0]).toEqual(['beginPath']);
    expect(log.filter(([call]) => call === 'lineTo')).toHaveLength(5);
    expect(log[log.length - 1]).toEqual(['fill']);
  });

  it('strokes and fills the very path traceHexPath traces', () => {
    for (const angle of angles) {
      for (const s of radii) {
        for (const [cx, cy] of centres) {
          const traced: Call[] = [];
          traceHexPath(recordingContext(traced), cx, cy, s, angle);

          const stroked: Call[] = [];
          strokeHexPath(recordingContext(stroked), cx, cy, s, angle);
          expect(stroked).toEqual([['beginPath'], ...traced, ['stroke']]);

          const filled: Call[] = [];
          fillHexPath(recordingContext(filled), cx, cy, s, angle);
          expect(filled).toEqual([['beginPath'], ...traced, ['fill']]);
        }
      }
    }
  });
});

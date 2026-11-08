import { GameTable } from '@axe/domain/tabletop/game-table';
import { GROUND_CHUNK_SAMPLE_COUNT, GroundChunkData } from '@axe/domain/tabletop/ground/ground-chunk-data';
import {
  ensureGroundFieldOn,
  GroundChunk,
  GroundField,
  groundFieldIdentifierOf,
  groundFieldOn,
} from '@axe/domain/tabletop/ground/ground-field';

function makeTable(): GameTable {
  const table = new GameTable();
  table.initialize();
  return table;
}

function raised(cx: number, cy: number, steps: number): GroundChunkData {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  heights[0] = steps;
  return { cx, cy, heights, paint: null };
}

describe('the ground a table keeps', () => {
  it('is none until it is made, and is named after the table', () => {
    const table = makeTable();

    expect(groundFieldOn(table)).toBeNull();
    expect(ensureGroundFieldOn(table).identifier).toBe(groundFieldIdentifierOf(table));
    table.destroy();
  });

  it('hands the same ground back rather than hanging a second on the table', () => {
    const table = makeTable();
    const field = ensureGroundFieldOn(table);

    expect(ensureGroundFieldOn(table)).toBe(field);
    expect(table.children.filter((child) => child instanceof GroundField)).toHaveLength(1);
    table.destroy();
  });

  it('reads back a chunk it kept, and keeps a chunk written again in the same place', () => {
    const table = makeTable();
    const field = ensureGroundFieldOn(table);

    field.writeChunk(raised(1, 2, 64));
    field.writeChunk(raised(1, 2, -32));

    const [chunk] = field.readChunks();
    expect(field.readChunks()).toHaveLength(1);
    expect(chunk).toMatchObject({ cx: 1, cy: 2, paint: null });
    expect(chunk.heights[0]).toBe(-32);
    table.destroy();
  });
});

describe('a chunk of the ground that reaches here with nothing in it', () => {
  it('names no chunk and holds no data, rather than a flat chunk at the corner', () => {
    expect(new GroundChunk().read()).toBeNull();
  });

  it('is passed over where its place is not given, though its heights are', () => {
    const chunk = new GroundChunk();
    chunk.write(new Int16Array(GROUND_CHUNK_SAMPLE_COUNT), null);

    expect(chunk.read()).toBeNull();
    chunk.cx = '0';
    chunk.cy = '0';
    expect(chunk.read()).not.toBeNull();
  });

  it('holds no data where its heights are cut short', () => {
    const chunk = new GroundChunk();
    chunk.cx = '0';
    chunk.cy = '0';
    chunk.heights = 'AAAA';

    expect(chunk.read()).toBeNull();
  });
});

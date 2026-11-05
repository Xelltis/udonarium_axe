import { TestBed } from '@angular/core/testing';
import { SurfaceDims } from '@axe/domain/tabletop/surface-space';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { beamWallFaceGrid } from '@axe/features/tabletop/game-table/beam-top-grid';

const dims: SurfaceDims = { widthPx: 500, depthPx: 500, wallHeightPx: 500 };
const GRID = 50;

describe('beamWallFaceGrid', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  function parseMatrix(face: { matrix3d: string }): number[] {
    return face.matrix3d.replace('matrix3d(', '').replace(')', '').split(',').map(Number);
  }

  it('faces the outer side of a north-wall beam onto the wall plane and marks it north', () => {
    const beam = Terrain.create('beam', 2, 1, 4, '', '');
    beam.location.x = 100;
    beam.location.y = 0;
    beam.location.surface = 'north-wall';
    beam.isGrid = true;

    const face = beamWallFaceGrid(beam, dims, GRID)!;
    expect({ width: face.width, height: face.height, offsetLeft: face.offsetLeft, offsetTop: face.offsetTop }).toEqual({
      width: 100,
      height: 50,
      offsetLeft: 100,
      offsetTop: 0,
    });
    expect(face.prefix).toBe('N');
    const m = parseMatrix(face);
    // u=(1,0,0) v=(0,0,-1) normal=(0,1,0)
    expect(m.slice(0, 3)).toEqual([1, 0, 0]);
    expect(m.slice(4, 7)).toEqual([0, 0, -1]);
    expect(m.slice(8, 11)).toEqual([0, 1, 0]);
    // P0 = origin(0,0,500) + u*100 + normal*(height*50 + small lift) → (100, ~200+, 500)
    expect(m[12]).toBeCloseTo(100);
    expect(m[13]).toBeGreaterThan(200);
    expect(m[13]).toBeLessThan(220);
    expect(m[14]).toBeCloseTo(500);
  });

  it('carries the altitude and height into the protrusion, offset along the normal as the top is', () => {
    const beam = Terrain.create('beam', 2, 1, 4, '', '');
    beam.location.x = 100;
    beam.location.y = 0;
    beam.location.surface = 'north-wall';
    beam.altitude = 2;
    beam.posZ = 25;
    beam.isGrid = true;

    const m = parseMatrix(beamWallFaceGrid(beam, dims, GRID)!);
    // normal(+y) * ((altitude+height)*50 + posZ + lift) = (2+4)*50 + 25 = 325(+lift)
    expect(m[13]).toBeGreaterThan(325);
    expect(m[13]).toBeLessThan(345);
  });

  it('juts an east-wall beam inwards from the wall and marks it east', () => {
    const beam = Terrain.create('beam', 2, 1, 3, '', '');
    beam.location.x = 0;
    beam.location.y = 0;
    beam.location.surface = 'east-wall';
    beam.isGrid = true;

    const face = beamWallFaceGrid(beam, dims, GRID)!;
    expect(face.prefix).toBe('E');
    const m = parseMatrix(face);
    // east: u(0,1,0) v(0,0,-1) normal(-1,0,0); protrusion 150(+lift) → P0=(349.7,0,500)
    expect(m.slice(0, 3)).toEqual([0, 1, 0]);
    expect(m.slice(8, 11)).toEqual([-1, 0, 0]);
    // normal(-x): P0.x = width(500) - ((height*50)+lift) → just under 350
    expect(m[12]).toBeGreaterThan(330);
    expect(m[12]).toBeLessThan(350);
    expect(m[13]).toBeCloseTo(0);
    expect(m[14]).toBeCloseTo(500);
  });

  it('leaves floor terrain and gridless walls out of it', () => {
    const floor = Terrain.create('floor', 2, 2, 1, '', '');
    floor.isGrid = true;
    expect(beamWallFaceGrid(floor, dims, GRID)).toBeNull();

    const beam = Terrain.create('beam', 2, 1, 4, '', '');
    beam.location.surface = 'north-wall';
    beam.isGrid = false;
    expect(beamWallFaceGrid(beam, dims, GRID)).toBeNull();
  });
});

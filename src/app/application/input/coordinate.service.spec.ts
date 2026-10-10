import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { Transform } from '@axe/core/transform/transform';
import { PERF_TRANSFORM_INIT, perfCounters } from '@axe/core/util/perf-counters';

describe('CoordinateService', () => {
  let service: CoordinateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CoordinateService);
    perfCounters.enabled = true;
    perfCounters.drain();
  });

  afterEach(() => {
    perfCounters.enabled = false;
    perfCounters.drain();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('counts each time the view is written out', () => {
    const before = service.tabletopTransformVersion();

    service.invalidateTabletopTransform();
    service.invalidateTabletopTransform();

    expect(service.tabletopTransformVersion()).toBe(before + 2);
  });

  describe('the transform pool', () => {
    it('reuses its transforms across repeated conversions', () => {
      const internal = service as unknown as { _transformA: Transform; _transformB: Transform };
      const a1 = internal._transformA;
      const b1 = internal._transformB;

      const el = document.createElement('div');
      document.body.appendChild(el);
      service.convertToLocal({ x: 10, y: 10, z: 0 }, el);
      service.convertToLocal({ x: 20, y: 20, z: 0 }, el);
      service.convertToGlobal({ x: 30, y: 30, z: 0 }, el);
      service.convertLocalToLocal({ x: 40, y: 40, z: 0 }, el, document.body);
      document.body.removeChild(el);

      // the pooled reference surviving the call proves nothing was allocated
      expect(internal._transformA).toBe(a1);
      expect(internal._transformB).toBe(b1);
    });

    it('gives the same answer as a fresh transform would', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const pooled = service.convertToLocal({ x: 50, y: 60, z: 0 }, el);

      const transformer = new Transform(el);
      const expected = transformer.globalToLocal(50, 60, 0);
      transformer.clear();

      expect(pooled.x).toBeCloseTo(expected.x);
      expect(pooled.y).toBeCloseTo(expected.y);
      expect(pooled.z).toBeCloseTo(expected.z);

      document.body.removeChild(el);
    });

    it('walks the table ancestors once for a run of conversions in the same frame', () => {
      const table = document.createElement('div');
      document.body.appendChild(table);
      service.tabletopOriginElement = table;
      perfCounters.drain();

      service.convertToLocal({ x: 10, y: 10, z: 0 }, table);
      service.convertToLocal({ x: 20, y: 20, z: 0 }, table);
      service.convertToGlobal({ x: 30, y: 30, z: 0 }, table);

      expect(perfCounters.drain().get(PERF_TRANSFORM_INIT)).toBe(1);

      service.invalidateTabletopTransform();
      service.convertToLocal({ x: 40, y: 40, z: 0 }, table);

      expect(perfCounters.drain().get(PERF_TRANSFORM_INIT)).toBe(1);
      document.body.removeChild(table);
    });

    it('walks it again for the next frame', async () => {
      const table = document.createElement('div');
      document.body.appendChild(table);
      service.tabletopOriginElement = table;

      service.convertToLocal({ x: 10, y: 10, z: 0 }, table);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      perfCounters.drain();

      service.convertToLocal({ x: 20, y: 20, z: 0 }, table);

      expect(perfCounters.drain().get(PERF_TRANSFORM_INIT)).toBe(1);
      document.body.removeChild(table);
    });

    it('keeps nothing for an element that is not the table', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      perfCounters.drain();

      service.convertToLocal({ x: 10, y: 10, z: 0 }, el);
      service.convertToLocal({ x: 20, y: 20, z: 0 }, el);

      expect(perfCounters.drain().get(PERF_TRANSFORM_INIT)).toBe(2);
      document.body.removeChild(el);
    });

    it('gives the same answer kept as freshly walked', () => {
      const table = document.createElement('div');
      document.body.appendChild(table);
      service.tabletopOriginElement = table;

      const first = service.convertToLocal({ x: 50, y: 60, z: 0 }, table);
      const kept = service.convertToLocal({ x: 50, y: 60, z: 0 }, table);

      expect(kept).toEqual(first);
      document.body.removeChild(table);
    });

    it('uses one pooled transform for each end and no more', () => {
      const a = document.createElement('div');
      const b = document.createElement('div');
      document.body.appendChild(a);
      document.body.appendChild(b);

      const result = service.convertLocalToLocal({ x: 10, y: 10, z: 0 }, a, b);
      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
      expect(typeof result.z).toBe('number');

      document.body.removeChild(a);
      document.body.removeChild(b);
    });
  });
});

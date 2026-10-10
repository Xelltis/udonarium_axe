import { ComponentFixture, TestBed } from '@angular/core/testing';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInTimelineComponent, type TimelineRow } from '@axe/features/media/cut-in-editor/cut-in-timeline.component';
import { TIMELINE_ROW_H_PX, TIMELINE_RULER_H_PX } from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInTimelineComponent', () => {
  let fixture: ComponentFixture<CutInTimelineComponent>;
  let component: CutInTimelineComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInTimelineComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CutInTimelineComponent);
    component = fixture.componentInstance;
  });

  function makeLayer(name: string, fields: Partial<CutInLayer> = {}): CutInLayer {
    const layer = new CutInLayer();
    layer.initialize();
    layer.name = name;
    Object.assign(layer, fields);
    return layer;
  }

  /** The room the bands have is measured by whatever holds them, so a test says how much. */
  const ROOM_PX = 400;

  function show(layers: CutInLayer[], durationMs = 2000, zoom = 1): void {
    fixture.componentRef.setInput('layers', layers);
    fixture.componentRef.setInput('durationMs', durationMs);
    fixture.componentRef.setInput('isEditable', true);
    fixture.componentRef.setInput('viewportPx', ROOM_PX);
    fixture.componentRef.setInput('zoom', zoom);
    fixture.detectChanges();
  }

  /** The track is measured from the DOM, which stands at nought here, so x is the pointer. */
  function pointer(x: number): PointerEvent {
    return { clientX: x, shiftKey: false, pointerId: 1, target: null } as unknown as PointerEvent;
  }

  type PointerApi = {
    onRowDown(event: PointerEvent, row: TimelineRow): void;
    onPointerMove(event: PointerEvent): void;
  };

  it('says so when there is nothing to lay out', () => {
    show([]);

    expect(component.rows()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('レイヤーがありません');
  });

  it('reads the stack from the top down, as the layer list does', () => {
    show([makeLayer('下'), makeLayer('上')]);

    expect(component.rows().map((row) => row.layer.name)).toEqual(['上', '下']);
  });

  it('runs a bar across the whole scene for a layer with no end', () => {
    show([makeLayer('背景')]);

    const row = component.rows()[0];
    expect(row.left).toBe(0);
    expect(row.width).toBeCloseTo(component.pxPerSec() * 2, 5);
  });

  it('starts and ends the bar where the layer does', () => {
    show([makeLayer('文字', { startMs: 500, endMs: 1500 })]);

    const row = component.rows()[0];
    expect(row.left).toBeCloseTo(component.pxPerSec() * 0.5, 5);
    expect(row.width).toBeCloseTo(component.pxPerSec(), 5);
  });

  it('marks every moment a key stands at', () => {
    const layer = makeLayer('立ち絵', {
      tracks: encodeCutInTracks({
        x: [
          { t: 0, v: 0 },
          { t: 800, v: 100 },
        ],
        opacity: [{ t: 800, v: 1 }],
      }),
    });

    show([layer]);

    expect(component.rows()[0].keys.map((key) => key.ms)).toEqual([0, 800]);
  });

  it('stands its bands at the height the heads beside it are cut to', () => {
    show([makeLayer('背景')], 2500);

    const heights = ([...fixture.nativeElement.querySelectorAll('div')] as HTMLElement[]).map(
      (band) => band.style.height
    );
    expect(heights).toContain(`${TIMELINE_ROW_H_PX}px`);
    expect(heights).toContain(`${TIMELINE_RULER_H_PX}px`);
  });

  it('lays a ruler with something to read along it', () => {
    show([makeLayer('背景')]);

    expect(component.ticks().length).toBeGreaterThan(2);
    expect(component.ticks()[0].ms).toBe(0);
  });

  describe('a key or a sound pressed and let go where it stands', () => {
    type PressApi = PointerApi & {
      onSoundRowDown(event: PointerEvent): void;
      onPointerUp(event: PointerEvent): void;
    };

    it('cues the playhead onto the key, where the buttons that take a key away act', () => {
      const layer = makeLayer('立ち絵', { tracks: encodeCutInTracks({ x: [{ t: 800, v: 100 }] }) });
      show([layer]);
      const cues: number[] = [];
      const seeks: number[] = [];
      const moved: unknown[] = [];
      component.cue.subscribe((ms) => cues.push(ms));
      component.seek.subscribe((ms) => seeks.push(ms));
      component.moveKey.subscribe((key) => moved.push(key));

      const row = component.rows()[0];
      const api = component as unknown as PressApi;
      api.onRowDown(pointer(row.keys[0].x), row);
      api.onPointerUp(pointer(row.keys[0].x));

      expect(cues).toEqual([800]);
      expect(seeks).toEqual([]);
      expect(moved).toEqual([]);
    });

    it('cues the playhead onto the sound in the same way', () => {
      show([makeLayer('背景')]);
      fixture.componentRef.setInput('sounds', [{ t: 600, a: 'se', v: 1 }]);
      fixture.detectChanges();
      const cues: number[] = [];
      const seeks: number[] = [];
      component.cue.subscribe((ms) => cues.push(ms));
      component.seek.subscribe((ms) => seeks.push(ms));

      const x = component.soundMarks()[0].x;
      const api = component as unknown as PressApi;
      api.onSoundRowDown(pointer(x));
      api.onPointerUp(pointer(x));

      expect(cues).toEqual([600]);
      expect(seeks).toEqual([]);
    });

    it('seeks rather than cues where the press lands on no key, as scrubbing does', () => {
      const layer = makeLayer('立ち絵', { tracks: encodeCutInTracks({ x: [{ t: 800, v: 100 }] }) });
      show([layer]);
      const cues: number[] = [];
      const seeks: number[] = [];
      component.cue.subscribe((ms) => cues.push(ms));
      component.seek.subscribe((ms) => seeks.push(ms));

      const row = component.rows()[0];
      const x = row.keys[0].x + 60;
      const api = component as unknown as PressApi;
      api.onRowDown(pointer(x), row);
      api.onPointerUp(pointer(x));

      expect(seeks).toHaveLength(1);
      expect(cues).toEqual([]);
    });
  });

  describe('dragging a band by one of its ends', () => {
    it('follows the pointer rather than being held to where the end already is', () => {
      const layer = makeLayer('文字', { startMs: 500, endMs: 1500 });
      show([layer]);
      const trimmed: { startMs: number; endMs: number }[] = [];
      component.trimLayer.subscribe((moved) => trimmed.push(moved));

      const row = component.rows()[0];
      const api = component as unknown as PointerApi;
      api.onRowDown(pointer(row.left), row);
      api.onPointerMove(pointer(row.left + 4));

      // Four pixels is inside the magnet's reach, so the band's own end must not pull it back.
      expect(trimmed).toHaveLength(1);
      expect(trimmed[0].startMs).toBeGreaterThan(500);
    });

    it('still lands on where another layer starts', () => {
      const dragged = makeLayer('文字', { startMs: 500, endMs: 1500 });
      const beside = makeLayer('背景', { startMs: 520, endMs: 1800 });
      show([dragged, beside]);
      const trimmed: { startMs: number; endMs: number }[] = [];
      component.trimLayer.subscribe((moved) => trimmed.push(moved));

      const row = component.rows().find((each) => each.layer === dragged)!;
      const api = component as unknown as PointerApi;
      api.onRowDown(pointer(row.left), row);
      api.onPointerMove(pointer(row.left + 3));

      expect(trimmed[0].startMs).toBe(520);
    });
  });

  describe('drawing the bands out', () => {
    it('fits them to the room they have at rest', () => {
      show([makeLayer('背景')]);

      expect(component.trackWidth()).toBe(ROOM_PX);
    });

    it('draws them out past that room, which is what makes a moment reachable', () => {
      const fitted = (() => {
        show([makeLayer('背景')]);
        return component.pxPerSec();
      })();

      show([makeLayer('背景')], 2000, 4);

      expect(component.trackWidth()).toBe(ROOM_PX * 4);
      expect(component.pxPerSec()).toBeCloseTo(fitted * 4, 5);
    });

    it('never draws them in narrower than the room, however far back it is asked', () => {
      show([makeLayer('背景')], 2000, 0.1);

      expect(component.trackWidth()).toBe(ROOM_PX);
    });
  });
});

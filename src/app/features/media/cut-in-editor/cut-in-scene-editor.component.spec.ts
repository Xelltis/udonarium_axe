import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CutIn } from '@axe/domain/media/cut-in';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { keysOf, valueAt } from '@axe/features/media/cut-in-editor/cut-in-keyframe-edit';
import { CutInSceneEditorComponent } from '@axe/features/media/cut-in-editor/cut-in-scene-editor.component';
import { CutInTimelineComponent, type TimelineRow } from '@axe/features/media/cut-in-editor/cut-in-timeline.component';
import { TIMELINE_HEAD_W_PX } from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { CutInStageComponent } from '@axe/features/media/cut-in-stage/cut-in-stage.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInSceneEditorComponent', () => {
  let fixture: ComponentFixture<CutInSceneEditorComponent>;
  let component: CutInSceneEditorComponent;
  let cutIn: CutIn;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInSceneEditorComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    cutIn = new CutIn();
    cutIn.initialize();
    cutIn.width = 640;
    cutIn.height = 360;

    fixture = TestBed.createComponent(CutInSceneEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('cutIn', cutIn);
    fixture.componentRef.setInput('isEditable', true);
    fixture.detectChanges();
  });

  type EditorApi = {
    addImageLayer(): void;
    addTextLayer(): void;
    addFillLayer(): void;
    duplicateSelected(): void;
    removeSelected(): void;
    onToggleHidden(layer: CutInLayer): void;
    onReorder(dropped: { held: CutInLayer; over: CutInLayer; side: 'before' | 'after' | null }): void;
    onPointerDown(event: PointerEvent): void;
    onPointerMove(event: PointerEvent): void;
    onPointerUp(event: PointerEvent): void;
    onKeyDown(event: KeyboardEvent): void;
    onMoveSound(moved: { fromMs: number; toMs: number }): void;
    onRemoveSound(removed: { ms: number }): void;
    undo(): void;
    redo(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    changed(): void;
    selectedIdentifier: { set(value: string): void };
    onSelect(layer: CutInLayer): void;
    onSeek(ms: number): void;
    playheadMs(): number;
    stepBy(deltaMs: number): void;
    jumpToKey(forward: boolean): void;
    timelineZoom(): number;
    zoomPercent(): number;
    canZoomIn(): boolean;
    canZoomOut(): boolean;
    zoomIn(): void;
    zoomOut(): void;
    zoomToFit(): void;
    onTrimLayer(trimmed: { layer: CutInLayer; startMs: number; endMs: number }): void;
    stageZoom(): number;
    stagePercent(): number;
    canStageZoomIn(): boolean;
    canStageZoomOut(): boolean;
    stageZoomIn(): void;
    stageZoomOut(): void;
    stageZoomToFit(): void;
    copyPose(): void;
    pastePose(): void;
    hasHeldPose: boolean;
    onSeekSeconds(event: Event): void;
    playheadSeconds(): number;
    nudgeSelected(dx: number, dy: number): void;
  };

  function editor(): EditorApi {
    return component as unknown as EditorApi;
  }

  function pointer(type: string, x: number, y: number, buttons = 1): PointerEvent {
    return {
      type,
      clientX: x,
      clientY: y,
      buttons,
      shiftKey: false,
      pointerId: 1,
      target: null,
    } as unknown as PointerEvent;
  }

  function drag(from: [number, number], to: [number, number]): void {
    editor().onPointerDown(pointer('pointerdown', from[0], from[1]));
    editor().onPointerMove(pointer('pointermove', to[0], to[1]));
    // A real release carries no button, which is also what an abandoned drag looks like.
    editor().onPointerUp(pointer('pointerup', to[0], to[1], 0));
  }

  it('starts with no scene at all', () => {
    expect(component.scene()).toBeNull();
    expect(component.layers()).toEqual([]);
  });

  it('makes a scene the first time a layer is added', () => {
    editor().addImageLayer();

    expect(component.scene()).not.toBeNull();
    expect(component.layers()).toHaveLength(1);
    expect(cutIn.isComposed).toBe(true);
  });

  it('stops the cut-in following the size of one picture', () => {
    cutIn.originalSize = true;

    editor().addImageLayer();

    expect(cutIn.originalSize).toBe(false);
  });

  it('lays each new layer in the middle of the cut-in', () => {
    editor().addImageLayer();

    const layer = component.layers()[0];
    expect(layer.x + layer.width / 2).toBe(320);
    expect(layer.y + layer.height / 2).toBe(180);
  });

  it('lays down words and bands as well as pictures', () => {
    editor().addTextLayer();
    editor().addFillLayer();

    expect(component.layers().map((layer) => layer.kind)).toEqual(['text', 'fill']);
  });

  it('gives a new text layer something to say', () => {
    editor().addTextLayer();

    expect(component.layers()[0].text.length).toBeGreaterThan(0);
  });

  it('runs a band across the whole width', () => {
    editor().addFillLayer();

    expect(component.layers()[0].width).toBe(640);
  });

  it('selects what it just added', () => {
    editor().addImageLayer();

    expect(component.selected()).toBe(component.layers()[0]);
  });

  it('duplicates the selected layer and selects the copy', () => {
    editor().addImageLayer();
    const first = component.selected()!;

    editor().duplicateSelected();

    expect(component.layers()).toHaveLength(2);
    expect(component.selected()).not.toBe(first);
  });

  it('deletes the selected layer and selects nothing', () => {
    editor().addImageLayer();

    editor().removeSelected();

    expect(component.layers()).toEqual([]);
    expect(component.selected()).toBeNull();
  });

  it('turns a layer off and on again', () => {
    editor().addImageLayer();
    const layer = component.layers()[0];

    editor().onToggleHidden(layer);
    expect(layer.hidden).toBe(true);

    editor().onToggleHidden(layer);
    expect(layer.hidden).toBe(false);
  });

  it('moves a layer up the stack', () => {
    editor().addImageLayer();
    editor().addImageLayer();
    const [first, second] = component.layers();

    editor().onReorder({ held: first, over: second, side: 'after' });

    expect(component.layers()).toEqual([second, first]);
  });

  describe('dragging on the stage', () => {
    it('picks up the layer under the pointer', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      editor().selectedIdentifier.set('');

      editor().onPointerDown(pointer('pointerdown', layer.x + 10, layer.y + 10));

      expect(component.selected()).toBe(layer);
    });

    it('lets go of the selection on empty stage', () => {
      editor().addImageLayer();

      editor().onPointerDown(pointer('pointerdown', 5, 5));

      expect(component.selected()).toBeNull();
    });

    it('moves the layer by as far as the pointer went', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const from = { x: layer.x, y: layer.y };

      drag([layer.x + 10, layer.y + 10], [layer.x + 40, layer.y + 30]);

      expect(layer.x).toBe(from.x + 30);
      expect(layer.y).toBe(from.y + 20);
    });

    it('resizes from a corner, leaving the far one where it was', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const right = layer.x + layer.width;

      drag([layer.x, layer.y], [layer.x + 20, layer.y + 10]);

      expect(layer.x).toBe(right - layer.width);
      expect(layer.width).toBeLessThan(320);
    });

    it('turns the layer by the grip above it', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const box = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };

      // From straight above the middle round to the right of it: a quarter turn.
      drag([box.x + box.width / 2, box.y - 22], [box.x + box.width + 200, box.y + box.height / 2]);

      expect(layer.rotation).toBeGreaterThan(60);
      expect(layer.rotation).toBeLessThan(120);
      expect(layer.x).toBe(box.x);
    });

    it('can be turned again after being let go of', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const box = { x: layer.x, y: layer.y, width: layer.width, height: layer.height };
      const pivot = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // A quarter turn, released, and then the grip taken hold of where it now is.
      drag([pivot.x, box.y - 22], [pivot.x + 200, pivot.y]);
      const afterFirst = layer.rotation;
      expect(afterFirst).toBeGreaterThan(60);

      // A quarter turn swings the grip from above the box round to the right of the pivot.
      drag([pivot.x + box.height / 2 + 22, pivot.y], [pivot.x, pivot.y + 200]);

      expect(layer.rotation).toBeGreaterThan(afterFirst + 30);
    });

    it('picks a turned layer up by the body it is drawn with', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      layer.rotation = 90;
      layer.width = 200;
      layer.height = 100;
      layer.x = 100;
      layer.y = 100;
      editor().selectedIdentifier.set('');

      // Turned a quarter, the box covers where its top-left corner is drawn.
      editor().onPointerDown(pointer('pointerdown', 200, 80));

      expect(component.selected()).toBe(layer);
    });

    it('writes a drag onto the key standing at the scrubber', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const from = layer.x;
      layer.tracks = '{"x":[{"t":0,"v":' + from + '},{"t":1000,"v":' + from + '}]}';

      drag([layer.x + 10, layer.y + 10], [layer.x + 50, layer.y + 10]);

      expect(layer.x).toBe(from);
      expect(layer.trackSet.x?.[0].v).toBe(from + 40);
    });

    it('lets go of a drag the browser took away, keeping where it got to', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const from = layer.x;

      editor().onPointerDown(pointer('pointerdown', from + 10, layer.y + 10));
      editor().onPointerMove(pointer('pointermove', from + 40, layer.y + 10));

      // No release arrives; the next moves come with nothing held down.
      editor().onPointerMove(pointer('pointermove', from + 400, layer.y + 400, 0));
      editor().onPointerMove(pointer('pointermove', from + 900, layer.y + 900, 0));

      expect(layer.x).toBe(from + 30);
    });

    it('leaves a locked layer alone', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      layer.locked = true;
      const from = { x: layer.x, y: layer.y };

      drag([layer.x + 10, layer.y + 10], [layer.x + 40, layer.y + 30]);

      expect(layer.x).toBe(from.x);
      expect(layer.y).toBe(from.y);
    });

    it('changes nothing for a reader', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();
      const from = { x: layer.x, y: layer.y };

      drag([layer.x + 10, layer.y + 10], [layer.x + 40, layer.y + 30]);

      expect(layer.x).toBe(from.x);
      expect(layer.y).toBe(from.y);
    });
  });

  describe('taking a change back', () => {
    function key(name: string, chord = true, shift = false): KeyboardEvent {
      return {
        key: name,
        ctrlKey: chord,
        metaKey: false,
        shiftKey: shift,
        target: document.createElement('div'),
        preventDefault: () => {},
      } as unknown as KeyboardEvent;
    }

    it('has nothing to take back to begin with', () => {
      expect(editor().canUndo()).toBe(false);
      expect(editor().canRedo()).toBe(false);
    });

    it('takes an added layer away again', () => {
      editor().addImageLayer();
      expect(editor().canUndo()).toBe(true);

      editor().undo();

      expect(component.layers()).toEqual([]);
    });

    it('puts it back', () => {
      editor().addImageLayer();
      editor().undo();

      editor().redo();

      expect(component.layers()).toHaveLength(1);
    });

    it('takes a whole drag back in one step', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      const from = { x: layer.x, y: layer.y };
      drag([layer.x + 10, layer.y + 10], [layer.x + 60, layer.y + 40]);

      editor().undo();

      expect(component.layers()[0].x).toBe(from.x);
      expect(component.layers()[0].y).toBe(from.y);
    });

    it('takes a deleted layer back, keeping what it was called', () => {
      editor().addImageLayer();
      component.layers()[0].name = '立ち絵';
      // The properties panel commits after every write; this stands in for that.
      editor().changed();
      editor().removeSelected();

      editor().undo();

      expect(component.layers()).toHaveLength(1);
      expect(component.layers()[0].name).toBe('立ち絵');
    });

    it('lets go of a selection that was taken away', () => {
      editor().addImageLayer();
      editor().undo();

      expect(component.selected()).toBeNull();
    });

    it('listens for the keys', () => {
      editor().addImageLayer();

      editor().onKeyDown(key('z'));
      expect(component.layers()).toEqual([]);

      editor().onKeyDown(key('z', true, true));
      expect(component.layers()).toHaveLength(1);
    });

    it('changes nothing for a reader', () => {
      editor().addImageLayer();
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();

      editor().undo();

      expect(component.layers()).toHaveLength(1);
    });
  });

  describe('the sounds a scene drops', () => {
    it('has none to begin with', () => {
      editor().addImageLayer();

      expect(component.sounds()).toEqual([]);
    });

    it('slides one along the clock', () => {
      editor().addImageLayer();
      component.scene()!.sounds = '[{"t":200,"a":"se-1","v":100}]';

      editor().onMoveSound({ fromMs: 200, toMs: 900 });

      expect(component.sounds().map((sound) => sound.t)).toEqual([900]);
    });

    it('takes one away', () => {
      editor().addImageLayer();
      component.scene()!.sounds = '[{"t":200,"a":"se-1","v":100}]';

      editor().onRemoveSound({ ms: 200 });

      expect(component.sounds()).toEqual([]);
    });

    it('changes nothing for a reader', () => {
      editor().addImageLayer();
      component.scene()!.sounds = '[{"t":200,"a":"se-1","v":100}]';
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();

      editor().onRemoveSound({ ms: 200 });

      expect(component.sounds()).toHaveLength(1);
    });
  });

  describe('taking away what stands at the playhead, for a screen that cannot double-click', () => {
    type PlayheadApi = {
      canRemoveKeysAtPlayhead(): boolean;
      hasSoundAtPlayhead(): boolean;
      removeKeysAtPlayhead(): void;
      removeSoundAtPlayhead(): void;
      onToggleLocked(layer: CutInLayer): void;
      onRemoveKey(removed: { layer: CutInLayer; ms: number }): void;
    };

    function playhead(): PlayheadApi {
      return component as unknown as PlayheadApi;
    }

    it('takes away the keys of the layer in hand once the playhead stands on them', () => {
      editor().addImageLayer();
      const layer = component.layers()[0];
      layer.tracks = encodeCutInTracks({
        x: [
          { t: 0, v: 0 },
          { t: 1000, v: 10 },
        ],
        opacity: [{ t: 1000, v: 1 }],
      });
      editor().changed();

      editor().onSeek(500);
      expect(playhead().canRemoveKeysAtPlayhead()).toBe(false);

      editor().onSeek(1000);
      expect(playhead().canRemoveKeysAtPlayhead()).toBe(true);

      playhead().removeKeysAtPlayhead();

      expect(layer.trackSet.x?.map((key) => key.t)).toEqual([0]);
      expect(layer.trackSet.opacity ?? []).toEqual([]);
      expect(playhead().canRemoveKeysAtPlayhead()).toBe(false);
    });

    describe('on a locked layer', () => {
      function keyedAtPlayhead(): CutInLayer {
        editor().addImageLayer();
        const layer = component.layers()[0];
        layer.tracks = encodeCutInTracks({
          x: [
            { t: 0, v: 0 },
            { t: 1000, v: 10 },
          ],
        });
        editor().changed();
        editor().onSeek(1000);
        fixture.detectChanges();
        return layer;
      }

      function removeKeysButton(): HTMLButtonElement {
        return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
          '[data-testid="cut-in-remove-keys"]'
        )!;
      }

      it('turns off the button that takes the keys away', () => {
        const layer = keyedAtPlayhead();
        expect(removeKeysButton().disabled).toBe(false);

        playhead().onToggleLocked(layer);
        fixture.detectChanges();

        expect(removeKeysButton().disabled).toBe(true);
      });

      it('leaves the keys where they are, whatever asks for them to go', () => {
        const layer = keyedAtPlayhead();
        playhead().onToggleLocked(layer);

        playhead().removeKeysAtPlayhead();
        playhead().onRemoveKey({ layer, ms: 1000 });

        expect(layer.trackSet.x?.map((key) => key.t)).toEqual([0, 1000]);
      });
    });

    it('takes away the sound the playhead stands on', () => {
      editor().addImageLayer();
      component.scene()!.sounds = '[{"t":200,"a":"se-1","v":100}]';
      editor().changed();

      editor().onSeek(100);
      expect(playhead().hasSoundAtPlayhead()).toBe(false);

      editor().onSeek(200);
      expect(playhead().hasSoundAtPlayhead()).toBe(true);

      playhead().removeSoundAtPlayhead();

      expect(component.sounds()).toEqual([]);
    });
  });

  describe('the regions that handle their own pointer', () => {
    it('claims the stage and the whole timeline section from the panel', () => {
      const root = fixture.nativeElement as HTMLElement;
      const claimed = Array.from(root.querySelectorAll('.panel-no-drag'));

      // A press in either drags a layer, a keyframe or a row — not the panel.
      expect(claimed).toHaveLength(2);
      expect(root.querySelector('cut-in-layer-list')?.closest('.panel-no-drag')).toBeTruthy();
      expect(root.querySelector('cut-in-timeline')?.closest('.panel-no-drag')).toBeTruthy();
      // The stage is the one the press handlers sit on, whether or not a scene is up yet.
      expect(claimed.some((element) => element.hasAttribute('data-stage'))).toBe(true);
    });
  });

  describe('moving along the scene', () => {
    function withKeys(): void {
      editor().addTextLayer();
      const layer = component.layers()[0];
      layer.tracks = encodeCutInTracks({
        x: [
          { t: 200, v: 0 },
          { t: 800, v: 100 },
        ],
      });
      editor().onSelect(layer);
      fixture.detectChanges();
    }

    it('steps the playhead by the grid a moment is rounded to', () => {
      withKeys();

      editor().stepBy(10);
      expect(editor().playheadMs()).toBe(10);

      editor().stepBy(-10);
      expect(editor().playheadMs()).toBe(0);
    });

    it('never steps out of the scene at either end', () => {
      withKeys();

      editor().stepBy(-10);
      expect(editor().playheadMs()).toBe(0);

      editor().onSeek(component.durationMs());
      editor().stepBy(10);
      expect(editor().playheadMs()).toBe(component.durationMs());
    });

    it('goes to the next moment something happens at, not the next tick', () => {
      withKeys();

      editor().jumpToKey(true);
      expect(editor().playheadMs()).toBe(200);

      editor().jumpToKey(true);
      expect(editor().playheadMs()).toBe(800);
    });

    it('goes back the same way', () => {
      withKeys();
      editor().onSeek(1000);

      editor().jumpToKey(false);
      expect(editor().playheadMs()).toBe(800);
    });

    it('counts the ends of the scene among the moments worth landing on', () => {
      withKeys();
      editor().onSeek(900);

      editor().jumpToKey(true);
      expect(editor().playheadMs()).toBe(component.durationMs());
    });

    it('stays where it is where there is nothing further to reach', () => {
      withKeys();
      editor().onSeek(component.durationMs());

      editor().jumpToKey(true);
      expect(editor().playheadMs()).toBe(component.durationMs());
    });
  });

  describe('a key or a sound tapped on the timeline', () => {
    type PlaybackApi = {
      togglePlaying(): void;
      playing(): boolean;
      timelineRoomPx: { set(px: number): void };
    };
    type TimelinePressApi = {
      onRowDown(event: PointerEvent, row: TimelineRow): void;
      onSoundRowDown(event: PointerEvent): void;
      onPointerUp(event: PointerEvent): void;
    };

    function playback(): PlaybackApi {
      return component as unknown as PlaybackApi;
    }

    function timeline(): CutInTimelineComponent {
      return fixture.debugElement.query(By.directive(CutInTimelineComponent)).componentInstance;
    }

    function press(x: number): PointerEvent {
      return { clientX: x, shiftKey: false, pointerId: 1, target: null } as unknown as PointerEvent;
    }

    function withKeyAndSound(): void {
      editor().addImageLayer();
      component.layers()[0].tracks = encodeCutInTracks({ x: [{ t: 1000, v: 10 }] });
      component.scene()!.sounds = '[{"t":2000,"a":"se-1","v":100}]';
      playback().timelineRoomPx.set(TIMELINE_HEAD_W_PX + 900);
      editor().changed();
      fixture.detectChanges();
    }

    function tapKey(): void {
      const row = timeline().rows()[0];
      const api = timeline() as unknown as TimelinePressApi;
      api.onRowDown(press(row.keys[0].x), row);
      api.onPointerUp(press(row.keys[0].x));
    }

    function tapSound(): void {
      const x = timeline().soundMarks()[0].x;
      const api = timeline() as unknown as TimelinePressApi;
      api.onSoundRowDown(press(x));
      api.onPointerUp(press(x));
    }

    it('moves the playhead onto it while the preview is stopped', () => {
      withKeyAndSound();

      tapKey();
      expect(editor().playheadMs()).toBe(1000);

      tapSound();
      expect(editor().playheadMs()).toBe(2000);
    });

    it('leaves a playing preview playing on', () => {
      withKeyAndSound();
      playback().togglePlaying();
      expect(playback().playing()).toBe(true);

      tapKey();
      tapSound();

      expect(playback().playing()).toBe(true);
      expect(editor().playheadMs()).toBe(0);
    });
  });

  describe('drawing the timeline out', () => {
    it('starts fitted to the room it has', () => {
      expect(editor().timelineZoom()).toBe(1);
      expect(editor().zoomPercent()).toBe(100);
      expect(editor().canZoomOut()).toBe(false);
    });

    it('leans in and back out again', () => {
      editor().zoomIn();
      expect(editor().timelineZoom()).toBeGreaterThan(1);
      expect(editor().canZoomOut()).toBe(true);

      editor().zoomOut();
      expect(editor().timelineZoom()).toBe(1);
    });

    it('will not be drawn in past fitting', () => {
      editor().zoomOut();
      expect(editor().timelineZoom()).toBe(1);
    });

    it('comes back to fitting when asked', () => {
      editor().zoomIn();
      editor().zoomIn();
      editor().zoomToFit();

      expect(editor().timelineZoom()).toBe(1);
    });

    it('stops at a scale past which nothing more can be read', () => {
      for (let at = 0; at < 40; at++) editor().zoomIn();

      expect(editor().canZoomIn()).toBe(false);
    });
  });

  describe('how long a layer is on screen for', () => {
    function aLayer(): CutInLayer {
      editor().addTextLayer();
      return component.layers()[0];
    }

    it('is set by dragging the ends of its band', () => {
      const layer = aLayer();

      editor().onTrimLayer({ layer, startMs: 200, endMs: 900 });

      expect(layer.startMs).toBe(200);
      expect(layer.endMs).toBe(900);
    });

    it('is left alone on a locked layer', () => {
      const layer = aLayer();
      layer.locked = true;

      editor().onTrimLayer({ layer, startMs: 200, endMs: 900 });

      expect(layer.startMs).toBe(0);
    });

    it('is left alone where the scene is not open to being changed', () => {
      const layer = aLayer();
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();

      editor().onTrimLayer({ layer, startMs: 200, endMs: 900 });

      expect(layer.startMs).toBe(0);
    });
  });

  describe('leaning into the stage', () => {
    it('starts fitted to the room it has', () => {
      expect(editor().stageZoom()).toBe(1);
      expect(editor().stagePercent()).toBe(100);
      expect(editor().canStageZoomOut()).toBe(false);
    });

    it('leans in and back out again', () => {
      editor().stageZoomIn();
      expect(editor().stageZoom()).toBeGreaterThan(1);

      editor().stageZoomOut();
      expect(editor().stageZoom()).toBe(1);
    });

    it('comes back to fitting when asked', () => {
      editor().stageZoomIn();
      editor().stageZoomIn();
      editor().stageZoomToFit();

      expect(editor().stageZoom()).toBe(1);
    });

    it('stops where nothing more is gained by leaning further', () => {
      for (let at = 0; at < 20; at++) editor().stageZoomIn();

      expect(editor().canStageZoomIn()).toBe(false);
    });

    it('leans the layers in with the handles drawn over them', () => {
      // The handles are worked out here and the layers are drawn by the stage. Leaning only
      // one of the two in leaves every grip beside the layer it belongs to.
      editor().addImageLayer();
      editor().stageZoomIn();
      fixture.detectChanges();

      const stage = fixture.debugElement.query(By.directive(CutInStageComponent));
      expect(stage.componentInstance.zoom()).toBe(editor().stageZoom());
    });
  });

  describe('taking a moment and laying it down again', () => {
    function movingLayer(): CutInLayer {
      editor().addTextLayer();
      const layer = component.layers()[0];
      layer.tracks = encodeCutInTracks({
        x: [
          { t: 0, v: 0 },
          { t: 1000, v: 200 },
        ],
      });
      editor().onSelect(layer);
      fixture.detectChanges();
      return layer;
    }

    it('holds nothing to begin with', () => {
      expect(editor().hasHeldPose).toBe(false);
    });

    it('takes what the layer in hand is holding at the playhead', () => {
      movingLayer();

      editor().copyPose();

      expect(editor().hasHeldPose).toBe(true);
    });

    it('lays it down again where the playhead has moved to', () => {
      const layer = movingLayer();
      editor().onSeek(1000);
      editor().copyPose();
      editor().onSeek(1400);

      editor().pastePose();

      expect(valueAt(layer, 'x', 1400)).toBeCloseTo(200, 5);
    });

    it('lays nothing down on a locked layer', () => {
      const layer = movingLayer();
      editor().copyPose();
      layer.locked = true;
      editor().onSeek(1400);

      editor().pastePose();

      expect(keysOf(layer, 'x')).toHaveLength(2);
    });

    it('lays nothing down with nothing held', () => {
      const layer = movingLayer();
      editor().onSeek(1400);

      editor().pastePose();

      expect(keysOf(layer, 'x')).toHaveLength(2);
    });
  });

  describe('typing a moment rather than dragging at one', () => {
    it('goes to the second typed', () => {
      editor().addTextLayer();
      fixture.detectChanges();

      editor().onSeekSeconds({ target: { value: '0.4' } } as unknown as Event);

      expect(editor().playheadMs()).toBe(400);
      expect(editor().playheadSeconds()).toBe(0.4);
    });

    it('holds what was typed inside the scene', () => {
      editor().addTextLayer();
      fixture.detectChanges();

      editor().onSeekSeconds({ target: { value: '-5' } } as unknown as Event);
      expect(editor().playheadMs()).toBe(0);

      editor().onSeekSeconds({ target: { value: '9999' } } as unknown as Event);
      expect(editor().playheadMs()).toBe(component.durationMs());
    });

    it('ignores anything that is not a number', () => {
      editor().addTextLayer();
      editor().onSeek(300);
      fixture.detectChanges();

      editor().onSeekSeconds({ target: { value: 'soon' } } as unknown as Event);

      expect(editor().playheadMs()).toBe(300);
    });
  });

  describe('moving the layer in hand by the arrows', () => {
    function aLayer(): CutInLayer {
      editor().addTextLayer();
      const layer = component.layers()[0];
      editor().onSelect(layer);
      fixture.detectChanges();
      return layer;
    }

    it('moves where the layer rests, where it is keyed at nothing', () => {
      const layer = aLayer();
      const wasX = layer.x;
      const wasY = layer.y;

      editor().nudgeSelected(10, -10);

      expect(layer.x).toBe(wasX + 10);
      expect(layer.y).toBe(wasY - 10);
    });

    it('moves the key instead, where the layer is keyed at the playhead', () => {
      const layer = aLayer();
      layer.tracks = encodeCutInTracks({
        x: [
          { t: 0, v: 40 },
          { t: 500, v: 90 },
        ],
      });

      editor().nudgeSelected(10, 0);

      expect(valueAt(layer, 'x', 0)).toBe(50);
      // The one further along is left where it was.
      expect(valueAt(layer, 'x', 500)).toBe(90);
    });

    it('leaves a locked layer where it is', () => {
      const layer = aLayer();
      layer.locked = true;
      const was = layer.x;

      editor().nudgeSelected(10, 0);

      expect(layer.x).toBe(was);
    });

    it('leaves it alone where the scene is not open to being changed', () => {
      const layer = aLayer();
      const was = layer.x;
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();

      editor().nudgeSelected(10, 0);

      expect(layer.x).toBe(was);
    });
  });
});

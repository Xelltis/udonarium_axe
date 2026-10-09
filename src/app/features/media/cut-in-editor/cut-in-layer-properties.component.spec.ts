import { ComponentFixture, TestBed } from '@angular/core/testing';
import { encodeCutInTracks } from '@axe/domain/media/cut-in-keyframe';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInLayerPropertiesComponent } from '@axe/features/media/cut-in-editor/cut-in-layer-properties.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInLayerPropertiesComponent', () => {
  let fixture: ComponentFixture<CutInLayerPropertiesComponent>;
  let component: CutInLayerPropertiesComponent;
  let layer: CutInLayer;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInLayerPropertiesComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    layer = new CutInLayer();
    layer.initialize();
    layer.x = 100;

    fixture = TestBed.createComponent(CutInLayerPropertiesComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('layer', layer);
    fixture.componentRef.setInput('isEditable', true);
    fixture.detectChanges();
  });

  function atPlayhead(ms: number): void {
    fixture.componentRef.setInput('playheadMs', ms);
    fixture.detectChanges();
  }

  it('says nothing without a layer', () => {
    fixture.componentRef.setInput('layer', null);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('レイヤーを選ぶ');
  });

  it('moves where the layer rests while nothing moves it', () => {
    component.x = 250;

    expect(layer.x).toBe(250);
    expect(layer.tracks).toBe('');
  });

  it('reads what a track says at the scrubber', () => {
    layer.tracks = encodeCutInTracks({
      x: [
        { t: 0, v: 0, e: 'linear' },
        { t: 1000, v: 200 },
      ],
    });
    atPlayhead(500);

    expect(component.x).toBe(100);
  });

  it('writes onto the track once one is there', () => {
    layer.tracks = encodeCutInTracks({
      x: [
        { t: 0, v: 0 },
        { t: 1000, v: 200 },
      ],
    });
    atPlayhead(500);

    component.x = 42;

    expect(component.x).toBe(42);
    expect(layer.x).toBe(100);
  });

  it('puts a key down at the scrubber and takes it up again', () => {
    atPlayhead(400);

    expect(component.keyed('x')).toBe(false);

    component.toggleKey('x');
    expect(component.keyed('x')).toBe(true);

    component.toggleKey('x');
    expect(component.keyed('x')).toBe(false);
  });

  it('keys both directions of the scale together', () => {
    atPlayhead(400);

    component.toggleKey('scaleX');

    expect(component.keyed('scaleX')).toBe(true);
    expect(layer.trackSet.scaleY).toHaveLength(1);
  });

  it('tells the editor after every change', () => {
    let commits = 0;
    component.commit.subscribe(() => commits++);

    component.x = 10;
    component.rotation = 45;

    expect(commits).toBe(2);
  });

  it('changes nothing for a reader', () => {
    fixture.componentRef.setInput('isEditable', false);
    fixture.detectChanges();

    component.x = 999;

    expect(layer.x).toBe(100);
  });

  describe('what a text layer is told', () => {
    beforeEach(() => {
      layer.kind = 'text';
      fixture.detectChanges();
    });

    it('takes the words and the way they look', () => {
      component.text = '見せ場だ';
      component.fontSizePx = 64;
      component.color = '#ff8800';
      component.textAlign = 'left';

      expect(layer.text).toBe('見せ場だ');
      expect(layer.fontSizePx).toBe(64);
      expect(layer.color).toBe('#ff8800');
      expect(layer.textAlign).toBe('left');
    });

    it('holds the weight to what a font has', () => {
      component.fontWeight = 5000;
      expect(layer.fontWeight).toBe(900);

      component.fontWeight = 0;
      expect(layer.fontWeight).toBe(400);
    });

    it('turns away an alignment that means nothing', () => {
      component.textAlign = 'sideways' as never;

      expect(layer.textAlign).toBe('center');
    });

    it('never gives the outline a negative width', () => {
      component.strokeWidthPx = -4;

      expect(layer.strokeWidthPx).toBe(0);
    });
  });

  describe('what a band layer is told', () => {
    beforeEach(() => {
      layer.kind = 'fill';
      fixture.detectChanges();
    });

    it('starts as one flat colour', () => {
      expect(component.fillGradient).toBe(false);
    });

    it('shades into another colour when asked, starting from the one it has', () => {
      component.fillFrom = '#102030';
      component.fillGradient = true;

      expect(layer.fillTo).toBe('#102030');
      expect(component.fillGradient).toBe(true);
    });

    it('goes back to one colour when told to', () => {
      component.fillGradient = true;
      component.fillGradient = false;

      expect(layer.fillTo).toBe('');
    });

    it('takes the angle it shades along', () => {
      component.fillAngleDeg = 45;

      expect(layer.fillAngleDeg).toBe(45);
    });

    it('takes the shape the shading runs in', () => {
      component.fillShape = 'radial';

      expect(layer.fillShape).toBe('radial');
    });

    it('turns away a shape it does not know', () => {
      component.fillShape = 'spiral' as never;

      expect(layer.fillShape).toBe('linear');
    });

    it('passes through a third colour when asked', () => {
      expect(component.fillHasMid).toBe(false);

      component.fillHasMid = true;

      expect(layer.fillMid.length).toBeGreaterThan(0);
      expect(component.fillHasMid).toBe(true);
    });

    it('drops the third colour again', () => {
      component.fillHasMid = true;
      component.fillHasMid = false;

      expect(layer.fillMid).toBe('');
    });
  });

  describe('the curve out of a key', () => {
    it('is offered only where a key stands', () => {
      atPlayhead(400);
      expect(component.keyedHere).toBe(false);

      component.toggleKey('x');
      expect(component.keyedHere).toBe(true);
    });

    it('starts as the one a new key is drawn with', () => {
      atPlayhead(400);
      component.toggleKey('x');

      expect(component.easingHere).toBe('outCubic');
    });

    it('is written to every key standing there', () => {
      atPlayhead(400);
      component.toggleKey('x');
      component.toggleKey('opacity');

      component.easingHere = 'linear';

      expect(layer.trackSet.x?.[0].e).toBe('linear');
      expect(layer.trackSet.opacity?.[0].e).toBe('linear');
    });

    it('says nothing where the keys standing there disagree', () => {
      atPlayhead(400);
      component.toggleKey('x');
      component.toggleKey('opacity');
      component.easingHere = 'linear';
      layer.tracks = layer.tracks.replace('"e":"linear"', '"e":"outBack"');

      expect(component.easingHere).toBe('');
    });

    it('turns away a curve it does not know', () => {
      atPlayhead(400);
      component.toggleKey('x');

      component.easingHere = 'nonsense' as never;

      expect(component.easingHere).toBe('outCubic');
    });
  });

  describe('the ready-made ways in and out', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('sceneWidth', 640);
      fixture.componentRef.setInput('sceneHeight', 360);
      fixture.componentRef.setInput('sceneDurationMs', 3000);
      fixture.detectChanges();
    });

    it('lays the keys of an entrance down', () => {
      component.entrance = 'slideInLeft';

      expect(layer.trackSet.x).toHaveLength(2);
      expect(layer.trackSet.x?.[1].v).toBe(100);
    });

    it('lays the keys of an exit down, ending with the scene', () => {
      component.exit = 'fadeOut';

      expect(layer.trackSet.opacity?.[1].t).toBe(3000);
    });

    it('goes back to offering rather than remembering', () => {
      component.entrance = 'fadeIn';

      expect(component.entrance).toBe('');
    });

    it('takes how long it should last', () => {
      component.presetMs = 900;
      component.entrance = 'fadeIn';

      expect(layer.trackSet.opacity?.[1].t).toBe(900);
    });

    it('turns away a preset it does not know', () => {
      component.entrance = 'somersault' as never;

      expect(layer.tracks).toBe('');
    });

    it('changes nothing for a reader', () => {
      fixture.componentRef.setInput('isEditable', false);
      fixture.detectChanges();

      component.entrance = 'fadeIn';

      expect(layer.tracks).toBe('');
    });
  });

  describe('the touch a layer wears', () => {
    it('starts wearing none', () => {
      expect(component.effect).toBe('none');
      expect(component.effectHasColor).toBe(false);
    });

    it('takes a touch and how strong it is', () => {
      component.effect = 'shake';
      component.effectStrength = 150;

      expect(layer.effect).toBe('shake');
      expect(layer.effectStrength).toBeCloseTo(1.5, 5);
    });

    it('holds the strength to what makes sense', () => {
      component.effectStrength = 9000;

      expect(layer.effectStrength).toBe(3);
    });

    it('offers a colour only for the one that has one', () => {
      component.effect = 'glow';
      expect(component.effectHasColor).toBe(true);

      component.effect = 'shake';
      expect(component.effectHasColor).toBe(false);
    });

    it('turns away a touch it does not know', () => {
      component.effect = 'sparkle' as never;

      expect(layer.effect).toBe('none');
    });
  });

  describe('a whole look', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('sceneWidth', 640);
      fixture.componentRef.setInput('sceneHeight', 360);
      fixture.componentRef.setInput('sceneDurationMs', 3000);
      fixture.detectChanges();
    });

    it('writes the arrival, the departure and the touch at once', () => {
      component.look = 'impact';

      expect(layer.effect).toBe('shake');
      expect(layer.trackSet.scaleX?.length).toBeGreaterThan(1);
    });

    it('goes back to offering rather than remembering', () => {
      component.look = 'headline';

      expect(component.look).toBe('');
    });

    it('leaves the layer alone for a look it does not know', () => {
      component.look = 'nonsense';

      expect(layer.tracks).toBe('');
    });
  });

  describe('the shape a layer is cut down to', () => {
    it('keeps its own box to begin with', () => {
      expect(component.clip).toBe('none');
    });

    it('takes an outline to be cut to', () => {
      component.clip = 'torn';

      expect(layer.clip).toBe('torn');
    });

    it('turns away an outline it does not know', () => {
      component.clip = 'trapezoid' as never;

      expect(layer.clip).toBe('none');
    });

    it('shows an outline it does not know as none, leaving it as it was', () => {
      layer.clip = 'trapezoid' as never;

      expect(component.clip).toBe('none');
      expect(layer.clip).toBe('trapezoid');
    });

    it('takes a lean, held to what still leaves something to see', () => {
      component.skewXDeg = 30;
      expect(layer.skewXDeg).toBe(30);

      component.skewXDeg = 400;
      expect(layer.skewXDeg).toBe(80);

      component.skewYDeg = -400;
      expect(layer.skewYDeg).toBe(-80);
    });
  });

  describe('a fill that repeats', () => {
    beforeEach(() => {
      layer.kind = 'fill';
      fixture.detectChanges();
    });

    it('offers a pitch only for the fills that repeat', () => {
      component.fillShape = 'linear';
      expect(component.fillRepeats).toBe(false);

      component.fillShape = 'halftone';
      expect(component.fillRepeats).toBe(true);

      component.fillShape = 'speedlines';
      expect(component.fillRepeats).toBe(true);
    });

    it('takes the pitch, held to what can still be seen', () => {
      component.fillScalePx = 40;
      expect(layer.fillScalePx).toBe(40);

      component.fillScalePx = 9999;
      expect(layer.fillScalePx).toBe(200);

      component.fillScalePx = 0;
      expect(layer.fillScalePx).toBe(24);
    });
  });

  describe('letting a layer in a part at a time', () => {
    it('lets the whole of it in to begin with', () => {
      expect(component.wipeShape).toBe('none');
      expect(component.wipePercent).toBe(100);
    });

    it('takes a way of letting it in', () => {
      component.wipeShape = 'chevronRight';

      expect(layer.wipeShape).toBe('chevronRight');
    });

    it('turns away one it does not know', () => {
      component.wipeShape = 'spiral' as never;

      expect(layer.wipeShape).toBe('none');
    });

    it('leaves a layer just given a wipe fully in rather than shut', () => {
      layer.wipe = 0;

      component.wipeShape = 'right';

      expect(layer.wipe).toBe(1);
    });

    it('takes how far along it is, and can key it', () => {
      component.wipePercent = 40;
      expect(layer.wipe).toBeCloseTo(0.4, 5);

      fixture.componentRef.setInput('playheadMs', 300);
      fixture.detectChanges();
      component.toggleKey('wipe');

      expect(component.keyed('wipe')).toBe(true);
    });
  });

  describe('taking a layer away again', () => {
    it('leaves the whole of it there to begin with', () => {
      expect(component.crumbleShape).toBe('none');
      expect(component.crumblePercent).toBe(100);
    });

    it('takes a way of taking it away, apart from the way it came in', () => {
      component.wipeShape = 'chevronRight';
      component.crumbleShape = 'crumbleLeft';

      expect(layer.wipeShape).toBe('chevronRight');
      expect(layer.crumbleShape).toBe('crumbleLeft');
    });

    it('leaves a layer just given one whole rather than gone', () => {
      layer.crumble = 0;

      component.crumbleShape = 'crumbleLeft';

      expect(layer.crumble).toBe(1);
    });

    it('takes how much is left, and can key it', () => {
      component.crumblePercent = 30;
      expect(layer.crumble).toBeCloseTo(0.3, 5);

      fixture.componentRef.setInput('playheadMs', 400);
      fixture.detectChanges();
      component.toggleKey('crumble');

      expect(component.keyed('crumble')).toBe(true);
    });
  });

  describe('how the words are set', () => {
    beforeEach(() => {
      layer.kind = 'text';
      fixture.detectChanges();
    });

    it('pulls the letters together or pushes them apart', () => {
      component.letterSpacingPx = -12;

      expect(layer.letterSpacingPx).toBe(-12);
    });

    it('takes the space between the lines, held to what stays readable', () => {
      component.lineHeight = 180;
      expect(layer.lineHeight).toBeCloseTo(1.8, 5);

      component.lineHeight = 9999;
      expect(layer.lineHeight).toBe(4);
    });

    it('sets the words downwards when asked', () => {
      component.vertical = true;

      expect(layer.vertical).toBe(true);
    });
  });
});

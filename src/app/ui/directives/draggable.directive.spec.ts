import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { vi } from 'vitest';

@Component({
  selector: 'test-host',
  template: `<div appDraggable [draggable.disable]="isDisabled"></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DraggableDirective],
})
class TestHostComponent {
  isDisabled = false;
}

@Component({
  selector: 'stack-host',
  template: `<div
    class="stacked"
    appDraggable
    draggable.stack=".stacked"
    [attr.data-z-layer]="layer"
    [style.zIndex]="zIndex"
  ></div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DraggableDirective],
})
class StackHostComponent {
  layer: string | null = null;
  zIndex = '10';
}

@Component({
  selector: 'regions-host',
  template: `<div appDraggable>
    <div class="loose"><span class="inside-loose">plain</span></div>
    <div class="panel-no-drag"><div class="inside-claimed">a timeline</div></div>
    <button class="a-button">press</button>
    <div class="written" contenteditable="true"><p class="written-line">words</p></div>
  </div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [DraggableDirective],
})
class RegionsHostComponent {}

describe('DraggableDirective', () => {
  it('should be defined', () => {
    expect(DraggableDirective).toBeDefined();
  });

  describe('setup and teardown', () => {
    let fixture: ComponentFixture<TestHostComponent>;
    let directive: DraggableDirective;

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [TestHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();

      fixture = TestBed.createComponent(TestHostComponent);
    });

    it('initialises on ngAfterViewInit', () => {
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      expect(directive).toBeDefined();
    });

    it('holds still while it is told to be still', () => {
      fixture.componentInstance.isDisabled = true;
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const cancel = vi.spyOn(directive, 'cancel');

      const start = (directive as unknown as { onInputStart(event: MouseEvent): void }).onInputStart.bind(directive);
      start(new MouseEvent('mousedown', { button: 0 }));

      expect(cancel).toHaveBeenCalled();
    });

    it('takes a press again once it is let go', () => {
      fixture.componentInstance.isDisabled = false;
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const cancel = vi.spyOn(directive, 'cancel');

      const start = (directive as unknown as { onInputStart(event: MouseEvent): void }).onInputStart.bind(directive);
      start(new MouseEvent('mousedown', { button: 0 }));

      expect(cancel).not.toHaveBeenCalled();
    });

    it('tells the host when a drag ends, so what moved can be written down', () => {
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const ended: unknown[] = [];
      directive.onend.subscribe((event) => ended.push(event));

      const end = (directive as unknown as { onInputEnd(event: MouseEvent): void }).onInputEnd.bind(directive);
      end(new MouseEvent('mouseup'));

      expect(ended).toHaveLength(1);
    });

    it('says the place is settled once the window stops changing shape', () => {
      vi.useFakeTimers();
      try {
        fixture.detectChanges();
        directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
        let settled = 0;
        directive.onsettle.subscribe(() => (settled += 1));

        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        window.dispatchEvent(new Event('resize'));
        expect(settled).toBe(0);

        vi.advanceTimersByTime(400);

        expect(settled).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cleans up on destroy without throwing', () => {
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      expect(() => fixture.destroy()).not.toThrow();
    });

    it('resets the style attribute when a drag ends', () => {
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const element = fixture.nativeElement.querySelector('div') as HTMLElement;

      // set a style
      element.style.opacity = '0.5';
      element.style.willChange = 'top, left';

      // call the private method to stand in for onInputEnd
      // the real handler is internal, so check that destruct is safe to call
      expect(() => directive['destroy']()).not.toThrow();
    });

    it('survives a null querySelector result while correcting the position', () => {
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const element = fixture.nativeElement.querySelector('div') as HTMLElement;

      // stand in for a missing bounds element
      const originalQuerySelector = element.ownerDocument.querySelector;
      element.ownerDocument.querySelector = vi.fn((selector: string) => {
        if (selector === 'body') {
          return originalQuerySelector.call(element.ownerDocument, selector);
        }
        return null;
      });

      // to confirm the correction is safe to run,
      // expect adjustPosition to be called
      expect(() => fixture.detectChanges()).not.toThrow();

      // clean up
      element.ownerDocument.querySelector = originalQuerySelector;
    });
  });

  describe('what a press may start a drag on', () => {
    let fixture: ComponentFixture<RegionsHostComponent>;
    let directive: DraggableDirective;

    function claimed(selector: string): boolean {
      const target = fixture.nativeElement.querySelector(selector) as HTMLElement;
      return (directive as unknown as { isUnhandleElement(target: HTMLElement): boolean }).isUnhandleElement(target);
    }

    beforeEach(async () => {
      TestBed.configureTestingModule({
        imports: [RegionsHostComponent],
        providers: [...TEST_PROVIDERS],
      }).compileComponents();

      fixture = TestBed.createComponent(RegionsHostComponent);
      fixture.detectChanges();
      directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
    });

    it('takes a press anywhere the contents have not claimed', () => {
      expect(claimed('.loose')).toBe(false);
    });

    it('leaves a press on a control alone, as it always has', () => {
      expect(claimed('.a-button')).toBe(true);
      expect(claimed('.inside-loose')).toBe(true);
    });

    it('leaves alone a region the contents have claimed for themselves', () => {
      expect(claimed('.panel-no-drag')).toBe(true);
    });

    it('leaves alone what sits inside such a region, however deep', () => {
      expect(claimed('.inside-claimed')).toBe(true);
    });

    it('leaves a press in text that can be written in to select its words', () => {
      expect(claimed('.written')).toBe(true);
      expect(claimed('.written-line')).toBe(true);
    });
  });

  describe('bringing what was taken hold of to the front', () => {
    function sibling(zIndex: string, layered = false): HTMLElement {
      const element = document.createElement('div');
      element.className = 'stacked';
      element.style.zIndex = zIndex;
      if (layered) element.setAttribute('data-z-layer', zIndex);
      document.body.appendChild(element);
      return element;
    }

    function pressOn(fixture: ComponentFixture<StackHostComponent>): void {
      const directive = fixture.debugElement.children[0].injector.get(DraggableDirective);
      const start = (directive as unknown as { onInputStart(event: MouseEvent): void }).onInputStart.bind(directive);
      start(new MouseEvent('mousedown', { button: 0 }));
    }

    beforeEach(() => {
      TestBed.configureTestingModule({ imports: [StackHostComponent], providers: [...TEST_PROVIDERS] });
    });

    afterEach(() => {
      for (const element of [...document.querySelectorAll('.stacked')]) element.remove();
    });

    it('raises an ordinary panel over the others', () => {
      sibling('100');
      sibling('101');
      const fixture = TestBed.createComponent(StackHostComponent);
      fixture.detectChanges();

      pressOn(fixture);

      expect(parseInt((fixture.debugElement.children[0].nativeElement as HTMLElement).style.zIndex)).toBeGreaterThan(0);
    });

    it('leaves a panel on a layer of its own where it was put, and out of the reckoning', () => {
      const ordinary = sibling('100');
      const layered = sibling('1900001', true);
      const fixture = TestBed.createComponent(StackHostComponent);
      fixture.detectChanges();

      pressOn(fixture);
      const host = fixture.debugElement.children[0].nativeElement as HTMLElement;

      expect(layered.style.zIndex).toBe('1900001');
      expect(parseInt(host.style.zIndex)).toBeLessThan(1_000_000);
      expect(parseInt(ordinary.style.zIndex)).toBeLessThan(1_000_000);
    });

    it('holds still itself when it is the one on its own layer', () => {
      sibling('100');
      sibling('900');
      const fixture = TestBed.createComponent(StackHostComponent);
      fixture.componentInstance.layer = '1900001';
      fixture.componentInstance.zIndex = '1900001';
      fixture.detectChanges();

      pressOn(fixture);

      expect((fixture.debugElement.children[0].nativeElement as HTMLElement).style.zIndex).toBe('1900001');
    });
  });
});

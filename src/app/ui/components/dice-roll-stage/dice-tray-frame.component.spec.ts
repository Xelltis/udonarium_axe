import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { DiceFrame, DiceThrow, DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { PLAIN_DICE_LOOK } from '@axe/domain/dice/dice-3d/dice-look';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { DiceTrayFrameComponent } from '@axe/ui/components/dice-roll-stage/dice-tray-frame.component';

function throwOf(id: string): DiceThrow {
  return {
    key: id,
    messageIdentifier: id,
    part: 0,
    stage: 'frame',
    placement: null,
    dice: [{ shape: 'd6', labels: 'standard', target: 0, shows: '4' }],
    overflow: 0,
    look: PLAIN_DICE_LOOK,
    color: '#3b5bdb',
    tray: { halfWidth: 8, halfDepth: 2.4 },
    aspect: 10 / 3,
    phase: 'settled',
    result: null,
    startedAt: 0,
    still: false,
    shown: ['4'],
    outcome: '',
  };
}

/** Stands in for the browser's watch on what is in view, told by the test when that changes. */
class StandInIntersectionObserver {
  static made: StandInIntersectionObserver[] = [];
  private readonly targets: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    StandInIntersectionObserver.made.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  tell(inView: boolean): void {
    if (this.targets.length < 1) return;
    const entries = this.targets.map((target) => ({ target, isIntersecting: inView }) as IntersectionObserverEntry);
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

describe('DiceTrayFrameComponent', () => {
  let stills: string[];
  let registered: { canvas: HTMLCanvasElement; key: string; released: boolean; sized: [number, number][] }[];
  let view: { IntersectionObserver: unknown };
  let observerBefore: unknown;

  function mount(id: string, frame: DiceFrame): ComponentFixture<DiceTrayFrameComponent> {
    const fixture = TestBed.createComponent(DiceTrayFrameComponent);
    fixture.componentRef.setInput('messageIdentifier', id);
    fixture.componentRef.setInput('frame', frame);
    fixture.detectChanges();
    return fixture;
  }

  async function scrolled(fixture: ComponentFixture<DiceTrayFrameComponent>, inView: boolean): Promise<void> {
    await fixture.whenStable();
    for (const observer of StandInIntersectionObserver.made) observer.tell(inView);
    await fixture.whenStable();
  }

  beforeEach(() => {
    stills = [];
    registered = [];
    StandInIntersectionObserver.made = [];
    view = document.defaultView as unknown as { IntersectionObserver: unknown };
    observerBefore = view.IntersectionObserver;
    view.IntersectionObserver = StandInIntersectionObserver;
    TestBed.configureTestingModule({
      imports: [DiceTrayFrameComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: DiceThrowService, useValue: { showStill: (id: string) => stills.push(id) } },
        {
          provide: DiceRenderService,
          useValue: {
            register: (canvas: HTMLCanvasElement, key: string) => {
              const entry = { canvas, key, released: false, sized: [] as [number, number][] };
              registered.push(entry);
              return {
                resize: (width: number, height: number) => entry.sized.push([width, height]),
                release: () => (entry.released = true),
              };
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    view.IntersectionObserver = observerBefore;
  });

  it('draws the tray in the shape of its throw, with its dice on show', () => {
    const fixture = mount('line', { key: 'line', aspect: 10 / 3, overflow: 2, diceThrow: throwOf('line') });

    const stage = fixture.nativeElement.querySelector('[data-testid="dice-roll-stage"]') as HTMLElement;
    expect(stage.dataset['state']).toBe('settled');
    expect(stage.dataset['shown']).toBe('4');
    expect(stage.textContent).toContain('+2');
  });

  it('puts its canvas on the stage only while in view, and gives the picture back once out of it', async () => {
    const fixture = mount('line', { key: 'line', aspect: 10 / 3, overflow: 0, diceThrow: throwOf('line') });
    await fixture.whenStable();
    expect(registered).toEqual([]);

    await scrolled(fixture, true);
    expect(registered).toHaveLength(1);
    expect(registered[0].key).toBe('line');
    const canvas = registered[0].canvas;
    expect(canvas).toBe(fixture.nativeElement.querySelector('canvas'));
    canvas.width = 640;
    canvas.height = 160;

    await scrolled(fixture, false);
    expect(registered[0].released).toBe(true);
    expect([canvas.width, canvas.height]).toEqual([0, 0]);

    await scrolled(fixture, true);
    expect(registered).toHaveLength(2);
    expect(registered[1].released).toBe(false);
  });

  it('takes its canvas off the stage when it goes', async () => {
    const fixture = mount('line', { key: 'line', aspect: 10 / 3, overflow: 0, diceThrow: throwOf('line') });
    await scrolled(fixture, true);

    fixture.destroy();

    expect(registered[0].released).toBe(true);
  });

  it('has the dice of a line not thrown yet laid down once in view, and leaves thrown ones be', async () => {
    const waiting = mount('quiet', { key: 'quiet', aspect: 4, overflow: 0, diceThrow: null });
    await waiting.whenStable();
    expect(stills).toEqual([]);

    await scrolled(waiting, true);
    expect(stills).toEqual(['quiet']);

    StandInIntersectionObserver.made = [];
    const thrown = mount('line', { key: 'line', aspect: 4, overflow: 0, diceThrow: throwOf('line') });
    await scrolled(thrown, true);
    expect(stills).toEqual(['quiet']);
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { MeasuredRuler } from '@axe/application/tabletop/ruler-reading.service';
import { RulerReading } from '@axe/domain/tabletop/ruler/ruler-line';
import { RulerBandComponent } from '@axe/features/tabletop/ruler/ruler-band.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RulerBandComponent', () => {
  const measured = signal<MeasuredRuler | null>(null);

  beforeEach(() => {
    measured.set(null);
    TestBed.configureTestingModule({
      imports: [RulerBandComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: RulerService,
          useValue: { inHand: signal(true), measured, liftEnd: vi.fn(), putAway: vi.fn(), leaveOnTable: vi.fn() },
        },
      ],
    });
  });

  async function readingSaid(reading: RulerReading): Promise<string> {
    measured.set({ from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, reading });
    const fixture = TestBed.createComponent(RulerBandComponent);
    await fixture.whenStable();
    const said = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="ruler-band-reading"]');
    return Array.from(said?.children ?? [], (part) => (part.textContent ?? '').replace(/\s+/g, ' ').trim()).join(' ');
  }

  it('says the lengths in squares where the room counts in squares', async () => {
    expect(await readingSaid({ unit: 'square', straight: '5.0', level: '3.0', rise: '+4.0', steps: 4 })).toBe(
      '直線 5.0マス 水平 3.0 高さ +4.0 マス数 4'
    );
  });

  it('says every length in metres or feet where the room counts its squares in one, and the squares as they are', async () => {
    expect(await readingSaid({ unit: 'metre', straight: '7.5', level: '4.5', rise: '+6.0', steps: 4 })).toBe(
      '直線 7.5m 水平 4.5m 高さ +6.0m マス数 4'
    );
    expect(await readingSaid({ unit: 'foot', straight: '25.0', level: '15.0', rise: '-5.0', steps: null })).toBe(
      '直線 25.0ft 水平 15.0ft 高さ -5.0ft'
    );
  });
});

import { TestBed } from '@angular/core/testing';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TargetBandComponent } from '@axe/features/tabletop/target-band/target-band.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';

describe('TargetBandComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [TargetBandComponent], providers: [...TEST_PROVIDERS] });
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceOnTable(): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: 100, y: 100 };
    return piece;
  }

  async function band() {
    const fixture = TestBed.createComponent(TargetBandComponent);
    await fixture.whenStable();
    return { fixture, host: fixture.nativeElement as HTMLElement };
  }

  it('says nothing while no piece is aimed at', async () => {
    pieceOnTable();
    expect((await band()).host.querySelector('[data-testid="target-band"]')).toBeNull();
  });

  it('says how many are aimed at, a step above the band a move is worked out on and over every panel', async () => {
    const targets = TestBed.inject(PieceTargetService);
    targets.toggle(pieceOnTable());
    targets.toggle(pieceOnTable());
    const { host } = await band();

    const shown = host.querySelector<HTMLElement>('[data-testid="target-band"]')!;
    expect(shown).not.toBeNull();
    expect(host.querySelector('[data-testid="target-band-count"]')!.textContent).toContain('2');
    const classes = shown.className.split(/\s+/);
    expect(classes).toContain('fixed');
    expect(classes).toContain('bottom-40');
    expect(shown.style.zIndex).toBe(`${Z_TABLE_BANDS}`);
  });

  it('leaves a piece aimed at off the table uncounted', async () => {
    const targets = TestBed.inject(PieceTargetService);
    const away = pieceOnTable();
    away.location.name = 'graveyard';
    targets.toggle(away);

    expect((await band()).host.querySelector('[data-testid="target-band"]')).toBeNull();
  });

  it('takes every aim off at a press, and says nothing after', async () => {
    const targets = TestBed.inject(PieceTargetService);
    const one = pieceOnTable();
    const two = pieceOnTable();
    targets.toggle(one);
    targets.toggle(two);
    const { fixture, host } = await band();

    host.querySelector<HTMLButtonElement>('[data-testid="target-band-clear"]')!.click();
    await fixture.whenStable();

    expect(one.targeted).toBe(false);
    expect(two.targeted).toBe(false);
    expect(host.querySelector('[data-testid="target-band"]')).toBeNull();
  });
});

import { TestBed } from '@angular/core/testing';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { MovePlanBandComponent } from '@axe/features/tabletop/move-plan-band/move-plan-band.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';

describe('MovePlanBandComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MovePlanBandComponent], providers: [...TEST_PROVIDERS] });
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.initialize();
  });

  afterEach(() => {
    TestBed.inject(MovePlanService).cancel();
    Config.instance.zoneEnabled = null;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function walker(): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: 100, y: 100 };
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = 3;
    return piece;
  }

  async function band(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(MovePlanBandComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says nothing while no move is being worked out', async () => {
    expect((await band()).querySelector('[data-testid="move-plan-hint"]')).toBeNull();
  });

  it('says how while one is, at the foot of the screen and over every panel', async () => {
    expect(TestBed.inject(MovePlanService).begin(walker())).toBe(true);
    const hint = (await band()).querySelector<HTMLElement>('[data-testid="move-plan-hint"]')!;

    expect(hint).not.toBeNull();
    const classes = hint.className.split(/\s+/);
    expect(classes.some((name) => name.startsWith('top-'))).toBe(false);
    expect(classes).toContain('bottom-28');
    expect(classes).toContain('fixed');
    expect(hint.style.zIndex).toBe(`${Z_TABLE_BANDS}`);
  });

  it('offers a move nobody may stop where the room plays zones, and makes it so', async () => {
    Config.instance.zoneEnabled = true;
    const piece = walker();
    TestBed.inject(MovePlanService).begin(piece);
    const host = await band();

    const button = host.querySelector<HTMLButtonElement>('[data-testid="move-plan-unstoppable"]')!;
    expect(button.getAttribute('aria-pressed')).toBe('false');
    button.click();

    expect(piece.unstoppableMove).toBe('1');
  });

  it('offers no move nobody may stop where the room plays no zones', async () => {
    TestBed.inject(MovePlanService).begin(walker());

    expect((await band()).querySelector('[data-testid="move-plan-unstoppable"]')).toBeNull();
  });
});

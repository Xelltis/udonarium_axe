import { TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { modelMotionsOf } from '@axe/domain/tabletop/model-motions';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelMotionFieldsComponent } from '@axe/ui/components/piece-model-fields/model-motion-fields.component';

describe('ModelMotionFieldsComponent', () => {
  let piece: GameCharacter;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelMotionFieldsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    piece = GameCharacter.create('騎士', 1, '');
    piece.modelIdentifier = 'knight';
  });

  afterEach(() => piece.destroy());

  async function render(motions: readonly string[], fights = true) {
    const fixture = TestBed.createComponent(ModelMotionFieldsComponent);
    fixture.componentRef.setInput('target', piece);
    fixture.componentRef.setInput('motions', motions);
    fixture.componentRef.setInput('fights', fights);
    const tried: string[] = [];
    fixture.componentInstance.tried.subscribe((role) => tried.push(role));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const find = <E extends HTMLElement = HTMLSelectElement>(testId: string) =>
      element.querySelector<E>(`[data-testid="${testId}"]`);
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const choose = async (testId: string, index: number) => {
      const select = find(testId)!;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    return { find, choose, settle, tried };
  }

  const MOTIONS = ['Idle', 'Run', 'Slash', 'Death'];

  it('offers each role the model’s motions, and says which the model plays where it is left to the model', async () => {
    const { find } = await render(MOTIONS);

    expect([...find('piece-model-attack')!.options].map((option) => option.textContent?.trim())).toEqual([
      expect.stringContaining('Slash'),
      ...MOTIONS,
    ]);
    expect(find('piece-model-hit')!.options[0].textContent).not.toContain('Idle');
  });

  it('writes the motions chosen for standing and walking to their own fields, and those of a fight together', async () => {
    const { choose } = await render(MOTIONS);

    await choose('piece-model-idle', 2);
    await choose('piece-model-walk', 2);
    await choose('piece-model-hit', 3);
    await choose('piece-model-defeat', 4);

    expect([piece.modelIdle, piece.modelWalk]).toEqual(['Run', 'Run']);
    expect(modelMotionsOf(piece.modelMotions)).toMatchObject({ attack: '', hit: 'Slash', defeat: 'Death', made: true });

    await choose('piece-model-hit', 0);
    expect(modelMotionsOf(piece.modelMotions).hit).toBe('');
  });

  it('keeps a motion asked for that the model lacks on offer, rather than dropping it', async () => {
    piece.modelIdle = 'Guard';
    const { find } = await render(MOTIONS);
    const idle = find('piece-model-idle')!;

    expect(idle.options[idle.selectedIndex].textContent?.trim()).toBe('Guard');
  });

  it('turns moving the whole model by hand off and on', async () => {
    const { find, settle } = await render(MOTIONS);
    const made = find<HTMLInputElement>('piece-model-made')!;

    made.checked = false;
    made.dispatchEvent(new Event('change'));
    await settle();
    expect(modelMotionsOf(piece.modelMotions).made).toBe(false);
    expect(find<HTMLButtonElement>('piece-model-try-hit')!.disabled).toBe(true);
    expect(find<HTMLButtonElement>('piece-model-try-attack')!.disabled).toBe(false);

    made.checked = true;
    made.dispatchEvent(new Event('change'));
    await settle();
    expect(piece.modelMotions).toBe('');
  });

  it('asks for a role to be tried', async () => {
    const { find, tried } = await render(MOTIONS);

    find<HTMLButtonElement>('piece-model-try-attack')!.click();
    find<HTMLButtonElement>('piece-model-try-walk')!.click();

    expect(tried).toEqual(['attack', 'walk']);
  });

  it('says a model with no motions is moved whole, and still lets each role but standing be tried', async () => {
    const { find } = await render([]);

    expect(find('piece-model-attack')).toBeNull();
    expect(find('piece-model-try-idle')).toBeNull();
    expect(find<HTMLButtonElement>('piece-model-try-attack')!.disabled).toBe(false);
  });

  it('gives a block, which only stands, the motion it stands in alone', async () => {
    const { find } = await render(MOTIONS, false);

    expect(find('piece-model-idle')).not.toBeNull();
    expect(find('piece-model-walk')).toBeNull();
    expect(find('piece-model-attack')).toBeNull();
    expect(find('piece-model-made')).toBeNull();
  });
});

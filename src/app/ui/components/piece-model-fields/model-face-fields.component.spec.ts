import { TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { modelFaceOf, NO_SHAPE } from '@axe/domain/tabletop/model-face';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelFaceFieldsComponent } from '@axe/ui/components/piece-model-fields/model-face-fields.component';

describe('ModelFaceFieldsComponent', () => {
  let piece: GameCharacter;
  const SHAPES = ['Blink', 'Joy', 'Angry', 'aa'];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelFaceFieldsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    piece = GameCharacter.create('魔法使い', 1, '');
    piece.modelIdentifier = 'wizard';
  });

  afterEach(() => piece.destroy());

  async function render() {
    const fixture = TestBed.createComponent(ModelFaceFieldsComponent);
    fixture.componentRef.setInput('target', piece);
    fixture.componentRef.setInput('shapes', SHAPES);
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
    /** Drags a slider, or types in a box, to a value, letting it go there unless told it is still held. */
    const slide = async (testId: string, value: string, letGo = true) => {
      const input = find<HTMLInputElement>(testId)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      if (letGo) input.dispatchEvent(new Event('change'));
      await settle();
    };
    return { find, choose, slide, settle };
  }

  it('says which shape the model blinks and speaks with where that is left to the model', async () => {
    const { find } = await render();

    expect(find('model-face-blink')!.options[0].textContent).toContain('Blink');
    expect(find('model-face-mouth')!.options[0].textContent).toContain('aa');
    expect(find('model-face-breath')!.options[0].textContent).not.toContain('Blink');
  });

  it('sets the shape a use takes, or turns the use off', async () => {
    const { choose } = await render();

    await choose('model-face-blink', 1);
    await choose('model-face-mouth', 3);

    expect(modelFaceOf(piece.modelFace)).toMatchObject({ blink: NO_SHAPE, mouth: 'Joy' });
  });

  it('holds the model in a shape added, as far as it is slid, and lets go of it once it is slid to nothing', async () => {
    const { choose, slide, find } = await render();

    await choose('model-face-add-weight', 2);
    expect(modelFaceOf(piece.modelFace).weights).toEqual({ Joy: 1 });
    expect([...find('model-face-add-weight')!.options].map((option) => option.textContent?.trim())).not.toContain(
      'Joy'
    );

    await slide('model-face-weight-Joy', '0.4', false);
    expect(modelFaceOf(piece.modelFace).weights).toEqual({ Joy: 1 });
    await slide('model-face-weight-Joy', '0.4');
    expect(modelFaceOf(piece.modelFace).weights).toEqual({ Joy: 0.4 });

    await slide('model-face-weight-Joy', '0');
    expect(piece.modelFace).toBe('');
  });

  it('sways between shapes added, each as long and as far as set, and no more once it is removed', async () => {
    const { choose, slide, find, settle } = await render();

    await choose('model-face-add-sway', 3);
    expect(modelFaceOf(piece.modelFace).sways).toEqual([{ name: 'Angry', periodMs: 3000, amount: 1 }]);

    await slide('model-face-sway-seconds-0', '1.5');
    await slide('model-face-sway-amount-0', '0.5');
    expect(modelFaceOf(piece.modelFace).sways).toEqual([{ name: 'Angry', periodMs: 1500, amount: 0.5 }]);

    find<HTMLElement>('model-face-sway-amount-0')!.parentElement!.querySelector('button')!.click();
    await settle();
    expect(piece.modelFace).toBe('');
  });
});

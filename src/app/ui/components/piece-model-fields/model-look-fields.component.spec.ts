import { TestBed } from '@angular/core/testing';
import { GameCharacter } from '@axe/domain/character/game-character';
import { MAX_MODEL_LOOK_MATERIALS, modelLookOf, writeModelLook } from '@axe/domain/tabletop/model-look';
import { presetModelLook } from '@axe/domain/tabletop/model-look-presets';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelLookFieldsComponent } from '@axe/ui/components/piece-model-fields/model-look-fields.component';

describe('ModelLookFieldsComponent', () => {
  let piece: GameCharacter;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelLookFieldsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    piece = GameCharacter.create('騎士', 1, '');
    piece.modelIdentifier = 'knight';
  });

  afterEach(() => piece.destroy());

  async function render(materials: readonly string[] = ['Armour', 'Cloak']) {
    const fixture = TestBed.createComponent(ModelLookFieldsComponent);
    fixture.componentRef.setInput('target', piece);
    fixture.componentRef.setInput('materials', materials);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const find = <E extends HTMLElement = HTMLInputElement>(testId: string) =>
      element.querySelector<E>(`[data-testid="${testId}"]`);
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const choose = async (testId: string, index: number) => {
      const select = find<HTMLSelectElement>(testId)!;
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change'));
      await settle();
    };
    const tick = async (testId: string, checked: boolean) => {
      const box = find(testId)!;
      box.checked = checked;
      box.dispatchEvent(new Event('change'));
      await settle();
    };
    /** Drags a slider to a value, letting it go there unless told it is still held. */
    const slide = async (testId: string, value: string, letGo = true) => {
      const input = find(testId)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      if (letGo) input.dispatchEvent(new Event('change'));
      await settle();
    };
    return { find, choose, tick, slide, settle };
  }

  it('writes a slider only once it is let go, not at each step of the drag', async () => {
    const { tick, slide } = await render();
    await tick('model-look-roughness-on', true);
    const before = piece.modelLook;

    await slide('model-look-roughness', '0.9', false);
    expect(piece.modelLook).toBe(before);

    await slide('model-look-roughness', '0.9');
    expect(piece.modelLook).toContain('"roughness":0.9');
  });

  it('draws the whole model in a ready-made look chosen, and shows which it is drawn in', async () => {
    const { find, choose } = await render();
    const preset = () => find<HTMLSelectElement>('model-look-preset')!;
    expect(preset().options[preset().selectedIndex].textContent?.trim()).toBe('そのまま');

    await choose('model-look-preset', 3);

    expect(modelLookOf(piece.modelLook)).toEqual(presetModelLook('gold'));
    expect(preset().options).toHaveLength(9);
  });

  it('shows a look that is none of the ready-made as set by hand', async () => {
    piece.modelLook = writeModelLook({ ...presetModelLook('gold'), roughness: 0.9 });
    const { find } = await render();
    const preset = find<HTMLSelectElement>('model-look-preset')!;

    expect(preset.options).toHaveLength(10);
    expect(preset.selectedIndex).toBe(0);
  });

  it('sets the finish, a tint, and the metal and the roughness, each left to the model until it is turned on', async () => {
    const { find, choose, tick, slide } = await render();
    expect(find('model-look-metalness')).toBeNull();

    await choose('model-look-finish', 2);
    await tick('model-look-tint-on', true);
    await tick('model-look-metalness-on', true);
    await slide('model-look-metalness', '0.9');
    await tick('model-look-plain', true);

    expect(modelLookOf(piece.modelLook)).toMatchObject({
      finish: 'toon',
      tint: '#ffffff',
      metalness: 0.9,
      roughness: null,
      plain: true,
    });

    await tick('model-look-metalness-on', false);
    await tick('model-look-tint-on', false);
    expect(modelLookOf(piece.modelLook)).toMatchObject({ tint: '', metalness: null });
  });

  it('gives off a glow once it is turned on, as strong as set, and none once it is turned off', async () => {
    const { find, tick, slide } = await render();
    expect(find('model-look-glow')).toBeNull();

    await tick('model-look-glow-on', true);
    await slide('model-look-glow-strength', '3');
    expect(modelLookOf(piece.modelLook)).toMatchObject({ glow: '#ffd27a', glowStrength: 3 });

    await tick('model-look-glow-on', false);
    expect(piece.modelLook).toBe('');
  });

  it('keeps how solid the model is only where it lets light through', async () => {
    const { slide } = await render();

    await slide('model-look-opacity', '0.4');
    expect(modelLookOf(piece.modelLook).opacity).toBe(0.4);

    await slide('model-look-opacity', '1');
    expect(piece.modelLook).toBe('');
  });

  it('sets one material alone once it is chosen, which may be left undrawn, and marks it in the list', async () => {
    const { find, choose, tick } = await render();
    expect(find('model-look-hidden')).toBeNull();

    await choose('model-look-scope', 2);
    expect(find('model-look-preset')).toBeNull();
    await tick('model-look-hidden', true);
    await tick('model-look-plain', true);

    expect(modelLookOf(piece.modelLook).materials).toEqual({
      Cloak: expect.objectContaining({ hidden: true, plain: true }),
    });
    expect(modelLookOf(piece.modelLook).plain).toBe(false);
    expect(find<HTMLSelectElement>('model-look-scope')!.options[2].textContent).toContain('●');
  });

  it('keeps the looks of single materials when the whole model is given a ready-made look', async () => {
    piece.modelLook = '{"materials":{"Cloak":{"hidden":true}}}';
    const { choose } = await render();

    await choose('model-look-preset', 2);

    expect(modelLookOf(piece.modelLook)).toMatchObject({ metalness: 1, materials: { Cloak: { hidden: true } } });
  });

  it('draws the model as it was made again, every material of it, once it is reset', async () => {
    piece.modelLook = '{"finish":"toon","materials":{"Cloak":{"hidden":true}}}';
    const { find, settle } = await render();

    find<HTMLButtonElement>('model-look-reset')!.click();
    await settle();

    expect(piece.modelLook).toBe('');
  });

  it('lets no more materials be chosen once as many as are kept are set apart, and says so', async () => {
    const names = Array.from({ length: MAX_MODEL_LOOK_MATERIALS + 1 }, (_, index) => `M${index}`);
    const materials = Object.fromEntries(names.slice(0, -1).map((name) => [name, { plain: true }]));
    piece.modelLook = JSON.stringify({ materials });
    const { find } = await render(names);

    const options = find<HTMLSelectElement>('model-look-scope')!.options;
    expect(options[1].disabled).toBe(false);
    expect(options[names.length].disabled).toBe(true);
    expect(find('model-look-materials-full')?.textContent).toContain(String(MAX_MODEL_LOOK_MATERIALS));
  });

  it('offers no material to choose where the model names none', async () => {
    const { find } = await render([]);

    expect(find('model-look-scope')).toBeNull();
    expect(find('model-look-preset')).not.toBeNull();
  });
});

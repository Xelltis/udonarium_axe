import { TestBed } from '@angular/core/testing';
import { ModelPortraitService } from '@axe/application/character/model-portrait.service';
import { EFFECT_STAGE_LOADER } from '@axe/application/effect/effect-stage-loader';
import { ModelNamesService } from '@axe/application/tabletop/model-names.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import type { GltfNames } from '@axe/core/storage/gltf-names';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelPreviewComponent } from '@axe/ui/components/piece-model-fields/model-preview.component';
import { PieceModelFieldsComponent } from '@axe/ui/components/piece-model-fields/piece-model-fields.component';

describe('PieceModelFieldsComponent', () => {
  let piece: GameCharacter;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PieceModelFieldsComponent],
      providers: [...TEST_PROVIDERS, { provide: EFFECT_STAGE_LOADER, useValue: () => Promise.resolve(null) }],
    }).compileComponents();
    piece = GameCharacter.create('騎士', 1, '');
    vi.spyOn(TestBed.inject(ModelStorage), 'models', 'get').mockReturnValue([
      { identifier: 'b'.repeat(64), name: 'tree.glb', isReady: true },
      { identifier: 'a'.repeat(64), name: 'knight.glb', isReady: true },
      { identifier: 'c'.repeat(64), name: 'coming.glb', isReady: false },
    ] as never);
  });

  afterEach(() => {
    piece.destroy();
    vi.restoreAllMocks();
  });

  function render() {
    const fixture = TestBed.createComponent(PieceModelFieldsComponent);
    fixture.componentRef.setInput('target', piece);
    fixture.detectChanges();
    return fixture;
  }

  it('offers the models held here in full, by name, after none', () => {
    const options = [...(render().nativeElement as HTMLElement).querySelectorAll('[data-testid="piece-model"] option')];

    expect(options.map((option) => option.textContent?.trim())).toEqual([expect.any(String), 'knight.glb', 'tree.glb']);
  });

  it('gives the piece a model read from a file chosen, and sizes and turns it as written', async () => {
    vi.spyOn(TestBed.inject(FileArchiver), 'load').mockResolvedValue({
      dataRead: false,
      images: [],
      audios: [],
      models: ['a'.repeat(64)],
    });
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector<HTMLInputElement>('[data-testid="piece-model-file"]')!;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array(8)], 'knight.glb')] });

    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(piece.modelIdentifier).toBe('a'.repeat(64));
    const scale = element.querySelector<HTMLInputElement>('[data-testid="piece-model-scale"]')!;
    scale.value = '50';
    scale.dispatchEvent(new Event('change'));
    const turn = element.querySelector<HTMLInputElement>('[data-testid="piece-model-turn"]')!;
    turn.value = '-90';
    turn.dispatchEvent(new Event('change'));
    expect(piece.modelScale).toBe('10');
    expect(piece.modelTurn).toBe('270');
  });

  describe('opened further', () => {
    async function setUp(names: GltfNames, fights = true) {
      piece.modelIdentifier = 'a'.repeat(64);
      vi.spyOn(TestBed.inject(ModelNamesService), 'namesOf').mockReturnValue(names);
      const fixture = TestBed.createComponent(PieceModelFieldsComponent);
      fixture.componentRef.setInput('target', piece);
      fixture.componentRef.setInput('fights', fights);
      await fixture.whenStable();
      const element = fixture.nativeElement as HTMLElement;
      const details = element.querySelector<HTMLDetailsElement>('[data-testid="piece-model-setup"]')!;
      const open = async (opened: boolean) => {
        details.open = opened;
        details.dispatchEvent(new Event('toggle'));
        await fixture.whenStable();
        fixture.detectChanges();
      };
      return { element, open, fixture };
    }

    it('shows nothing of the setting up, nor its preview, until it is opened', async () => {
      const { element, open } = await setUp({ motions: ['Idle'], shapes: [], materials: ['Armour'], vrm: false });
      expect(element.querySelector('model-preview')).toBeNull();
      expect(element.querySelector('model-look-fields')).toBeNull();

      await open(true);
      expect(element.querySelector('model-preview')).not.toBeNull();
      expect(element.querySelector('[data-testid="model-look-scope"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="piece-model-attack"]')).not.toBeNull();

      await open(false);
      expect(element.querySelector('model-preview')).toBeNull();
    });

    it('offers the motions for VRM models to give only a VRM', async () => {
      const plain = await setUp({ motions: [], shapes: [], materials: [], vrm: false });
      await plain.open(true);
      expect(plain.element.querySelector('model-given-motions')).toBeNull();

      const vrm = await setUp({ motions: [], shapes: [], materials: [], vrm: true });
      await vrm.open(true);
      expect(vrm.element.querySelector('model-given-motions')).not.toBeNull();
    });

    it('sets up the shapes only of a model that has any', async () => {
      const without = await setUp({ motions: [], shapes: [], materials: [], vrm: false });
      await without.open(true);
      expect(without.element.querySelector('model-face-fields')).toBeNull();

      const shaped = await setUp({ motions: [], shapes: ['Blink'], materials: [], vrm: false });
      await shaped.open(true);
      expect(shaped.element.querySelector('[data-testid="model-face-blink"]')).not.toBeNull();
    });

    it('adds a picture of the model as the preview shows it to the piece’s portraits, named as the model', async () => {
      vi.spyOn(TestBed.inject(ModelStorage), 'models', 'get').mockReturnValue([
        { identifier: 'a'.repeat(64), name: 'knight.glb', isReady: true },
      ] as never);
      const picture = new Blob(['picture']);
      vi.spyOn(ModelPreviewComponent.prototype, 'picture').mockResolvedValue(picture);
      const added = vi.spyOn(TestBed.inject(ModelPortraitService), 'addShown').mockResolvedValue(true);
      const { element, open, fixture } = await setUp({ motions: [], shapes: [], materials: [], vrm: false });
      await open(true);

      element.querySelector<HTMLButtonElement>('[data-testid="piece-model-portrait"]')!.click();
      await fixture.whenStable();

      expect(added).toHaveBeenCalledWith(piece, picture, 'knight');
    });

    it('offers no portrait to anything but a piece', async () => {
      const block = new Terrain();
      block.initialize();
      block.modelIdentifier = 'a'.repeat(64);
      vi.spyOn(TestBed.inject(ModelNamesService), 'namesOf').mockReturnValue({
        motions: [],
        shapes: [],
        materials: [],
        vrm: false,
      });
      const fixture = TestBed.createComponent(PieceModelFieldsComponent);
      fixture.componentRef.setInput('target', block);
      fixture.componentRef.setInput('fights', false);
      await fixture.whenStable();
      const details = (fixture.nativeElement as HTMLElement).querySelector<HTMLDetailsElement>(
        '[data-testid="piece-model-setup"]'
      )!;
      details.open = true;
      details.dispatchEvent(new Event('toggle'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).querySelector('model-preview')).not.toBeNull();
      expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="piece-model-portrait"]')).toBeNull();
      block.destroy();
    });

    it('gives a block no motions to walk or fight in', async () => {
      const { element, open } = await setUp(
        { motions: ['Idle', 'Slash'], shapes: [], materials: [], vrm: false },
        false
      );
      await open(true);

      expect(element.querySelector('[data-testid="piece-model-idle"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="piece-model-attack"]')).toBeNull();
    });

    it('has the preview try an act each time a role is tried, walk until it is tried again, and stand for standing', async () => {
      const { element, open, fixture } = await setUp({
        motions: ['Idle', 'Run', 'Slash'],
        shapes: [],
        materials: [],
        vrm: false,
      });
      await open(true);
      const tried = () =>
        (
          fixture.componentInstance as unknown as {
            tried: () => { act: { key: string; role: string } | null; walking: boolean };
          }
        ).tried();
      const press = async (role: string) => {
        element.querySelector<HTMLButtonElement>(`[data-testid="piece-model-try-${role}"]`)!.click();
        await fixture.whenStable();
      };

      await press('attack');
      const first = tried().act;
      expect(first?.role).toBe('attack');
      await press('attack');
      expect(tried().act?.key).not.toBe(first?.key);

      await press('walk');
      expect(tried()).toEqual({ act: null, walking: true });
      await press('walk');
      expect(tried().walking).toBe(false);

      await press('attack');
      await press('idle');
      expect(tried()).toEqual({ act: null, walking: false });
    });
  });
});

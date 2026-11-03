import { TestBed } from '@angular/core/testing';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { PieceModelFieldsComponent } from '@axe/ui/components/piece-model-fields/piece-model-fields.component';

describe('PieceModelFieldsComponent', () => {
  let piece: GameCharacter;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PieceModelFieldsComponent],
      providers: [...TEST_PROVIDERS],
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
});

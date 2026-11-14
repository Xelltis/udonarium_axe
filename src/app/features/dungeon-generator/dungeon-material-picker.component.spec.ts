import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DungeonMaterial } from '@axe/application/tabletop/dungeon-build.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { DungeonMaterialPickerComponent } from '@axe/features/dungeon-generator/dungeon-material-picker.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DungeonMaterialPickerComponent', () => {
  let fixture: ComponentFixture<DungeonMaterialPickerComponent>;
  let open: ReturnType<typeof vi.fn>;
  let changed: DungeonMaterial[];

  async function setup(value: DungeonMaterial): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DungeonMaterialPickerComponent],
      providers: [...TEST_PROVIDERS, { provide: ModalService, useValue: { open } }],
    }).compileComponents();
    fixture = TestBed.createComponent(DungeonMaterialPickerComponent);
    fixture.componentRef.setInput('ids', ['stone', 'wood']);
    fixture.componentRef.setInput('urls', { stone: 'stone.webp', wood: 'wood.webp' });
    fixture.componentRef.setInput('value', value);
    changed = [];
    fixture.componentInstance.changed.subscribe((material) => changed.push(material));
    await fixture.whenStable();
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  }

  beforeEach(() => {
    open = vi.fn().mockResolvedValue('');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('offers a button for each texture and one for the library, with the chosen texture marked', async () => {
    await setup({ kind: 'texture', id: 'wood' });

    expect(buttons().length).toBe(3);
    expect(buttons().map((button) => button.classList.contains('border-ui-accent'))).toEqual([false, true, false]);
  });

  it('tells of the texture picked', async () => {
    await setup({ kind: 'texture', id: 'wood' });

    buttons()[0].click();

    expect(changed).toEqual([{ kind: 'texture', id: 'stone' }]);
  });

  it('marks the library button and shows its picture in place of the icon when a library image is chosen', async () => {
    vi.spyOn(ImageStorage.instance, 'get').mockImplementation((identifier) =>
      identifier === 'picture-1' ? ({ url: 'blob:picture-1' } as ImageFile) : null
    );
    await setup({ kind: 'library', identifier: 'picture-1' });

    const library = buttons()[2];
    expect(library.classList.contains('border-ui-accent')).toBe(true);
    expect(library.querySelector('i')).toBeNull();
    expect(buttons()[0].classList.contains('border-ui-accent')).toBe(false);
  });

  it('tells of the image picked from the library, and of nothing where the picker was left', async () => {
    await setup({ kind: 'texture', id: 'wood' });
    expect(buttons()[2].querySelector('i')).not.toBeNull();

    buttons()[2].click();
    await fixture.whenStable();
    expect(changed).toEqual([]);

    open.mockResolvedValue('picture-2');
    buttons()[2].click();
    await fixture.whenStable();
    expect(changed).toEqual([{ kind: 'library', identifier: 'picture-2' }]);
  });
});

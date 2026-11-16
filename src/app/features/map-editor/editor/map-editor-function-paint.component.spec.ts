import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { MapEditorFunctionPaintComponent } from '@axe/features/map-editor/editor/map-editor-function-paint.component';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { TextureIntakeService } from '@axe/features/map-editor/editor/texture-intake.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MapEditorFunctionPaintComponent', () => {
  let fixture: ComponentFixture<MapEditorFunctionPaintComponent>;
  let component: MapEditorFunctionPaintComponent;
  let imageStorage: { get: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    imageStorage = { get: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [MapEditorFunctionPaintComponent],
      providers: [...TEST_PROVIDERS, MapEditorState],
    }).compileComponents();
    TestBed.overrideProvider(ImageStorage, { useValue: imageStorage });
    fixture = TestBed.createComponent(MapEditorFunctionPaintComponent);
    component = fixture.componentInstance;
  });

  describe('dressing a wall in a picture that ships with the room', () => {
    interface Dresser {
      chooseFaceTexture: (face: 'wall', url: string) => void;
      state: MapEditorState;
    }

    function dresser(): Dresser {
      return component as unknown as Dresser;
    }

    it('wears the texture as an image the terrain can hold', () => {
      imageStorage.get.mockReturnValue(undefined);
      const add = vi.fn().mockReturnValue({ identifier: 'wall-asset' });
      (imageStorage as unknown as { add: unknown }).add = add;

      dresser().chooseFaceTexture('wall', 'assets/images/walls/wall_brick.webp');

      expect(add).toHaveBeenCalledWith('assets/images/walls/wall_brick.webp');
      expect(dresser().state.functionSpec().terrain.images.wall).toBe('wall-asset');
    });

    it('wears a texture that was added by hand', async () => {
      const dressed = component as unknown as {
        addFaceTexture: (face: 'wall') => void;
        onFaceTextureFileSelected: (event: Event) => Promise<void>;
        state: MapEditorState;
      };
      const intake = TestBed.inject(TextureIntakeService);
      vi.spyOn(intake, 'takeIn').mockResolvedValue({ identifier: 'added-texture' } as never);
      dressed.addFaceTexture('wall');

      await dressed.onFaceTextureFileSelected({
        target: { files: [new File([new Uint8Array([1])], 'x.png')], value: 'x' },
      } as unknown as Event);

      expect(dressed.state.functionSpec().terrain.images.wall).toBe('added-texture');
    });

    it('wears nothing where the crop was left unfinished', async () => {
      const dressed = component as unknown as {
        addFaceTexture: (face: 'wall') => void;
        onFaceTextureFileSelected: (event: Event) => Promise<void>;
        state: MapEditorState;
      };
      const intake = TestBed.inject(TextureIntakeService);
      vi.spyOn(intake, 'takeIn').mockResolvedValue(null);
      dressed.addFaceTexture('wall');

      await dressed.onFaceTextureFileSelected({
        target: { files: [new File([new Uint8Array([1])], 'x.png')], value: 'x' },
      } as unknown as Event);

      expect(dressed.state.functionSpec().terrain.images.wall).toBe('');
    });

    it('takes up a picture already kept rather than keeping it twice', () => {
      imageStorage.get.mockReturnValue({ identifier: 'already-kept' });
      const add = vi.fn();
      (imageStorage as unknown as { add: unknown }).add = add;

      dresser().chooseFaceTexture('wall', 'assets/images/walls/wall_brick.webp');

      expect(add).not.toHaveBeenCalled();
      expect(dresser().state.functionSpec().terrain.images.wall).toBe('already-kept');
    });
  });

  describe('the yes-or-no settings of the terrain brush', () => {
    const FLAGS = [
      'blocksSight',
      'blocksLight',
      'blocksClimb',
      'tiledTexture',
      'showsGrid',
      'dropShadow',
      'surfaceShading',
    ] as const;

    function state(): MapEditorState {
      return (component as unknown as { state: MapEditorState }).state;
    }

    function boxes(): HTMLInputElement[] {
      return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="checkbox"]'));
    }

    beforeEach(async () => {
      state().functionRole.set('terrain');
      await fixture.whenStable();
    });

    it('stand as checkboxes in their order, each showing what the brush holds', async () => {
      const held = FLAGS.map((flag) => state().functionSpec().terrain[flag]);

      expect(
        boxes()
          .slice(-FLAGS.length)
          .map((box) => box.checked)
      ).toEqual(held);
    });

    it('each write the one setting they stand for', async () => {
      for (const [index, flag] of FLAGS.entries()) {
        const before = { ...state().functionSpec().terrain };
        const box = boxes().slice(-FLAGS.length)[index];

        box.click();
        await fixture.whenStable();

        expect(state().functionSpec().terrain).toEqual({ ...before, [flag]: !before[flag] });
      }
    });
  });
});

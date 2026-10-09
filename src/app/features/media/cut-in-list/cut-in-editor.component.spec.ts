import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLauncher } from '@axe/domain/media/cut-in-launcher';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import { CutInEditorComponent } from '@axe/features/media/cut-in-list/cut-in-editor.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CutInEditorComponent', () => {
  let component: CutInEditorComponent;
  let fixture: ComponentFixture<CutInEditorComponent>;
  let cutIn: CutIn;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CutInEditorComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    const objectStore = TestBed.inject(ObjectStore);
    cutIn = new CutIn('cut-in-under-edit');
    cutIn.imageIdentifier = '';
    cutIn.initialize();
    objectStore.add(cutIn);

    fixture = TestBed.createComponent(CutInEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('cutIn', cutIn);
    fixture.componentRef.setInput('isEditable', true);
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('trying a cut-in out as somebody', () => {
    function withLayer(fields: Partial<CutInLayer>): { scene: CutInScene; layer: CutInLayer } {
      const scene = new CutInScene();
      scene.initialize();
      scene.cutInIdentifier = cutIn.identifier;
      const layer = new CutInLayer();
      layer.initialize();
      Object.assign(layer, fields);
      scene.appendChild(layer);
      return { scene, layer };
    }

    it('asks who to play it as only where its layers show a portrait or a name', () => {
      const { scene } = withLayer({ kind: 'text', text: 'ふつうの文' });
      try {
        fixture.componentRef.setInput('cutIn', null);
        fixture.detectChanges();
        fixture.componentRef.setInput('cutIn', cutIn);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="cut-in-try-speaker"]')).toBeNull();
      } finally {
        scene.destroy();
      }
    });

    it('plays it for the character chosen, with the portrait they are showing', () => {
      const { scene } = withLayer({ kind: 'text', text: '{character}、参戦！' });
      const hero = GameCharacter.create('ヒロ', 1, 'hero-face');
      const launcher = new CutInLauncher('CutInLauncher');
      launcher.initialize();
      const start = vi.spyOn(launcher, 'startCutInMySelf').mockImplementation(() => {});
      try {
        fixture.componentRef.setInput('cutIn', null);
        fixture.detectChanges();
        fixture.componentRef.setInput('cutIn', cutIn);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('[data-testid="cut-in-try-speaker"]')).not.toBeNull();

        component.trySpeakerId.set(hero.identifier);
        component.previewCutIn();

        expect(start).toHaveBeenCalledWith(cutIn, {
          characterId: hero.identifier,
          imageIdentifier: 'hero-face',
          name: 'ヒロ',
        });
      } finally {
        hero.destroy();
        launcher.destroy();
        scene.destroy();
      }
    });
  });

  describe('the picture it shows for a cut-in', () => {
    it('asks for a picture rather than showing a broken one where none is set', () => {
      expect(component.cutInImageUrl()).toBe('');
      expect(fixture.nativeElement.querySelector('img')).toBeNull();
      expect(fixture.nativeElement.querySelector('.material-icons')?.textContent).toBe('add_photo_alternate');
    });

    it('shows the picture once one is set', () => {
      TestBed.inject(ImageStorage).add('a-picture');
      cutIn.imageIdentifier = 'a-picture';
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('img')).not.toBeNull();
    });
  });
});

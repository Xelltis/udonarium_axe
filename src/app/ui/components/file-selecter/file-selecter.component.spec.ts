import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';

describe('FileSelecterComponent', () => {
  let component: FileSelecterComponent;
  let fixture: ComponentFixture<FileSelecterComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [FileSelecterComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FileSelecterComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('the pictures it offers', () => {
    function put(identifier: string, tag: string): void {
      const file = TestBed.inject(ImageStorage).add(identifier);
      ImageTag.create(file.identifier).tag = tag;
    }

    it('offers what a person put there', () => {
      put('a-drawing', 'コマ');

      expect(component.getAllImage().map((image) => image.identifier)).toContain('a-drawing');
    });

    it('keeps back what the tool brought with it, whatever language the screen is in', () => {
      // The tag is a stored word shared round the room, not the word for it on this screen,
      // so matching it against a translation would leave these on show for half the world.
      put('a-die-face', SYSTEM_RESERVED_TAG);

      expect(component.getAllImage().map((image) => image.identifier)).not.toContain('a-die-face');
      expect(component.tagList).not.toContain(SYSTEM_RESERVED_TAG);
    });

    describe('one the master is keeping back', () => {
      function playing(role: PeerRole): void {
        PeerCursor.createMyCursor().role = role;
      }

      beforeEach(() => {
        const secret = TestBed.inject(ImageStorage).add('the-twist');
        ImageTag.create(secret.identifier).isSecret = true;
      });

      afterEach(() => {
        PeerCursor.myCursor = null!;
      });

      it('is not offered to a player', () => {
        playing(PeerRole.Player);

        expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-twist');
      });

      it('is not offered to a guest either', () => {
        playing(PeerRole.Guest);

        expect(component.getAllImage().map((image) => image.identifier)).not.toContain('the-twist');
      });

      it('is offered to the master', () => {
        playing(PeerRole.GameMaster);

        expect(component.getAllImage().map((image) => image.identifier)).toContain('the-twist');
      });

      it('offers no tag that holds nothing but what is kept back', () => {
        ImageTag.get('the-twist').tag = '仕掛け';
        playing(PeerRole.Player);

        expect(component.tagList).not.toContain('仕掛け');
      });

      it('offers the tag where something under it is there to be picked', () => {
        ImageTag.get('the-twist').tag = '仕掛け';
        put('a-hint', '仕掛け');
        playing(PeerRole.Player);

        expect(component.tagList).toContain('仕掛け');
      });
    });
  });
});

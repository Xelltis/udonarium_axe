import { ComponentFixture, TestBed } from '@angular/core/testing';
import { localDispatch } from '@axe/core/network/network-messaging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ControllerInputComponent } from '@axe/features/controller/controller-input/controller-input.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ControllerInputComponent', () => {
  let component: ControllerInputComponent;
  let fixture: ComponentFixture<ControllerInputComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [ControllerInputComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ControllerInputComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('moves a whisper onto the cursor its target came back on, once the one it left is taken away', () => {
    const before = new PeerCursor('bob-before');
    before.initialize();
    before.userId = 'user-bob';
    const after = new PeerCursor('bob-after');
    after.initialize();
    after.userId = 'user-bob';
    try {
      component.sendTo.set('bob-before');

      ObjectStore.instance.remove(before);
      localDispatch('DELETE_GAME_OBJECT', { aliasName: PeerCursor.aliasName, identifier: 'bob-before' }, 'peer-b');

      expect(component.sendTo()).toBe('bob-after');
    } finally {
      ObjectStore.instance.remove(after);
    }
  });

  describe('signal-driven CD', () => {
    it('holds the sender in a model signal', () => {
      expect(typeof component.sendFrom).toBe('function');
    });

    it('holds the portrait index in a linked one', () => {
      expect(typeof component.portraitIndex).toBe('function');
    });

    it('computes the image', () => {
      expect(typeof component.imageFile).toBe('function');
    });

    it('computes the characters', () => {
      expect(typeof component.gameCharacters).toBe('function');
      expect(Array.isArray(component.gameCharacters())).toBe(true);
    });
  });
});

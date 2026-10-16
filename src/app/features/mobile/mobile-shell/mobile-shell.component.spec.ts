import { TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { MobileShellComponent } from '@axe/features/mobile/mobile-shell/mobile-shell.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MobileShellComponent', () => {
  beforeEach(() => {
    PeerCursor.createMyCursor();
    TestBed.configureTestingModule({ imports: [MobileShellComponent], providers: [...TEST_PROVIDERS] });
  });

  it('offers a guest neither its characters nor what only those playing may do, as the desktop menu does', () => {
    const shell = TestBed.createComponent(MobileShellComponent).componentInstance as unknown as {
      sharedItems: () => { action: string }[];
      offersCharacters: () => boolean;
    };
    const actions = () => shell.sharedItems().map((item) => item.action);
    expect(actions()).toEqual(
      expect.arrayContaining(['effect', 'hand', 'zipLoad', 'importCharacter', 'createObject', 'activePalette'])
    );
    expect(shell.offersCharacters()).toBe(true);

    PeerCursor.myCursor.role = PeerRole.Guest;
    TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);

    for (const action of ['effect', 'hand', 'zipLoad', 'importCharacter', 'createObject', 'activePalette']) {
      expect(actions()).not.toContain(action);
    }
    expect(actions()).toContain('jukebox');
    expect(shell.offersCharacters()).toBe(false);
  });
});

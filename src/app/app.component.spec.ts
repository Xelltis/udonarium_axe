import { TestBed } from '@angular/core/testing';
import { AppComponent } from '@axe/app.component';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { version } from '@pkg';

describe('AppComponent', () => {
  // Booting the screen brings the room's own objects into being — the chat tabs, the config,
  // the table selecter — which the next spec file in this worker would otherwise inherit.
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('should be defined', () => {
    expect(AppComponent).toBeTruthy();
  });

  it('resolves the version string from package.json through the @pkg alias', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+(-.+)?$/);
  });

  it('draws the menu drawer on a wide screen', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-fab-drawer [data-testid="fab-toggle"]')).toBeTruthy();
  });
});

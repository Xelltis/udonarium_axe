import { TestBed } from '@angular/core/testing';
import { AppComponent } from '@axe/app.component';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { AppInitializationService } from '@axe/composition/app-initialization.service';
import { APP_PROVIDERS } from '@axe/composition/app-providers';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

describe('the providers the app starts with', () => {
  // Building the screen brings the room's own objects into being, which the next spec file in this
  // worker would otherwise inherit.
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
  });

  it('build what runs before the first screen, with no service waiting on itself', () => {
    TestBed.configureTestingModule({ providers: APP_PROVIDERS });

    expect(TestBed.inject(LanguageService)).toBeTruthy();
    expect(TestBed.inject(AppInitializationService)).toBeTruthy();
    expect(TestBed.inject(StartRoomService)).toBeTruthy();
  });

  it('build the screen itself and everything it starts', () => {
    TestBed.configureTestingModule({ imports: [AppComponent], providers: APP_PROVIDERS });

    expect(TestBed.createComponent(AppComponent).componentInstance).toBeTruthy();
  });
});

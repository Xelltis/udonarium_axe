import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ImageTag, SYSTEM_RESERVED_TAG } from '@axe/domain/media/image-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { DeckBuilderDialogComponent } from '@axe/features/card/deck-builder-dialog/deck-builder-dialog.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('DeckBuilderDialogComponent', () => {
  let component: DeckBuilderDialogComponent;
  let fixture: ComponentFixture<DeckBuilderDialogComponent>;

  function playing(role: PeerRole): void {
    PeerCursor.createMyCursor().role = role;
  }

  function put(identifier: string, tag: string, secret = false): void {
    const file = TestBed.inject(ImageStorage).add(identifier);
    const imageTag = ImageTag.create(file.identifier);
    imageTag.tag = tag;
    imageTag.isSecret = secret;
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [DeckBuilderDialogComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    fixture = TestBed.createComponent(DeckBuilderDialogComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('counts the pictures under a tag', () => {
    playing(PeerRole.Player);
    put('deck-one', '手札');
    put('deck-two', '手札');

    component.selectedTag.set('手札');

    expect(component.cardCount()).toBe(2);
  });

  it('holds back making the deck until a tag that holds pictures is picked', () => {
    playing(PeerRole.Player);
    put('deck-one', '手札');
    fixture.detectChanges();
    const make = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[type="submit"]')!;

    expect(make.textContent).toContain('山札を作る');
    expect(make.disabled).toBe(true);

    component.selectedTag.set('手札');
    fixture.detectChanges();

    expect(make.disabled).toBe(false);
  });

  it('does not deal a player a picture the master is keeping back', () => {
    playing(PeerRole.Player);
    put('deck-plain', '手札');
    put('deck-kept-back', '手札', true);

    component.selectedTag.set('手札');

    expect(component.imagesOf('手札').map((image) => image.identifier)).toEqual(['deck-plain']);
  });

  it('deals the master the whole tag', () => {
    playing(PeerRole.GameMaster);
    put('deck-plain', '手札');
    put('deck-kept-back', '手札', true);

    expect(
      component
        .imagesOf('手札')
        .map((image) => image.identifier)
        .sort()
    ).toEqual(['deck-plain', 'deck-kept-back'].sort());
  });

  it('offers no tag that holds nothing but what is kept back', () => {
    playing(PeerRole.Player);
    put('deck-kept-back', '仕掛け', true);
    put('deck-plain', '手札');

    expect(component.tags()).toEqual(['手札']);
  });

  it('never offers the tag the tool keeps for itself', () => {
    playing(PeerRole.GameMaster);
    put('deck-die-face', SYSTEM_RESERVED_TAG);

    expect(component.tags()).not.toContain(SYSTEM_RESERVED_TAG);
  });
});

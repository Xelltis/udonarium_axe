import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { ModelTag } from '@axe/domain/media/model-tag';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ModelLibraryComponent } from '@axe/features/media/model-library/model-library.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelLibraryComponent', () => {
  const oakId = 'a'.repeat(64);
  const chairId = 'b'.repeat(64);
  let fixture: ComponentFixture<ModelLibraryComponent>;
  let shown: string[];

  /** Holds a model here in full, under a name. */
  function hold(identifier: string, name: string): void {
    TestBed.inject(ModelStorage).add({
      identifier,
      name,
      type: 'model/gltf-binary',
      blob: new Blob([new Uint8Array([1])]),
      url: '',
    });
  }

  function open(): HTMLElement {
    fixture = TestBed.createComponent(ModelLibraryComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const names = (host: HTMLElement) =>
    [...host.querySelectorAll('[data-testid="model-library-model"]')].map((model) => model.getAttribute('aria-label'));

  const press = (host: HTMLElement, testId: string, index = 0) => {
    (host.querySelectorAll(`[data-testid="${testId}"]`)[index] as HTMLElement).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    shown = [];
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: SnackbarService, useValue: { show: (text: string) => shown.push(text) } },
      ],
    });
    hold(oakId, 'oak.glb');
    hold(chairId, 'chair.glb');
    ModelTag.tagWith(oakId, '自然');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const identifier of [oakId, chairId]) TestBed.inject(ModelStorage).delete(identifier);
    for (const object of ObjectStore.instance.getObjects(ModelTag)) ObjectStore.instance.remove(object);
    for (const object of ObjectStore.instance.getObjects(GameCharacter)) ObjectStore.instance.remove(object);
  });

  it('lists the models held here by name, each with its tag, and only those of the tag chosen', () => {
    const host = open();
    expect(names(host)).toEqual(['chair', 'oak']);

    press(host, 'model-library-tag');

    expect(names(host)).toEqual(['oak']);
  });

  it('offers no pill for a tag left empty, as one cleared or one whose tag never came', () => {
    ModelTag.tagWith(chairId, '');
    const host = open();

    expect(
      [...host.querySelectorAll('[data-testid="model-library-tag"]')].map((pill) => pill.textContent?.trim())
    ).toEqual(['自然']);
    expect(names(host)).toEqual(['chair', 'oak']);
  });

  it('tags the ticked models with the tag typed', () => {
    const host = open();
    (host.querySelectorAll('[data-testid="model-library-tick"]')[0] as HTMLInputElement).click();
    fixture.detectChanges();
    const tag = host.querySelector('[data-testid="model-library-new-tag"]') as HTMLInputElement;
    tag.value = '家具';
    tag.dispatchEvent(new Event('input'));

    press(host, 'model-library-tag-checked');

    expect(ModelTag.get(chairId)?.tag).toBe('家具');
    expect(ModelTag.get(oakId)?.tag).toBe('自然');
  });

  it('shows the model pressed, ticking nothing, and puts it on the pieces chosen on the table', () => {
    const piece = GameCharacter.create('騎士', 1, '');
    TestBed.inject(SelectionSignalService).replaceSelection([piece.identifier]);
    const host = open();

    press(host, 'model-library-show', 1);
    expect(
      [...host.querySelectorAll<HTMLInputElement>('[data-testid="model-library-tick"]')].some((tick) => tick.checked)
    ).toBe(false);
    expect(host.querySelector('[data-testid="model-library-chosen"]')).not.toBeNull();
    press(host, 'model-library-put-on');

    expect(piece.modelIdentifier).toBe(oakId);
    expect(shown).toHaveLength(1);
  });

  it('offers to put the model on nothing while nothing is chosen on the table', () => {
    const host = open();
    press(host, 'model-library-show');

    expect((host.querySelector('[data-testid="model-library-put-on"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('removes the ticked models it may from the room, after asking, and only the one shown while none is ticked', () => {
    const remove = vi.spyOn(TestBed.inject(AssetRemovalService), 'removeAfterAsking').mockResolvedValue(0);
    vi.spyOn(TestBed.inject(AssetRemovalService), 'removable').mockImplementation((_kind, ids) => [...ids]);
    const host = open();
    press(host, 'model-library-show', 0);
    press(host, 'model-library-show', 1);

    press(host, 'model-library-remove');
    expect(remove).toHaveBeenLastCalledWith('model', [oakId]);

    (host.querySelectorAll('[data-testid="model-library-tick"]')[0] as HTMLInputElement).click();
    fixture.detectChanges();
    press(host, 'model-library-remove');
    expect(remove).toHaveBeenLastCalledWith('model', [chairId]);
  });

  it('follows a tag changed on a model, its pill and its list', () => {
    const host = open();

    ModelTag.tagWith(oakId, '樹木');
    TestBed.inject(ObjectChangeService).notifyChanged(ModelTag.get(oakId)!.identifier);
    fixture.detectChanges();

    expect(
      [...host.querySelectorAll('[data-testid="model-library-tag"]')].map((pill) => pill.textContent?.trim())
    ).toEqual(['樹木']);
  });

  it('offers nothing to change to a seat that only watches', () => {
    vi.spyOn(PeerCursor, 'myRole', 'get').mockReturnValue(PeerRole.Guest);
    const host = open();

    expect(names(host)).toEqual(['chair', 'oak']);
    expect(host.querySelector('[data-testid="model-library-file"]')).toBeNull();
    expect(host.querySelector('[data-testid="model-library-tag-checked"]')).toBeNull();
    expect(host.querySelector('[data-testid="model-library-tick"]')).toBeNull();
    press(host, 'model-library-show');
    expect(host.querySelector('[data-testid="model-library-put-on"]')).toBeNull();
  });
});

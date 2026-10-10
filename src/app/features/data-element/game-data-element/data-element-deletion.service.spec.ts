import { TestBed } from '@angular/core/testing';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { DataElement, DataElementAttribute, DataElementRole } from '@axe/domain/data/data-element';
import { DataElementDeletionService } from '@axe/features/data-element/game-data-element/data-element-deletion.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function buildGroup(): { parent: DataElement; hp: DataElement } {
  const parent = DataElement.create('リソース', '', { [DataElementAttribute.ROLE]: DataElementRole.GROUP });
  const hp = DataElement.create('HP', 10, { [DataElementAttribute.ROLE]: DataElementRole.FIELD });
  parent.appendChild(hp);
  parent.appendChild(DataElement.create('MP', 5, { [DataElementAttribute.ROLE]: DataElementRole.FIELD }));
  return { parent, hp };
}

const names = (parent: DataElement) => parent.children.map((child) => (child as DataElement).name);

describe('DataElementDeletionService', () => {
  let service: DataElementDeletionService;
  let snackbar: SnackbarService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(DataElementDeletionService);
    snackbar = TestBed.inject(SnackbarService);
  });

  afterEach(() => snackbar.dismiss());

  it('deletes at once, and says so by name', () => {
    const { parent, hp } = buildGroup();

    service.delete(hp);

    expect(names(parent)).toEqual(['MP']);
    expect(snackbar.current()?.message).toContain('HP');
    expect(snackbar.current()?.action).toBeDefined();
  });

  it('puts the element back where it was from the notice', () => {
    const { parent, hp } = buildGroup();
    service.delete(hp);

    snackbar.runAction();

    expect(names(parent)).toEqual(['HP', 'MP']);
  });

  it('tells whoever deleted it of the copy put back', () => {
    const { hp } = buildGroup();
    const onRestored = vi.fn();
    service.delete(hp, onRestored);

    snackbar.runAction();

    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ name: 'HP' }));
  });

  it('still deletes one without a parent element, with nothing to put back', () => {
    const loose = DataElement.create('孤立', 1);

    service.delete(loose);

    expect(snackbar.current()).toBeNull();
  });
});

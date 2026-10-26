import { TestBed } from '@angular/core/testing';
import { DataElement } from '@axe/domain/data/data-element';
import { ElementTemplateMenuComponent } from '@axe/features/data-element/game-data-element/element-template-menu.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ElementTemplateMenuComponent', () => {
  let templates: DataElement[];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ElementTemplateMenuComponent], providers: [...TEST_PROVIDERS] });
    templates = [DataElement.create('能力値', ''), DataElement.create('技能', '')];
  });

  afterEach(() => {
    for (const template of templates) template.destroy();
  });

  function drawn(open: boolean) {
    const fixture = TestBed.createComponent(ElementTemplateMenuComponent);
    fixture.componentRef.setInput('templates', templates);
    fixture.componentInstance.open.set(open);
    fixture.detectChanges();
    return fixture;
  }

  it('draws nothing while it is closed', () => {
    expect((drawn(false).nativeElement as HTMLElement).querySelector('.elm-template-menu')).toBeNull();
  });

  it('hands back the template chosen to be put in, and the one chosen to be deleted', () => {
    const fixture = drawn(true);
    const inserted: DataElement[] = [];
    const removed: DataElement[] = [];
    fixture.componentInstance.insert.subscribe((template) => inserted.push(template));
    fixture.componentInstance.remove.subscribe((template) => removed.push(template));
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.elm-template-menu > div');

    rows[0].querySelectorAll('button')[0].click();
    rows[1].querySelectorAll('button')[1].click();

    expect(inserted).toEqual([templates[0]]);
    expect(removed).toEqual([templates[1]]);
  });

  it('keeps a press on the delete button from reaching what is under it', () => {
    const fixture = drawn(true);
    const reached = vi.fn();
    (fixture.nativeElement as HTMLElement).addEventListener('click', reached);

    (fixture.nativeElement as HTMLElement)
      .querySelectorAll('.elm-template-menu > div')[0]
      .querySelectorAll('button')[1]
      .click();

    expect(reached).not.toHaveBeenCalled();
  });
});

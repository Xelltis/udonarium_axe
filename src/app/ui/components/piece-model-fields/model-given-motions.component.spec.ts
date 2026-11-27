import { TestBed } from '@angular/core/testing';
import { ModelMotionFilesService } from '@axe/application/tabletop/model-motion-files.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { ModelGivenMotionsComponent } from '@axe/ui/components/piece-model-fields/model-given-motions.component';

describe('ModelGivenMotionsComponent', () => {
  let given: { identifier: string; name: string; url: string }[];
  let mayGive: boolean;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ModelGivenMotionsComponent], providers: [...TEST_PROVIDERS] });
    given = [{ identifier: 'wave', name: 'Wave', url: 'blob:wave' }];
    mayGive = true;
    const motions = TestBed.inject(ModelMotionFilesService);
    vi.spyOn(motions, 'givenTo').mockImplementation(() => given);
    vi.spyOn(motions, 'givable').mockImplementation(() => [{ identifier: 'bow', name: 'Bow' }]);
    vi.spyOn(motions, 'canGive').mockImplementation(() => mayGive);
  });

  afterEach(() => vi.restoreAllMocks());

  async function shown() {
    const fixture = TestBed.createComponent(ModelGivenMotionsComponent);
    fixture.componentRef.setInput('modelIdentifier', 'avatar');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists what the VRM is given, gives it one chosen and takes one back', async () => {
    const motions = TestBed.inject(ModelMotionFilesService);
    const give = vi.spyOn(motions, 'give').mockReturnValue(true);
    const takeBack = vi.spyOn(motions, 'takeBack').mockReturnValue(true);
    const element = await shown();

    expect(element.querySelector('[data-testid="model-given-motion"]')?.textContent).toContain('Wave');
    const choice = element.querySelector<HTMLSelectElement>('[data-testid="model-give-motion"]')!;
    expect([...choice.options].map((option) => option.textContent?.trim())).toEqual(['動き（.vrma）を足す…', 'Bow']);
    choice.selectedIndex = 1;
    choice.dispatchEvent(new Event('change'));
    element.querySelector<HTMLButtonElement>('[data-testid="model-given-motion-take-back"]')!.click();

    expect(give).toHaveBeenCalledWith('avatar', 'bow');
    expect(takeBack).toHaveBeenCalledWith('avatar', 'wave');
  });

  it('only shows them to a seat that may not change the table', async () => {
    mayGive = false;
    const element = await shown();

    expect(element.querySelector('[data-testid="model-given-motion"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="model-give-motion"]')).toBeNull();
    expect(element.querySelector('[data-testid="model-given-motion-take-back"]')).toBeNull();
  });

  it('says one given whose bytes are not here yet is coming', async () => {
    given = [{ identifier: 'wave', name: 'Wave', url: '' }];
    const element = await shown();

    expect(element.querySelector('[data-testid="model-given-motion"]')?.textContent).toContain('取得中');
  });
});

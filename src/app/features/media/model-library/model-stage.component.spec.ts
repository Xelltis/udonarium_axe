import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MODEL_VIEWER_LOADER } from '@axe/application/media/model-viewer-loader';
import { ModelStageComponent } from '@axe/features/media/model-library/model-stage.component';
import type { ModelStage } from '@axe/infrastructure/model-viewer/model-viewer-port';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ModelStageComponent', () => {
  let fixture: ComponentFixture<ModelStageComponent>;
  let asked: { url: string; settle: (shown: boolean) => void }[];

  beforeEach(async () => {
    asked = [];
    const stage: ModelStage = {
      show: (url) => new Promise<boolean>((settle) => asked.push({ url, settle })),
      turnBy: () => {},
      setTurning: () => {},
      resize: () => {},
      facesNear: () => new Map(),
      showFaces: () => {},
      dispose: () => {},
    };
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: MODEL_VIEWER_LOADER,
          useValue: async () => ({ createModelStage: () => stage, createModelPainter: () => null }),
        },
      ],
    });
    fixture = TestBed.createComponent(ModelStageComponent);
    fixture.componentRef.setInput('url', 'blob:a');
    fixture.detectChanges();
    await vi.waitFor(() => expect(asked).toHaveLength(1));
  });

  const stateShown = () =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="model-stage-state"]')?.textContent?.trim() ??
    'shown';

  const showUrl = async (url: string, count: number) => {
    fixture.componentRef.setInput('url', url);
    fixture.detectChanges();
    await vi.waitFor(() => expect(asked).toHaveLength(count));
  };

  it('is settled only by the model asked for last, though one asked for before it comes later', async () => {
    await showUrl('blob:b', 2);
    await showUrl('blob:a', 3);

    asked[1].settle(true);
    asked[0].settle(false);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(stateShown()).toContain('読み込み中');

    asked[2].settle(true);
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(stateShown()).toBe('shown');
    });
  });
});

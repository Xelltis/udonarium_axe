import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GameObject } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { EffectPresetSet } from '@axe/domain/effect/effect-preset-set';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { expectClosesForAGuest } from '@axe/testing/closes-for-a-guest';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('EffectPresetEditorComponent', () => {
  let fixture: ComponentFixture<EffectPresetEditorComponent>;
  let preset: EffectPreset;
  let change: ObjectChangeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectPresetEditorComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(EffectPresetEditorComponent);
    change = TestBed.inject(ObjectChangeService);

    preset = new EffectPreset();
    preset.name = '爆炎';
    preset.kind = 'burst';
    preset.tagName = '炎';
    ObjectStore.instance.add(preset, false);
    fixture.componentInstance.presetIdentifier.set(preset.identifier);
  });

  afterEach(() => {
    ObjectStore.instance.remove(preset);
  });

  function text(): string {
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  it('closes once its seat is made a guest, who may no longer write what it writes', () => {
    expectClosesForAGuest(() => TestBed.createComponent(EffectPresetEditorComponent));
  });

  it('says so when the preset is not there', () => {
    fixture.componentInstance.presetIdentifier.set('');
    fixture.detectChanges();

    expect(text()).toContain('エフェクトが見つかりません');
  });

  it('edits the name and the colour', () => {
    fixture.detectChanges();

    const name = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[name="effect-name"]')!;
    name.value = '大爆発';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(preset.name).toBe('大爆発');
  });

  it('hides the fields the kind has no use for', () => {
    fixture.detectChanges();
    // An explosion has neither a number of shots nor a line of attack.
    expect(text()).not.toContain('弾数');
    expect(text()).not.toContain('太刀筋');

    preset.kind = 'projectile';
    change.notifyChanged(preset.identifier);
    fixture.detectChanges();

    expect(text()).toContain('弾数');
    expect(text()).toContain('着弾演出');
  });

  it('shows the limit only for something that takes several targets', () => {
    fixture.detectChanges();
    expect(text()).not.toContain('上限');

    preset.targeting = 'multi';
    change.notifyChanged(preset.identifier);
    fixture.detectChanges();

    expect(text()).toContain('上限');
  });

  it('says so when a test fire has nothing to aim at', () => {
    fixture.detectChanges();

    const preview = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')
    ).find((button) => button.textContent?.includes('試し撃ち'))!;
    preview.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.notice()).toContain('対象がいません');
  });

  describe('building a run out of stages', () => {
    function component(): {
      addStage(role: string): void;
      moveStage(index: number, offset: number): void;
      removeStage(index: number): void;
      editStage(index: number, patch: Record<string, unknown>): void;
      addBranch(index: number, role: string): void;
      stages(): { role: string; kind: string }[];
    } {
      return fixture.componentInstance as unknown as ReturnType<typeof component>;
    }

    it('draws one look until a stage is added', () => {
      fixture.detectChanges();

      expect(component().stages()).toEqual([]);
      expect(preset.isStaged).toBe(false);
    });

    it('writes an added stage onto the effect', () => {
      fixture.detectChanges();

      component().addStage('travel');

      expect(preset.isStaged).toBe(true);
      expect(preset.stageList[0]).toMatchObject({ role: 'travel', kind: 'projectile' });
    });

    it('reads the run back in the order it happens', () => {
      fixture.detectChanges();
      component().addStage('travel');
      component().addStage('impact');

      component().moveStage(0, 1);

      expect(
        component()
          .stages()
          .map((stage) => stage.role)
      ).toEqual(['impact', 'travel']);
    });

    it('takes a stage out again', () => {
      fixture.detectChanges();
      component().addStage('travel');

      component().removeStage(0);

      expect(preset.isStaged).toBe(false);
    });

    it('puts the look back where it no longer suits the role', () => {
      fixture.detectChanges();
      component().addStage('travel');

      component().editStage(0, { role: 'field' });

      expect(component().stages()[0].kind).toBe('flame');
    });

    it('gives a stage that throws something to throw', () => {
      fixture.detectChanges();

      component().addStage('spawn');

      expect(preset.stageList[0].children).toHaveLength(1);
      expect(preset.stageList[0].branches).toBe(3);
    });

    it('adds to the chain each branch follows', () => {
      fixture.detectChanges();
      component().addStage('spawn');

      component().addBranch(0, 'travel');

      expect(preset.stageList[0].children?.map((child) => child.role)).toEqual(['impact', 'travel']);
    });

    it('tells the room every time the run changes', () => {
      const notify = vi.spyOn(change, 'notifyChanged');
      fixture.detectChanges();

      component().addStage('impact');

      expect(notify).toHaveBeenCalledWith(preset.identifier);
    });

    describe('what a spawn throws, through the screen', () => {
      /** A branch is the row marked as one, which is what the screen draws beneath a spawn. */
      function branchRows(): HTMLElement[] {
        return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('i'))
          .filter((icon) => (icon.textContent ?? '').includes('subdirectory_arrow_right'))
          .map((icon) => icon.closest('div') as HTMLElement);
      }

      beforeEach(() => {
        // The spawn is second on purpose: the screen has to name which stage it is editing.
        preset.stages = JSON.stringify([
          { role: 'travel', kind: 'projectile', durationMs: 400 },
          {
            role: 'spawn',
            kind: 'burst',
            durationMs: 120,
            branches: 3,
            spreadDeg: 120,
            children: [{ role: 'impact', kind: 'burst', durationMs: 300 }],
          },
        ]);
        fixture.detectChanges();
      });

      it('shows the chain each branch follows', () => {
        expect(branchRows()).toHaveLength(1);
      });

      it('takes a branch out from its own row', () => {
        branchRows()[0].querySelector('button')?.click();
        fixture.detectChanges();

        expect(preset.stageList[1].children).toEqual([]);
        expect(preset.stageList[0].kind).toBe('projectile');
      });

      it('adds to the chain from the buttons beneath it', () => {
        // The buttons under the spawn add to the branch, not to the run itself.
        const spawnBlock = branchRows()[0].parentElement as HTMLElement;
        const add = Array.from(spawnBlock.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
          (button.textContent ?? '').trim().startsWith('＋運び')
        );

        add?.click();
        fixture.detectChanges();

        expect(preset.stageList[1].children?.map((child) => child.role)).toEqual(['impact', 'travel']);
      });
    });
  });

  it('hands this one effect on by itself', () => {
    const saved: { object: GameObject; name: string }[] = [];
    const save = TestBed.inject(SaveDataService);
    vi.spyOn(save, 'saveGameObjectAsync').mockImplementation((object: GameObject, name?: string) => {
      saved.push({ object, name: name ?? '' });
      return Promise.resolve();
    });
    fixture.detectChanges();

    const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((element) =>
      (element.textContent ?? '').includes('書き出す')
    )!;
    button.click();

    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('effect_爆炎');
    expect((saved[0].object as EffectPresetSet).innerXml()).toContain(preset.identifier);
  });

  it('lets a length be typed out before it is held to what can be drawn', () => {
    // Taken at every keystroke, the 5 of 500 would be pulled up to the shortest stage there is.
    preset.stages = JSON.stringify([{ role: 'impact', kind: 'burst', durationMs: 400 }]);
    fixture.detectChanges();

    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type=number]')!;
    input.value = '5';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(preset.stageList[0].durationMs).toBe(400);

    input.value = '500';
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(preset.stageList[0].durationMs).toBe(500);
  });
});

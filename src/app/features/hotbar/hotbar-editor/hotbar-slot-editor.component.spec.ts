import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarSlot } from '@axe/domain/hotbar/hotbar-slot';
import { HOTBAR_SLOT_KINDS } from '@axe/domain/hotbar/hotbar-slot-kind';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { HotbarSlotEditorComponent } from '@axe/features/hotbar/hotbar-editor/hotbar-slot-editor.component';
import { HotbarRunnerService } from '@axe/features/hotbar/hotbar-runner.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('HotbarSlotEditorComponent', () => {
  let fixture: ComponentFixture<HotbarSlotEditorComponent>;
  let component: HotbarSlotEditorComponent;
  let store: ObjectStore;
  let character: GameCharacter;
  let hotbar: Hotbar;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function click(testId: string): void {
    root().querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)!.click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HotbarSlotEditorComponent], providers: [...TEST_PROVIDERS] });
    store = ObjectStore.instance;
    fixture = TestBed.createComponent(HotbarSlotEditorComponent);
    component = fixture.componentInstance;

    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    character = GameCharacter.create('術者', 1, '');
    character.addExtendData();
    hotbar = TestBed.inject(HotbarStoreService).ensureOwn()!;
    component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('sound'));
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    store.clearDeleteHistory();
  });

  it('offers every kind a slot can be', () => {
    const options = [...root().querySelectorAll<HTMLOptionElement>('[data-testid="hotbar-editor-kind"] option')];

    expect(options.map((option) => option.value)).toEqual([...HOTBAR_SLOT_KINDS]);
  });

  it('opens on the settings the slot already holds', () => {
    component.setFrom(
      { page: 1, slotIndex: 3 },
      { ...emptyHotbarSlotDraft('prefill'), value: '/w gm 準備できました', label: '耳打ち' }
    );
    fixture.detectChanges();

    const kind = root().querySelector<HTMLSelectElement>('[data-testid="hotbar-editor-kind"]')!;
    const label = root().querySelector<HTMLInputElement>('[data-testid="hotbar-editor-label"]')!;
    const argument = root().querySelector<HTMLTextAreaElement>('[data-testid="hotbar-editor-argument"]')!;

    expect(kind.value).toBe('prefill');
    expect(label.value).toBe('耳打ち');
    expect(argument.value).toBe('/w gm 準備できました');
  });

  it('offers the lines already written in the palette of the character it speaks as', () => {
    character.chatPalette!.setPalette('◆戦闘\n2d6+3 攻撃\n//威力=7\n\n1d100<={威力}');
    TestBed.inject(ChatSpeakerService).set(character.identifier);
    component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('chat'));
    fixture.detectChanges();

    const picker = root().querySelector<HTMLSelectElement>('[data-testid="hotbar-editor-palette"]')!;
    const lines = [...picker.querySelectorAll('optgroup option')].map((option) => option.textContent?.trim());

    expect(picker.querySelector('optgroup')?.label).toBe('戦闘');
    expect(lines).toEqual(['2d6+3 攻撃', '1d100<={威力}']);
  });

  it('takes a palette line into the box, leaving it there to be worked on', () => {
    character.chatPalette!.setPalette('2d6+3 攻撃');
    TestBed.inject(ChatSpeakerService).set(character.identifier);
    component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('chat'));
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);

    const picker = root().querySelector<HTMLSelectElement>('[data-testid="hotbar-editor-palette"]')!;
    picker.value = '2d6+3 攻撃';
    picker.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const argument = root().querySelector<HTMLTextAreaElement>('[data-testid="hotbar-editor-argument"]')!;
    expect(argument.value).toBe('2d6+3 攻撃');

    click('hotbar-editor-save');
    expect(hotbar.slotAt(1, 3)?.argument).toBe('2d6+3 攻撃');
  });

  it('leaves the picker away for a kind that says nothing', () => {
    character.chatPalette!.setPalette('2d6+3 攻撃');
    TestBed.inject(ChatSpeakerService).set(character.identifier);
    component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('effect'));
    fixture.detectChanges();

    expect(root().querySelector('[data-testid="hotbar-editor-palette"]')).toBeNull();
  });

  it('writes a slot down before any room has been joined', () => {
    PeerCursor.myCursor.userId = '';
    vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);
    const argument = root().querySelector<HTMLTextAreaElement>('[data-testid="hotbar-editor-argument"]')!;
    argument.value = 'dice-roll';
    argument.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    click('hotbar-editor-save');

    expect(hotbar.slotAt(1, 3)?.argument).toBe('dice-roll');
  });

  it('writes the slot into the place it was opened for', () => {
    const close = vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);
    const argument = root().querySelector<HTMLTextAreaElement>('[data-testid="hotbar-editor-argument"]')!;
    argument.value = 'dice-roll';
    argument.dispatchEvent(new Event('input'));
    const label = root().querySelector<HTMLInputElement>('[data-testid="hotbar-editor-label"]')!;
    label.value = '合図';
    label.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    click('hotbar-editor-save');

    const slot = hotbar.slotAt(1, 3);
    expect(slot?.argument).toBe('dice-roll');
    expect(slot?.label).toBe('合図');
    expect(close).toHaveBeenCalled();
  });

  it('starts a kind again on its own options when the kind is changed', () => {
    const select = root().querySelector<HTMLSelectElement>('[data-testid="hotbar-editor-kind"]')!;
    select.value = 'cutIn';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);

    click('hotbar-editor-save');

    expect(hotbar.slotAt(1, 3)?.options).toEqual({ kind: 'cutIn', soundOnly: false });
  });

  it('empties the place it was opened for', () => {
    vi.spyOn(TestBed.inject(PanelService), 'close').mockImplementation(() => undefined);
    click('hotbar-editor-save');
    expect(hotbar.slotAt(1, 3)).not.toBeNull();

    click('hotbar-editor-clear');

    expect(hotbar.slotAt(1, 3)).toBeNull();
  });

  it('keeps a trial out of the room, so no peer hears of it', () => {
    TestBed.inject(ChatSpeakerService).set(character.identifier);
    vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });
    const before = store.getObjects(HotbarSlot).length;

    click('hotbar-editor-try');

    expect(store.getObjects(HotbarSlot).length).toBe(before);
  });

  it('tries a draft out without writing it down', () => {
    TestBed.inject(ChatSpeakerService).set(character.identifier);
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    click('hotbar-editor-try');

    expect(run).toHaveBeenCalledOnce();
    expect(hotbar.slotAt(1, 3) ?? null).toBeNull();
  });

  describe('a multi-action', () => {
    function fillBar(...values: string[]): void {
      values.forEach((value, index) => {
        const draft = emptyHotbarSlotDraft('prefill');
        draft.value = value;
        hotbar.put(0, index, draft);
      });
    }

    function openGroup(): void {
      component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('group'));
      fixture.detectChanges();
    }

    function steps(): { slotIdentifier: string; delayMs: number }[] {
      const options = component.draft().payload;
      return options.kind === 'group' ? options.steps : [];
    }

    function rows(): HTMLElement[] {
      return [...root().querySelectorAll<HTMLElement>('[data-testid="hotbar-editor-step-row"]')];
    }

    function chooseAll(): void {
      for (const box of [...root().querySelectorAll<HTMLInputElement>('[data-testid="hotbar-editor-step"]')]) {
        box.click();
      }
      fixture.detectChanges();
    }

    it('lists what was chosen in the order it will run', () => {
      fillBar('一つ目', '二つ目', '三つ目');
      openGroup();

      chooseAll();

      expect(rows()).toHaveLength(3);
      expect(rows().map((row) => row.textContent?.includes('一つ目'))[0]).toBe(true);
    });

    it('lets the reader put the steps in any order', () => {
      fillBar('一つ目', '二つ目');
      openGroup();
      chooseAll();
      const first = steps()[0].slotIdentifier;

      root().querySelectorAll<HTMLButtonElement>('[data-testid="hotbar-editor-step-down"]')[0].click();
      fixture.detectChanges();

      expect(steps()[1].slotIdentifier).toBe(first);
    });

    it('gives each step a wait of its own, the first running on the press', () => {
      fillBar('一つ目', '二つ目');
      openGroup();
      chooseAll();

      expect(steps().map((step) => step.delayMs)).toEqual([0, 300]);

      const delay = root().querySelectorAll<HTMLInputElement>('[data-testid="hotbar-editor-step-delay"]')[0];
      delay.value = '900';
      delay.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(steps().map((step) => step.delayMs)).toEqual([0, 900]);
    });

    it('knows its steps again after the bar was read in afresh', () => {
      fillBar('一つ目', '二つ目');
      openGroup();
      chooseAll();
      const chosen = steps().map((step) => step.delayMs);

      // Reading a bar in from a file makes every slot again, under new identifiers.
      const values = ['一つ目', '二つ目'];
      values.forEach((value, index) => {
        const draft = emptyHotbarSlotDraft('prefill');
        draft.value = value;
        hotbar.put(0, index, draft);
      });
      fixture.detectChanges();

      expect(rows().map((row) => row.textContent?.includes('無くなった'))).toEqual([false, false]);
      expect(steps().map((step) => step.delayMs)).toEqual(chosen);
      const boxes = [...root().querySelectorAll<HTMLInputElement>('[data-testid="hotbar-editor-step"]')];
      expect(boxes.map((box) => box.checked)).toEqual([true, true]);
    });

    it('writes down which slot each step means when it is saved', () => {
      fillBar('一つ目', '二つ目');
      openGroup();
      chooseAll();
      const values = ['一つ目', '二つ目'];
      values.forEach((value, index) => {
        const draft = emptyHotbarSlotDraft('prefill');
        draft.value = value;
        hotbar.put(0, index, draft);
      });
      fixture.detectChanges();

      click('hotbar-editor-save');

      const saved = hotbar.slotAt(1, 3)!.options;
      const named = saved.kind === 'group' ? saved.steps.map((step) => step.slotIdentifier) : [];
      expect(named).toEqual([hotbar.slotAt(0, 0)!.identifier, hotbar.slotAt(0, 1)!.identifier]);
    });

    it('takes a step out of the run', () => {
      fillBar('一つ目', '二つ目');
      openGroup();
      chooseAll();

      root().querySelectorAll<HTMLButtonElement>('[data-testid="hotbar-editor-step-drop"]')[1].click();
      fixture.detectChanges();

      expect(steps()).toHaveLength(1);
    });
  });

  describe('an effect slot', () => {
    it('offers to pay no heed to what is targeted, and remembers the answer', () => {
      const draft = emptyHotbarSlotDraft('effect');
      draft.value = '守り';
      component.setFrom({ page: 1, slotIndex: 3 }, draft);
      fixture.detectChanges();

      const box = root().querySelector<HTMLInputElement>('[data-testid="hotbar-editor-effect-on-self"]')!;
      expect(box.checked).toBe(false);

      box.click();
      fixture.detectChanges();

      const options = component.draft().payload;
      expect(options.kind === 'effect' && options.onSelf).toBe(true);
    });

    it('lists the effects with the mark of each, in place of a plain list, and takes the one clicked', () => {
      const presets = ['爆炎', '氷結'].map((name) => {
        const preset = new EffectPreset();
        preset.name = name;
        ObjectStore.instance.add(preset, false);
        return preset;
      });
      onTestFinished(() => presets.forEach((preset) => ObjectStore.instance.remove(preset)));
      component.setFrom({ page: 1, slotIndex: 3 }, emptyHotbarSlotDraft('effect'));
      fixture.detectChanges();
      const options = () => [
        ...root().querySelectorAll<HTMLButtonElement>('[data-testid="hotbar-editor-effects"] [role="option"]'),
      ];

      expect(options()).toHaveLength(2);
      expect(options().every((option) => option.querySelector('svg') !== null)).toBe(true);
      expect(root().querySelector('[data-testid="hotbar-editor-choice"]')).toBeNull();

      const picked = options()[1];
      picked.click();
      fixture.detectChanges();

      expect(component.draft().value).toBe(picked.textContent!.trim());
      expect(options()[1].getAttribute('aria-selected')).toBe('true');
      expect(options()[0].getAttribute('aria-selected')).toBe('false');
    });

    it('asks nothing of a mode that has no targets to ignore', () => {
      const draft = emptyHotbarSlotDraft('effect');
      draft.payload = { kind: 'effect', mode: 'field', onSelf: false };
      component.setFrom({ page: 1, slotIndex: 3 }, draft);
      fixture.detectChanges();

      expect(root().querySelector('[data-testid="hotbar-editor-effect-on-self"]')).toBeNull();
    });
  });
});

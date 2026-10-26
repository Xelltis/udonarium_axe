import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActiveCharacterService } from '@axe/application/character/active-character.service';
import { ChatSpeakerService } from '@axe/application/chat/chat-speaker.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { HotbarStoreService } from '@axe/application/hotbar/hotbar-store.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { HotbarPreferenceService } from '@axe/application/ui/hotbar-preference.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Hotbar } from '@axe/domain/hotbar/hotbar';
import { emptyHotbarSlotDraft } from '@axe/domain/hotbar/hotbar-draft';
import { HotbarSet } from '@axe/domain/hotbar/hotbar-set';
import { HOTBAR_SLOTS_PER_PAGE } from '@axe/domain/hotbar/hotbar-size';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { HotbarService } from '@axe/features/hotbar/hotbar.service';
import { HotbarBarComponent } from '@axe/features/hotbar/hotbar-bar/hotbar-bar.component';
import { HotbarRunnerService } from '@axe/features/hotbar/hotbar-runner.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { Z_CONTEXT_MENU_PINNED, Z_HOTBAR } from '@axe/ui/z-layers';

describe('HotbarBarComponent', () => {
  let fixture: ComponentFixture<HotbarBarComponent>;
  let widgets: WidgetVisibilityService;
  let preference: HotbarPreferenceService;

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function bar(): HTMLElement | null {
    return root().querySelector('[data-testid="hotbar"]');
  }

  function slots(): HTMLButtonElement[] {
    return [...root().querySelectorAll<HTMLButtonElement>('[data-testid="hotbar-slot"]')];
  }

  function ownedCharacter(name: string): GameCharacter {
    const character = GameCharacter.create(name, 1, '');
    character.owner = PeerCursor.myCursor.userId;
    TestBed.inject(ActiveCharacterService).select(character.identifier);
    return character;
  }

  /** Presses one slot, travels far enough to mean it, and lets go over another. */
  function dragSlot(from: number, to: number): void {
    const target = slots()[to];
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    slots()[from].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    slots()[from].dispatchEvent(new PointerEvent('pointermove', { clientX: 60, clientY: 0 }));
    slots()[from].dispatchEvent(new PointerEvent('pointerup', { clientX: 60, clientY: 0 }));
    fixture.detectChanges();
  }

  function fillSlot(character: GameCharacter, slotIndex: number, value: string): void {
    const draft = emptyHotbarSlotDraft('sound');
    draft.value = value;
    draft.label = '合図';
    draft.characterIdentifier = character.identifier;
    ownHotbar().put(preference.page(), slotIndex, draft);
  }

  function ownHotbar(): Hotbar {
    return TestBed.inject(HotbarStoreService).ensureOwn()!;
  }

  beforeEach(() => {
    localStorage.removeItem('ui-widgets');
    localStorage.removeItem('ui-hotbar');
    TestBed.configureTestingModule({ imports: [HotbarBarComponent], providers: [...TEST_PROVIDERS] });
    widgets = TestBed.inject(WidgetVisibilityService);
    preference = TestBed.inject(HotbarPreferenceService);

    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.role = PeerRole.Player;

    fixture = TestBed.createComponent(HotbarBarComponent);
    widgets.hotbar.set(true);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    PeerCursor.myCursor = null!;
    localStorage.removeItem('ui-widgets');
    localStorage.removeItem('ui-hotbar');
  });

  it('loads a chosen file as a fresh load, whatever was answered to the one before', async () => {
    const reloadCheck = new ReloadCheck('ReloadCheck');
    reloadCheck.initialize();
    const start = vi.spyOn(reloadCheck, 'reloadCheckStart');
    const load = vi
      .spyOn(TestBed.inject(FileArchiver), 'load')
      .mockResolvedValue({ dataRead: true, images: [], audios: [] });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['<hotbar-set/>'], 'hotbar.xml')] });

    await (fixture.componentInstance as unknown as { loadFile(event: Event): Promise<void> }).loadFile({
      target: input,
    } as unknown as Event);

    expect(start).toHaveBeenCalledTimes(1);
    expect(start.mock.invocationCallOrder[0]).toBeLessThan(load.mock.invocationCallOrder[0]);
    reloadCheck.destroy();
  });

  it('stays out of the way until it is asked for', () => {
    widgets.hotbar.set(false);
    fixture.detectChanges();

    expect(bar()).toBeNull();
  });

  it('lays out a slot for every number key', () => {
    expect(bar()).not.toBeNull();
    expect(slots()).toHaveLength(HOTBAR_SLOTS_PER_PAGE);
    expect(slots().map((slot) => slot.textContent?.trim().slice(-1))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
    ]);
  });

  it('shows what a filled slot holds, and marks the rest empty', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 2, 'dice-roll');
    fixture.detectChanges();

    expect(slots()[2].dataset.filled).toBe('true');
    expect(slots()[2].textContent).toContain('合図');
    expect(slots()[0].dataset.filled).toBe('false');
  });

  it('draws a slot saved after the bar was already up', async () => {
    const character = ownedCharacter('術者');
    fixture.detectChanges();
    expect(slots()[5].dataset.filled).toBe('false');

    fillSlot(character, 5, 'dice-roll');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(slots()[5].dataset.filled).toBe('true');
  });

  it('draws every slot saved after the first, not only the one that made the bar', async () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 2, '一つ目');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(slots()[2].dataset.filled).toBe('true');

    fillSlot(character, 5, '二つ目');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(slots()[5].dataset.filled).toBe('true');
    expect(slots()[2].dataset.filled).toBe('true');
  });

  it('drops a slot again once it is emptied', async () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 6, 'dice-roll');
    fixture.detectChanges();

    ownHotbar().clear(preference.page(), 6);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(slots()[6].dataset.filled).toBe('false');
  });

  it('runs a slot as the character it names, whoever is being controlled', () => {
    const speaker = ownedCharacter('術者');
    const other = GameCharacter.create('別のコマ', 1, '');
    other.owner = 'me';
    const draft = emptyHotbarSlotDraft('sound');
    draft.value = 'dice-roll';
    draft.characterIdentifier = other.identifier;
    ownHotbar().put(preference.page(), 7, draft);
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[7].click();

    expect(run.mock.calls[0][1]).toBe(other);
    expect(run.mock.calls[0][1]).not.toBe(speaker);
  });

  it("refuses a slot whose piece is not the reader's to work, rather than acting as somebody else", () => {
    const speaker = ownedCharacter('術者');
    const theirs = GameCharacter.create('ゴブリンA', 1, '');
    theirs.owner = 'someone-else';
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    draft.characterIdentifier = theirs.identifier;
    draft.characterName = 'ゴブリンA';
    ownHotbar().put(preference.page(), 7, draft);
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[7].click();

    expect(run).not.toHaveBeenCalled();
    expect(speaker).toBeTruthy();
  });

  /**
   * A piece this reader may work that is not the one the chat speaks as, settled on the table.
   *
   * The tabletop service only announces the collection when a piece moves, and it treats a
   * piece it has never seen as having moved. Left fresh, the first change to it would reach
   * the bar through the collection and hide whether the bar watches the piece itself.
   */
  async function settledCharacter(name: string): Promise<GameCharacter> {
    const character = GameCharacter.create(name, 1, '');
    character.owner = PeerCursor.myCursor.userId;
    character.setLocation('table');
    await fixture.whenStable();
    return character;
  }

  function bindSlot(character: GameCharacter, slotIndex: number): void {
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    draft.characterIdentifier = character.identifier;
    draft.characterName = character.name;
    ownHotbar().put(preference.page(), slotIndex, draft);
    fixture.detectChanges();
  }

  function cellsOf(): { actor: unknown; actorName: string }[] {
    return (fixture.componentInstance as unknown as { cells: () => { actor: unknown; actorName: string }[] }).cells();
  }

  it('draws the piece a slot names by the name it goes by now', async () => {
    ownedCharacter('術者');
    const bound = await settledCharacter('斥候');
    bindSlot(bound, 4);
    await fixture.whenStable();
    expect(cellsOf()[4].actorName).toBe('斥候');

    bound.name = '斥候長';
    await fixture.whenStable();

    expect(cellsOf()[4].actorName).toBe('斥候長');
  });

  it('drops the piece a slot names from the cell once it may no longer be worked', async () => {
    ownedCharacter('術者');
    const bound = await settledCharacter('斥候');
    bindSlot(bound, 5);
    await fixture.whenStable();
    expect(cellsOf()[5].actor).toBe(bound);

    bound.owner = 'someone-else';
    await fixture.whenStable();

    expect(cellsOf()[5].actor).toBeNull();
  });

  it('keeps a slot pointing at the piece it names while that piece is still in the room', () => {
    ownedCharacter('術者');
    const theirs = GameCharacter.create('ゴブリンA', 1, '');
    theirs.owner = 'someone-else';
    const mine = GameCharacter.create('ゴブリンA', 1, '');
    mine.owner = 'me';
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6+3 攻撃';
    draft.characterIdentifier = theirs.identifier;
    draft.characterName = 'ゴブリンA';
    const slot = ownHotbar().put(preference.page(), 7, draft);
    fixture.detectChanges();

    slots()[7].click();

    expect(slot?.characterIdentifier).toBe(theirs.identifier);
  });

  it('runs a slot whose piece was made again, finding it by the name it kept', () => {
    const character = ownedCharacter('術者');
    const draft = emptyHotbarSlotDraft('sound');
    draft.value = 'dice-roll';
    draft.characterIdentifier = 'from-another-room';
    draft.characterName = '術者';
    ownHotbar().put(preference.page(), 2, draft);
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[2].click();

    expect(run.mock.calls[0][1]).toBe(character);
    expect(ownHotbar().slotAt(preference.page(), 2)?.characterIdentifier).toBe(character.identifier);
  });

  it('names on the slot the character it acts as', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 8, 'dice-roll');
    fixture.detectChanges();

    expect(slots()[8].querySelector('[data-testid="hotbar-slot-actor"]')?.textContent).toContain('術者');
  });

  it('keeps its slots whichever character is taken up', () => {
    const first = ownedCharacter('一人目');
    fillSlot(first, 1, 'dice-roll');
    fixture.detectChanges();
    expect(slots()[1].dataset.filled).toBe('true');

    const second = GameCharacter.create('二人目', 1, '');
    second.owner = 'me';
    TestBed.inject(ActiveCharacterService).select(second.identifier);
    fixture.detectChanges();

    expect(slots()[1].dataset.filled).toBe('true');
  });

  it('runs what a slot holds when it is pressed', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 1, 'dice-roll');
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[1].click();

    expect(run).toHaveBeenCalledOnce();
    expect(run.mock.calls[0][1]).toBe(character);
  });

  it('says nothing to the room when a slot cannot run, and marks the slot instead', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 1, 'dice-roll');
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: false, reason: 'notFound' });

    slots()[1].click();
    fixture.detectChanges();

    expect(slots()[1].className).toContain('animate-hit-flash');
  });

  it('runs a slot that names nobody as whoever the chat speaks as', () => {
    const speaking = GameCharacter.create('発言者', 1, '');
    TestBed.inject(ChatSpeakerService).set(speaking.identifier);
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6';
    ownHotbar().put(preference.page(), 9, draft);
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[9].click();

    expect(run.mock.calls[0][1]).toBe(speaking);
  });

  it('does not run a slot that names nobody while the chat speaks as no piece', () => {
    TestBed.inject(ChatSpeakerService).set(PeerCursor.myCursor.identifier);
    const draft = emptyHotbarSlotDraft('chat');
    draft.value = '2d6';
    ownHotbar().put(preference.page(), 9, draft);
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[9].click();
    fixture.detectChanges();

    expect(run).not.toHaveBeenCalled();
    expect(slots()[9].className).toContain('animate-hit-flash');
  });

  it('opens the editor when an empty slot is pressed', async () => {
    ownedCharacter('術者');
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({ setFrom: vi.fn() } as never);

    slots()[4].click();

    await vi.waitFor(() => expect(open).toHaveBeenCalled());
  });

  it('trades two slots when one is dragged onto the other', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, '一つ目');
    fillSlot(character, 3, '四つ目');
    fixture.detectChanges();

    dragSlot(0, 3);

    expect(ownHotbar().slotAt(preference.page(), 3)?.argument).toBe('一つ目');
    expect(ownHotbar().slotAt(preference.page(), 0)?.argument).toBe('四つ目');
  });

  it('leaves a slot where it is when the press hardly moves, and fires it instead', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, 'dice-roll');
    fixture.detectChanges();
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

    slots()[0].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 10, clientY: 10 }));
    slots()[0].dispatchEvent(new PointerEvent('pointermove', { clientX: 12, clientY: 11 }));
    slots()[0].dispatchEvent(new PointerEvent('pointerup', { clientX: 12, clientY: 11 }));
    slots()[0].click();

    expect(run).toHaveBeenCalled();
    expect(ownHotbar().slotAt(preference.page(), 0)?.argument).toBe('dice-roll');
  });

  it('opens the editor on an empty slot even after a drag was let go of outside the bar', async () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, 'dice-roll');
    fixture.detectChanges();
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
    slots()[0].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    slots()[0].dispatchEvent(new PointerEvent('pointermove', { clientX: 90, clientY: 0 }));
    slots()[0].dispatchEvent(new PointerEvent('pointerup', { clientX: 90, clientY: 0 }));
    const open = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({ setFrom: vi.fn() } as never);

    slots()[4].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    slots()[4].click();

    await vi.waitFor(() => expect(open).toHaveBeenCalled());
  });

  it('lets a slot go when the browser takes the gesture away', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, 'dice-roll');
    fixture.detectChanges();

    slots()[0].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    slots()[0].dispatchEvent(new PointerEvent('pointermove', { clientX: 90, clientY: 0 }));
    slots()[0].dispatchEvent(new PointerEvent('pointercancel'));
    fixture.detectChanges();

    expect(slots()[0].className).not.toContain('opacity-50');
    const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });
    slots()[0].dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }));
    slots()[0].click();
    expect(run).toHaveBeenCalled();
  });

  it('opens the editor on the slot pressed and the page showing, with what the slot holds', async () => {
    ownedCharacter('術者');
    preference.gotoPage(1);
    fixture.detectChanges();
    const editor = { setFrom: vi.fn() };
    vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(editor as never);

    slots()[4].click();

    await vi.waitFor(() => expect(editor.setFrom).toHaveBeenCalled());
    expect(editor.setFrom).toHaveBeenCalledWith({ page: 1, slotIndex: 4 }, emptyHotbarSlotDraft());
  });

  it('opens the editor beside the slot it was opened for', async () => {
    ownedCharacter('術者');
    fixture.detectChanges();
    const slot = slots()[4];
    vi.spyOn(slot, 'getBoundingClientRect').mockReturnValue({
      left: 600,
      top: 700,
      right: 644,
      bottom: 744,
    } as DOMRect);
    const open = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({ setFrom: vi.fn() } as never);

    slot.click();

    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    expect(open.mock.calls[0][1]).toMatchObject({ left: 432, top: 172 });
  });

  it('empties a slot on a held press, and keeps it for bringing back', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 3, 'dice-roll');
    fixture.detectChanges();

    slots()[3].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    fixture.detectChanges();

    expect(ownHotbar().slotAt(preference.page(), 3)).toBeNull();
    expect(TestBed.inject(HotbarService).lastRemoved()?.draft.value).toBe('dice-roll');
  });

  it('opens a menu of its own on a slot', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, 'dice-roll');
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    slots()[0].dispatchEvent(menu);

    expect(open).toHaveBeenCalled();
    expect(menu.defaultPrevented).toBe(true);
  });

  describe('the number keys', () => {
    function press(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const event = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init });
      document.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    }

    it('fires the slot the number sits over', () => {
      const character = ownedCharacter('術者');
      fillSlot(character, 2, 'dice-roll');
      fixture.detectChanges();
      const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

      const event = press('Digit3');

      expect(run).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });

    it('turns the page when shift is held', () => {
      press('Digit3', { shiftKey: true });

      expect(preference.page()).toBe(2);
    });

    it('says nothing about an empty slot', () => {
      ownedCharacter('術者');
      fixture.detectChanges();
      const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

      press('Digit4');

      expect(run).not.toHaveBeenCalled();
    });

    it('keeps out of the way of someone typing', () => {
      const character = ownedCharacter('術者');
      fillSlot(character, 0, 'dice-roll');
      fixture.detectChanges();
      const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });
      const input = document.createElement('input');
      document.body.appendChild(input);

      const event = new KeyboardEvent('keydown', { code: 'Digit1', bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      fixture.detectChanges();
      input.remove();

      expect(run).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('does nothing at all while the bar is put away', () => {
      const character = ownedCharacter('術者');
      fillSlot(character, 0, 'dice-roll');
      widgets.hotbar.set(false);
      fixture.detectChanges();
      const run = vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: true });

      press('Digit1');

      expect(run).not.toHaveBeenCalled();
    });
  });

  it('carries the bar out to a file from a button of its own', () => {
    const save = vi.spyOn(TestBed.inject(SaveDataService), 'saveGameObjectAsync').mockResolvedValue(undefined);

    root().querySelector<HTMLButtonElement>('[data-testid="hotbar-save"]')!.click();

    expect(save.mock.calls[0][0]).toBeInstanceOf(HotbarSet);
  });

  it('says why a slot would not run, where the keys are otherwise explained', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 1, 'dice-roll');
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(HotbarRunnerService), 'run').mockReturnValue({ ok: false, reason: 'noTab' });

    slots()[1].click();
    fixture.detectChanges();

    expect(root().querySelector('[data-testid="hotbar-reason"]')?.textContent?.trim()).toBe('チャットタブがありません');
    expect(root().querySelector('[data-testid="hotbar-hint"]')).toBeNull();
  });

  it('turns to another page and shows the slots that live there', () => {
    const character = ownedCharacter('術者');
    fillSlot(character, 0, 'on the first page');
    preference.gotoPage(1);
    fixture.detectChanges();

    expect(slots()[0].dataset.filled).toBe('false');

    const pips = [...root().querySelectorAll<HTMLButtonElement>('[data-testid="hotbar-page"]')];
    pips[0].click();
    fixture.detectChanges();

    expect(slots()[0].dataset.filled).toBe('true');
  });

  it('draws a slot registered while it is locked', async () => {
    const character = ownedCharacter('術者');
    preference.setLocked(true);
    fixture.detectChanges();

    fillSlot(character, 4, 'dice-roll');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(slots()[4].dataset.filled).toBe('true');
  });

  it('shows what the number keys do, in a word', () => {
    expect(root().querySelector('[data-testid="hotbar-hint"]')?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('holds still once it is locked, and moves again when it is not', () => {
    const held = root().querySelector<HTMLButtonElement>('[data-testid="hotbar-lock"]')!;

    held.click();
    fixture.detectChanges();
    expect(preference.locked()).toBe(true);

    held.click();
    fixture.detectChanges();
    expect(preference.locked()).toBe(false);
  });

  it('lifts the menu it opens above itself while it is pinned', () => {
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);

    bar()!.dispatchEvent(new MouseEvent('contextmenu'));
    expect(open.mock.calls[0][3]).toBeUndefined();

    preference.setPinned(true);
    fixture.detectChanges();
    bar()!.dispatchEvent(new MouseEvent('contextmenu'));

    expect(open.mock.calls[1][3]).toEqual({ layer: Z_CONTEXT_MENU_PINNED });
  });

  it('rises above everything only while it is pinned', () => {
    expect(Number(bar()!.style.zIndex)).toBe(Z_HOTBAR);

    preference.setPinned(true);
    fixture.detectChanges();

    expect(Number(bar()!.style.zIndex)).toBeGreaterThan(1899999);
  });

  it('opens the editor on the shelf just above wherever the bar is sitting', async () => {
    ownedCharacter('術者');
    fixture.detectChanges();
    const open = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue({ setFrom: vi.fn() } as never);

    slots()[4].click();
    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect((open.mock.calls[0][1] as { layer: number }).layer).toBe(Z_HOTBAR + 1);

    preference.setPinned(true);
    fixture.detectChanges();
    slots()[5].click();

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect((open.mock.calls[1][1] as { layer: number }).layer).toBeGreaterThan(1899999);
  });

  it('is not shown to someone who is only watching', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;
    fixture.detectChanges();

    expect(bar()).toBeNull();
  });
});

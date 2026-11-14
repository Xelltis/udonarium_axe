import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectCastService } from '@axe/application/effect/effect-cast.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { HotbarFillService } from '@axe/application/hotbar/hotbar-fill.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ContextMenuAction, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { EffectLibraryPanelComponent } from '@axe/features/effect/effect-library-panel/effect-library-panel.component';
import { EffectPresetEditorComponent } from '@axe/features/effect/effect-preset-editor/effect-preset-editor.component';
import { refuseLocalStorageOutright } from '@axe/testing/refused-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('EffectLibraryPanelComponent', () => {
  let fixture: ComponentFixture<EffectLibraryPanelComponent>;
  let preset: EffectPreset;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EffectLibraryPanelComponent],
      providers: [...TEST_PROVIDERS],
    });
    fixture = TestBed.createComponent(EffectLibraryPanelComponent);

    preset = new EffectPreset();
    preset.name = '爆炎';
    preset.tagName = '炎';
    ObjectStore.instance.add(preset, false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    ObjectStore.instance.remove(preset);
  });

  it('holds nothing ready for a guest, who shows nothing on anybody’s table', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    PeerCursor.createMyCursor().role = PeerRole.Guest;
    const panel = fixture.componentInstance as unknown as { choose(preset: EffectPreset): void };

    panel.choose(preset);
    expect(targeting.isPicking()).toBe(false);

    PeerCursor.myCursor.role = PeerRole.Player;
    panel.choose(preset);
    expect(targeting.isPicking()).toBe(true);
    targeting.cancel();
  });

  it('opens where the browser refuses to hand over its storage at all', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [EffectLibraryPanelComponent], providers: [...TEST_PROVIDERS] });
    refuseLocalStorageOutright();

    expect(() => TestBed.createComponent(EffectLibraryPanelComponent)).not.toThrow();
  });

  it('lists the effects that have been added', () => {
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('爆炎');
    expect(text).toContain('炎');
  });

  it('narrows the list by a search', () => {
    const other = new EffectPreset();
    other.name = '氷結';
    other.tagName = '氷';
    ObjectStore.instance.add(other, false);

    try {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('氷結');

      fixture.componentInstance.query.set('爆炎');
      fixture.detectChanges();

      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('爆炎');
      expect(text).not.toContain('氷結');
    } finally {
      ObjectStore.instance.remove(other);
    }
  });

  it('says why when the search finds nothing', () => {
    fixture.componentInstance.query.set('該当なし');
    fixture.detectChanges();

    expect(fixture.componentInstance.matchCount()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('一致するエフェクトがありません');
  });

  it('heads each family', () => {
    fixture.detectChanges();

    const headings = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('[role="button"]'));
    expect(headings.map((heading) => heading.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['expand_more 炎 1']);
  });

  it('folds a family away', () => {
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('爆炎');

    const heading = (fixture.nativeElement as HTMLElement).querySelector('[role="button"]');
    heading?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    // The heading stays and only the contents go.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('炎');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('爆炎');
  });

  it('hands an effect to the hotbar, under the name it goes by', () => {
    const fill = vi.spyOn(TestBed.inject(HotbarFillService), 'fill').mockReturnValue({ page: 0, slotIndex: 0 });
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { addToHotbar(preset: EffectPreset): void }).addToHotbar(preset);

    expect(fill.mock.calls[0][0]).toMatchObject({ kind: 'effect', value: '爆炎', valueName: '爆炎' });
  });

  it('counts and names every piece picked, a part picked with its body among them, though only the body is marked on the table', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    const body = GameCharacter.create('ドラゴン', 2, '');
    const part = GameCharacter.create('頭', 1, '');
    part.ridingOn = body.identifier;
    part.rideSeat = 'part';
    TestBed.inject(ObjectChangeService).notifyChanged(part.identifier);
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    try {
      targeting.begin(preset);
      targeting.pick(body.identifier);
      targeting.pick(part.identifier);

      expect(targeting.marks().map((mark) => mark.identifier)).toEqual([body.identifier]);
      expect(fixture.componentInstance.pickedNames()).toEqual(['ドラゴン', '頭']);
    } finally {
      targeting.cancel();
      part.destroy();
      body.destroy();
    }
  });

  it('names a piece picked whose name is kept from the reader as no one in particular', () => {
    const targeting = TestBed.inject(EffectTargetingService);
    const masked = GameCharacter.create('黒幕', 1, '');
    masked.hideName = true;
    preset.targeting = 'multi';
    preset.maxTargets = 3;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    try {
      targeting.begin(preset);
      targeting.pick(masked.identifier);

      expect(fixture.componentInstance.pickedNames()).toEqual(['？？？']);
    } finally {
      targeting.cancel();
      masked.destroy();
    }
  });

  it('names a piece whose name is kept from the reader as no one in particular when aimed at or cast from', () => {
    const masked = GameCharacter.create('黒幕', 1, '');
    masked.hideName = true;
    masked.targeted = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canSeeHidden').mockReturnValue(false);
    TestBed.inject(SelectionSignalService).selectObject(masked.identifier, masked.aliasName);
    try {
      expect(fixture.componentInstance.targetChips().map((chip) => chip.name)).toEqual(['？？？']);
      expect(fixture.componentInstance.casterName()).toBe('？？？');
    } finally {
      masked.destroy();
    }
  });

  it('does nothing when it is fired with nothing to aim at', () => {
    fixture.detectChanges();

    const row = (fixture.nativeElement as HTMLElement).querySelector('li');
    row?.dispatchEvent(new MouseEvent('click'));
    fixture.detectChanges();

    expect(fixture.componentInstance.lastFired()).toBe('');
  });

  describe('holding an effect ready', () => {
    let targeting: EffectTargetingService;
    let selection: SelectionSignalService;
    let fired: MockInstance<EffectCastService['fire']>;
    let pieces: GameCharacter[];

    beforeEach(() => {
      targeting = TestBed.inject(EffectTargetingService);
      selection = TestBed.inject(SelectionSignalService);
      fired = vi.spyOn(TestBed.inject(EffectCastService), 'fire');
      preset.targeting = 'multi';
      preset.maxTargets = 2;
      pieces = ['ミナ', 'ゴブリン', 'オーク', 'ドラゴン'].map((name, index) => {
        const piece = GameCharacter.create(name, 1, '');
        piece.location.x = index * 200;
        piece.location.y = 0;
        return piece;
      });
    });

    afterEach(() => {
      targeting.cancel();
      for (const piece of pieces) piece.destroy();
    });

    function host(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function part(name: string): HTMLElement {
      return host().querySelector<HTMLElement>(`[data-testid="effect-library-${name}"]`)!;
    }

    function tile(): HTMLButtonElement {
      return Array.from(host().querySelectorAll<HTMLButtonElement>('[data-testid="effect-library-list"] button')).find(
        (button) => button.textContent?.includes('爆炎')
      )!;
    }

    function press(piece: GameCharacter): void {
      selection.selectObject(piece.identifier, piece.aliasName);
      TestBed.tick();
      fixture.detectChanges();
    }

    function chips(): string[] {
      return Array.from(host().querySelectorAll('[data-testid="effect-library-target-chip"]')).map(
        (chip) => chip.textContent?.trim() ?? ''
      );
    }

    /** The boxes whose sizes are fixed by their classes, as they are laid out now. */
    function layout(): string {
      const boxes = [
        'filters',
        'stance',
        'preview',
        'stance-name',
        'stance-caster',
        'stance-targets',
        'target-chips',
        'fire',
        'cancel',
        'list',
        'notice',
      ];
      return boxes.map((name) => `${name}:${part(name).className}`).join('\n');
    }

    it('lays out the same four regions, each of a fixed height, with nothing chosen, at no target, at one, at the limit and after the cast', () => {
      fixture.detectChanges();
      const regions = ['filters', 'stance', 'list', 'notice'].map((name) => part(name));
      const idle = layout();
      const sameRegions = () => {
        const now = Array.from(host().firstElementChild!.children);
        return now.length === regions.length && now.every((region, index) => region === regions[index]);
      };
      expect(regions.every((region) => region != null)).toBe(true);
      expect(sameRegions()).toBe(true);
      expect(part('stance').className.split(/\s+/)).toContain('shrink-0');
      expect(part('preview').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-22.5', 'w-32', 'shrink-0']));
      expect(part('stance-name').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0']));
      expect(part('stance-caster').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0']));
      expect(part('stance-targets').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-8.5', 'shrink-0']));
      expect(part('notice').className.split(/\s+/)).toEqual(expect.arrayContaining(['h-7', 'shrink-0', 'truncate']));
      expect(part('list').className.split(/\s+/)).toEqual(expect.arrayContaining(['flex-1', 'overflow-y-auto']));

      const steps: (() => void)[] = [
        () => tile().click(),
        () => press(pieces[1]),
        () => press(pieces[2]),
        () => part('fire').click(),
      ];
      for (const step of steps) {
        step();
        fixture.detectChanges();

        expect(sameRegions()).toBe(true);
        expect(layout()).toBe(idle);
      }
      expect(fired).toHaveBeenCalledTimes(1);
    });

    it('says to choose an effect in the same box while nothing is held ready, with its buttons there but unusable', () => {
      fixture.detectChanges();

      expect(part('stance').getAttribute('data-stance')).toBe('idle');
      expect(part('stance-name').textContent).toContain('エフェクトを選んでください');
      expect((part('fire') as HTMLButtonElement).disabled).toBe(true);
      expect((part('cancel') as HTMLButtonElement).disabled).toBe(true);
      expect(part('preview').children).toHaveLength(0);
    });

    it('holds the effect ready at a click of its tile without casting, and calls it off at a second click', () => {
      fixture.detectChanges();

      tile().click();
      fixture.detectChanges();

      expect(fired).not.toHaveBeenCalled();
      expect(targeting.preset()).toBe(preset);
      expect(part('stance').getAttribute('data-stance')).toBe('aiming');
      expect(part('stance-name').textContent).toContain('爆炎');
      expect(part('stance-count').textContent?.trim()).toBe('0/2');
      expect((part('fire') as HTMLButtonElement).disabled).toBe(true);
      expect((part('cancel') as HTMLButtonElement).disabled).toBe(false);

      tile().click();
      fixture.detectChanges();

      expect(targeting.isPicking()).toBe(false);
      expect(fired).not.toHaveBeenCalled();
    });

    it('holds an effect cast on yourself ready too, casting it only at the button', () => {
      preset.targeting = 'self';
      selection.selectObject(pieces[0].identifier, pieces[0].aliasName);
      TestBed.tick();
      fixture.detectChanges();

      tile().click();
      TestBed.tick();
      fixture.detectChanges();

      expect(fired).not.toHaveBeenCalled();
      expect(targeting.isPicking()).toBe(true);
      expect(chips()).toEqual(['ミナ']);

      part('fire').click();
      fixture.detectChanges();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(fired.mock.calls[0][1].map((target) => target.identifier)).toEqual([pieces[0].identifier]);
      expect(part('notice').textContent).toContain('ミナ');
    });

    it('casts nothing on the limit being filled, and once at its button, saying whom at on the line of notices', () => {
      fixture.detectChanges();
      tile().click();
      press(pieces[1]);
      press(pieces[2]);

      expect(part('stance-count').textContent?.trim()).toBe('2/2');
      expect(fired).not.toHaveBeenCalled();
      expect(targeting.isPicking()).toBe(true);

      part('fire').click();
      fixture.detectChanges();

      expect(fired).toHaveBeenCalledTimes(1);
      expect(targeting.isPicking()).toBe(false);
      expect(part('notice').textContent).toContain('ゴブリン');
      expect(part('notice').textContent).toContain('オーク');
    });

    it('calls the effect off at its cancel button', () => {
      fixture.detectChanges();
      tile().click();
      press(pieces[1]);

      part('cancel').click();
      fixture.detectChanges();

      expect(targeting.isPicking()).toBe(false);
      expect(pieces[1].targeted).toBe(false);
      expect(fired).not.toHaveBeenCalled();
    });

    it('shows the selected piece as the caster to be, and not as a target, before an effect is chosen', () => {
      press(pieces[0]);

      expect(part('stance-caster').textContent).toContain('撃ち手（予定）');
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');
      expect(chips()).toEqual([]);
      expect(part('stance-targets').textContent).toContain('なし');
    });

    it('names before an effect is chosen the pieces already aimed at, which it would start with', () => {
      pieces[2].targeted = true;
      fixture.detectChanges();

      expect(chips()).toEqual(['オーク']);
    });

    it('names the caster fixed when the effect was held ready, however many targets are pressed after', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();
      expect(part('stance-caster').textContent).not.toContain('予定');

      press(pieces[1]);
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');
      press(pieces[2]);
      expect(part('caster-name').textContent?.trim()).toBe('ミナ');

      expect(chips()).toEqual(['ゴブリン', 'オーク']);
      expect(fixture.componentInstance.casterName()).toBe('ミナ');
    });

    it('takes the next piece pressed as the caster once asked to change it, leaving it out of the targets', () => {
      press(pieces[0]);
      tile().click();
      press(pieces[1]);

      part('change-caster').click();
      fixture.detectChanges();
      expect(part('change-caster').getAttribute('aria-pressed')).toBe('true');
      expect(part('caster-name').textContent).toContain('卓のコマを押してください');

      press(pieces[3]);

      expect(part('caster-name').textContent?.trim()).toBe('ドラゴン');
      expect(part('change-caster').getAttribute('aria-pressed')).toBe('false');
      expect(chips()).toEqual(['ゴブリン']);
      expect(targeting.casterMark()?.identifier).toBe(pieces[3].identifier);
    });

    it('stops waiting for a caster at a second press of the button that asked for one', () => {
      fixture.detectChanges();
      tile().click();
      fixture.detectChanges();

      part('change-caster').click();
      part('change-caster').click();
      press(pieces[1]);

      expect(targeting.casterIdentifier()).toBe('');
      expect(chips()).toEqual(['ゴブリン']);
    });

    it('casts from no piece once the caster is set to none', () => {
      press(pieces[0]);
      tile().click();
      fixture.detectChanges();
      expect((part('no-caster') as HTMLButtonElement).disabled).toBe(false);

      part('no-caster').click();
      fixture.detectChanges();

      expect(targeting.casterIdentifier()).toBe('');
      expect(part('caster-name').textContent?.trim()).toBe('なし');
      expect((part('no-caster') as HTMLButtonElement).disabled).toBe(true);
    });

    it('names every target on one line that scrolls sideways, none shrunk, wrapped or folded into a count', () => {
      preset.maxTargets = 4;
      const names = ['とても長い名前のゴブリンの王', 'とても長い名前のオークの将軍', 'とても長い名前のドラゴンの長老'];
      pieces.slice(1).forEach((piece, index) => (piece.name = names[index]));
      fixture.detectChanges();
      tile().click();
      for (const piece of pieces.slice(1)) press(piece);
      const row = part('target-chips');

      expect(chips()).toEqual(names);
      expect(row.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['flex-nowrap', 'overflow-x-auto', 'overflow-y-hidden', 'min-w-0'])
      );
      for (const chip of Array.from(row.children)) {
        expect(chip.className.split(/\s+/)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
        expect(chip.className).not.toContain('truncate');
      }
      expect(row.textContent).not.toMatch(/\+\d/);
    });

    it('gives the buttons that cast and call off a height a finger can press on a touch screen', () => {
      fixture.detectChanges();

      for (const name of ['fire', 'cancel']) {
        expect(part(name).className.split(/\s+/)).toContain('pointer-coarse:h-11');
      }
    });

    it('lists the effects left standing in a headed group at the end of the list, where each can be taken away', () => {
      const fields = TestBed.inject(EffectFieldService);
      fixture.detectChanges();
      expect(host().querySelector('[data-testid="effect-library-fields"]')).toBeNull();

      const field = fields.place(preset, 0, 0, 0);
      fixture.detectChanges();
      try {
        const list = part('list');
        const group = part('fields');
        expect(list.lastElementChild).toBe(group);
        expect(group.previousElementSibling).toBe(part('fields-heading'));
        expect(part('fields-heading').textContent).toContain('置いてある演出');
        expect(group.textContent).toContain('爆炎');

        group.querySelector('button')!.click();
        fixture.detectChanges();

        expect(fields.fields()).toEqual([]);
        expect(host().querySelector('[data-testid="effect-library-fields"]')).toBeNull();
      } finally {
        if (fields.fields().includes(field)) field.destroy();
      }
    });

    it('says a notice and whom the last cast was at on the one line, the later of the two', () => {
      fixture.detectChanges();
      const line = part('notice');
      expect(line.textContent?.trim()).toBe('');

      fixture.componentInstance.notice.set('書き出しました');
      fixture.detectChanges();
      expect(part('notice')).toBe(line);
      expect(line.textContent?.trim()).toBe('書き出しました');

      tile().click();
      press(pieces[1]);
      part('fire').click();
      fixture.detectChanges();
      expect(part('notice')).toBe(line);
      expect(line.textContent).toContain('ゴブリン');
      expect(line.textContent).not.toContain('書き出しました');

      (fixture.componentInstance as unknown as { insertToken(preset: EffectPreset): void }).insertToken(preset);
      fixture.detectChanges();
      expect(line.textContent).not.toContain('ゴブリン');
      expect(host().querySelectorAll('[data-testid="effect-library-notice"]')).toHaveLength(1);
    });
  });

  it('opens the editor on an effect from “edit” in the right-click menu of its tile', () => {
    const open = vi.spyOn(TestBed.inject(ContextMenuService), 'open').mockImplementation(() => undefined);
    const editor = { presetIdentifier: { set: vi.fn() } };
    const openPanel = vi.spyOn(TestBed.inject(PanelService), 'open').mockReturnValue(editor as never);
    fixture.detectChanges();

    const tile = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('爆炎')
    )!;
    tile.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const menu = open.mock.calls[0][1] as ContextMenuAction[];
    menu.find((entry) => entry.name === '編集')!.action!();

    expect(openPanel).toHaveBeenCalledWith(EffectPresetEditorComponent, expect.anything());
    expect(editor.presetIdentifier.set).toHaveBeenCalledWith(preset.identifier);
  });
});
